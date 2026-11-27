import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import Rooms from './Rooms';
import { api } from '../lib/api';

vi.mock('../context/PropertyContext', () => ({ useProperty: () => ({ propertyId: 'property-1' }) }));
let canManage = false;
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => false, hasPermission: () => canManage }) }));
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

const room = { id: 'room-1', number: '101', roomTypeId: 'type-1', status: 'vacant_clean', floor: '1' };
let ownPhotos: object[];
let typePhotos: object[];
let roomTypes: object[];

function renderRooms() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<MemoryRouter initialEntries={['/rooms']}><QueryClientProvider client={client}><ToastProvider><Routes><Route path="/rooms/*" element={<Rooms />} /></Routes></ToastProvider></QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks(); canManage = false;
  ownPhotos = [];
  typePhotos = [{ id: 'type-photo', url: '/type.jpg', isPrimary: true }];
  roomTypes = [{ id: 'type-1', name: 'Family Apartment', maxOccupancy: 4, bedType: 'double' }];
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    const data = url === '/v1/rooms' ? [room]
      : url === '/v1/rooms/room-1' ? room
      : url === '/v1/rooms/types/type-1' ? roomTypes[0]
      : url === '/v1/rooms/types' ? roomTypes
      : url === '/v1/media' ? (config?.params.ownerType === 'room' ? ownPhotos : typePhotos)
      : [];
    return { data };
  });
});

describe('Room overview', () => {
  it('resolves type identity and media without opening the room, including the list view', async () => {
    renderRooms();
    const card = await screen.findByRole('button', { name: 'View 101 · Family Apartment' });
    expect(card).toHaveTextContent('Family Apartment');
    expect(card).toHaveTextContent('Up to 4 guests');
    expect(card).toHaveTextContent('Double');
    expect(card).toHaveTextContent('Vacant Clean');
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', '/type.jpg'));
    expect(api.get).toHaveBeenCalledWith('/v1/media', { params: { propertyId: 'property-1', ownerType: 'room_type', ownerId: 'type-1' } });
    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(await screen.findByRole('cell', { name: 'Family Apartment' })).toBeVisible();
  });

  it('prefers a room primary photo and falls back when it fails to load', async () => {
    ownPhotos = [{ id: 'other', url: '/other.jpg' }, { id: 'primary', url: '/room.jpg', isPrimary: true }];
    renderRooms();
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', '/room.jpg'));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img')).toHaveAttribute('src', '/type.jpg');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('No photo')).toBeVisible();
    expect(screen.getByText('Family Apartment')).toBeVisible();
  });

  it('opens the correct room with the keyboard without changing its status', async () => {
    renderRooms();
    const card = await screen.findByRole('button', { name: 'View 101 · Family Apartment' });
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Family Apartment' })).toBeVisible();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps a room identifiable when optional type details and photos are missing', async () => {
    roomTypes = [];
    typePhotos = [];
    renderRooms();
    expect(await screen.findByRole('button', { name: 'View 101 ·' })).toBeVisible();
    expect(await screen.findByText('No photo')).toBeVisible();
    expect(screen.getByText('Room type unavailable')).toBeVisible();
    expect(screen.queryByText(/Up to/)).not.toBeInTheDocument();
  });
});

  it('creates an individual room without asking for a room type and retains input after failure', async () => {
    canManage = true; renderRooms();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Room' }));
    await userEvent.type(screen.getByLabelText('Room name'), 'Garden room');
    await userEvent.type(screen.getByLabelText('Room number / label'), '201');
    await userEvent.type(screen.getByLabelText('Maximum guests'), '3');
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Creation failed'));
    await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Creation failed');
    expect(screen.getByLabelText('Room name')).toHaveValue('Garden room');
    expect(api.post).toHaveBeenCalledWith('/v1/rooms/individual', { propertyId: 'property-1', name: 'Garden room', number: '201', maxOccupancy: 3 });
    expect(screen.queryByLabelText('Room type')).not.toBeInTheDocument();
  });
