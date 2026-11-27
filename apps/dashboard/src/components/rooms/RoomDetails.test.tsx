import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoomDetails from './RoomDetails';
import { api } from '../../lib/api';
vi.mock('../../context/PropertyContext', () => ({ useProperty: () => ({ propertyId: 'property-1', currencyCode: 'GBP' }) }));
let allowed = true;
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasRole: (...roles: string[]) => allowed && roles.includes('admin'), hasPermission: () => allowed }) }));
vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }));
vi.mock('../media/MediaGallery', () => ({ default: ({ ownerType, ownerId, canManage }: any) => <div data-testid={`gallery-${ownerType}`}>{ownerId}{canManage && <button>Upload a file</button>}</div> }));
vi.mock('../property/BookingTermsEditor', () => ({ RateTermsEditor: ({ row }: any) => <p>Rate editor: {row.name}</p> }));
const room = { id: 'room-1', number: '101', roomTypeId: 'type-1', status: 'vacant_clean' };
const listing = { id: 'type-1', name: 'Garden room', maxOccupancy: 2, defaultOccupancy: 2, code: 'GARDEN', bedCount: 1, sortOrder: 0, amenities: ['WiFi'] };
let shared = false;
function open() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<MemoryRouter initialEntries={['/rooms/room-1']}><QueryClientProvider client={client}><Routes><Route path="/rooms/:id" element={<RoomDetails />} /><Route path="/rooms" element={<p>Room list</p>} /></Routes></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks(); allowed = true; shared = false;
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    const data = url === '/v1/rooms/room-1' ? room
      : url === '/v1/rooms/types/type-1' ? listing
      : url === '/v1/rooms' ? shared ? [room, { ...room, id: 'room-2' }] : [room]
      : url === '/v1/rooms/types/type-1/cleaning-fee' ? { amount: '0.00', currencyCode: null }
      : url === '/v1/rate-plans' ? [{ id: 'rate-1', roomTypeId: 'type-1', name: 'Garden nightly' }, { id: 'rate-2', roomTypeId: 'type-2', name: 'Other nightly' }]
      : url === '/v1/reservations' ? { data: config?.params.page === 1 ? [{ id: 'res-1', roomId: 'other', roomTypeId: 'type-2', arrivalDate: '2000-01-01', departureDate: '2100-01-01', confirmationNumber: 'OTHER' }] : [{ id: 'res-2', roomId: null, roomTypeId: 'type-1', arrivalDate: '2000-01-01', departureDate: '2100-01-01', confirmationNumber: 'GARDEN', status: 'confirmed' }], hasMore: config?.params.page === 1 }
      : [];
    return { data };
  });
  vi.mocked(api.post).mockResolvedValue({ data: [{ date: '2026-11-27', roomTypeId: 'type-1', available: 0 }] });
  vi.mocked(api.put).mockResolvedValue({ data: {} });
  vi.mocked(api.patch).mockImplementation(async (_url, patch) => ({ data: { ...listing, ...(patch as Record<string, unknown>) } }));
});
describe('Individual room page', () => {
  it('uses listing photos, only matching rates and paginated bookings, including an unassigned sole-room booking', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Garden room' })).toBeVisible();
    expect(screen.getByTestId('gallery-room_type')).toHaveTextContent('type-1');
    expect(screen.getByRole('button', { name: 'Upload a file' })).toBeVisible();
    expect(screen.queryByTestId('gallery-room')).not.toBeInTheDocument();
    expect(await screen.findByText('Rate editor: Garden nightly')).toBeVisible();
    expect(screen.queryByText('Rate editor: Other nightly')).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'GARDEN' })).toHaveAttribute('href', '/reservations/res-2?propertyId=property-1');
    expect(screen.queryByText('OTHER')).not.toBeInTheDocument();
    expect(await screen.findByText('Unavailable')).toBeVisible();
    expect(api.post).toHaveBeenCalledWith('/v1/reservations/search-availability', expect.objectContaining({ propertyId: 'property-1', roomTypeId: 'type-1' }));
    expect(api.patch).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
  });
  it('warns about shared listings and does not assign unallocated bookings to a physical room', async () => {
    shared = true; open();
    expect(await screen.findByText(/This listing is shared/)).toBeVisible();
    expect(await screen.findByText('No bookings for this room in these dates.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'GARDEN' })).not.toBeInTheDocument();
  });
  it('saves the fee against the listing and status against the physical room', async () => {
    open(); await screen.findByLabelText('Cleaning fee amount');
    await userEvent.clear(screen.getByLabelText('Cleaning fee amount'));
    await userEvent.type(screen.getByLabelText('Cleaning fee amount'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Save cleaning fee' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/v1/rooms/types/type-1/cleaning-fee', { amount: '25', currencyCode: 'GBP' }, { params: { propertyId: 'property-1' } }));
    await userEvent.selectOptions(screen.getByLabelText('Change room status'), 'vacant_dirty');
    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/v1/rooms/room-1/status', { status: 'vacant_dirty' }, { params: { propertyId: 'property-1' } }));
  });
  it('allows unrelated fee timestamp updates but rejects concurrent listing edits', async () => {
    open(); const name = await screen.findByLabelText('Room name');
    await userEvent.clear(name); await userEvent.type(name, 'New name');
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => url === '/v1/rooms/types/type-1' ? { data: { ...listing, updatedAt: 'later', cleaningFeeServiceId: 'fee-1' } } : baseGet(url, config));
    await userEvent.click(screen.getByRole('button', { name: 'Save room details' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/v1/rooms/types/type-1', { name: 'New name', amenities: ['WiFi'] }, { params: { propertyId: 'property-1' } }));
    await userEvent.type(name, ' again');
    vi.mocked(api.patch).mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Save room details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('These details changed');
    expect(api.patch).not.toHaveBeenCalled();
  });
  it('prompts once when leaving multiple dirty forms and keeps edits on cancel', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open(); await screen.findByLabelText('Cleaning fee amount');
    await userEvent.type(screen.getByLabelText('Room name'), ' updated');
    await userEvent.type(screen.getByLabelText('Cleaning fee amount'), '5');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Rooms' }));
    expect(confirm).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Room name')).toHaveValue('Garden room updated');
    confirm.mockRestore();
  });
  it('does not fetch restricted sections for room-only readers', async () => {
    allowed = false; open(); await screen.findByRole('heading', { name: 'Garden room' });
    expect(api.get).not.toHaveBeenCalledWith('/v1/rate-plans', expect.anything());
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Upload a file' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save room details' })).toBeDisabled();
  });
});
