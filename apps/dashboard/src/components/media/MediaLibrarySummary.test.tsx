import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MediaLibrarySummary from './MediaLibrarySummary';
import { api } from '../../lib/api';

const auth = vi.hoisted(() => ({ admin: true }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => auth.admin }) }));
vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
const photos = Array.from({ length: 14 }, (_, i) => ({ id: `photo-${i + 1}`, url: `/photo-${i + 1}.jpg`, isPrimary: i === 0, caption: null }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MediaLibrarySummary propertyId="property-1" /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.admin = true;
  vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/v1/media/config' ? { uploadEnabled: true } : photos }));
  vi.mocked(api.post).mockResolvedValue({ data: {} });
  vi.mocked(api.delete).mockResolvedValue({ data: {} });
});

async function open() {
  const trigger = screen.getByRole('button', { name: 'Manage photos' });
  await userEvent.click(trigger);
  return screen.findByRole('dialog', { name: 'Property Photos' });
}

describe('Compact media library', () => {
  it('shows only the cover on settings, pages the complete library, and restores focus on close', async () => {
    setup();
    await screen.findByText('14 photos in the library');
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const dialog = await open();
    expect(within(dialog).getAllByRole('img')).toHaveLength(6);
    expect(within(dialog).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText('7–12 of 14 photos')).toBeVisible();
    expect(within(dialog).getByRole('img', { name: 'Photo 7' })).toHaveAttribute('src', '/photo-7.jpg');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getAllByRole('img')).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Manage photos' })).toHaveFocus();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('reorders across a page boundary using the full library and correct property scope', async () => {
    setup(); const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actions for photo 7' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move left' }));
    const ids = photos.map(p => p.id);[ids[5], ids[6]] = [ids[6], ids[5]];
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/v1/media/reorder', { propertyId: 'property-1', ownerType: 'property', ownerId: 'property-1', orderedIds: ids }));
  });

  it('sets the cover for the selected photo and cancels deletion without a write', async () => {
    setup(); const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actions for photo 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Set as primary' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/v1/media/photo-2/primary', {}, { params: { propertyId: 'property-1' } }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actions for photo 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalled();expect(api.delete).not.toHaveBeenCalled();confirm.mockRestore();
  });

  it('keeps browsing available without exposing editing controls to non-admin staff', async () => {
    auth.admin = false;setup();
    await userEvent.click(screen.getByRole('button', { name: 'View photos' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(6));
    expect(within(dialog).queryByRole('button', { name: /Actions for photo/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Upload a file' })).not.toBeInTheDocument();
  });
});
