import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/helpers';
import { DashboardFeaturesProvider } from '../context/DashboardFeaturesContext';
import AdminFeatures from './AdminFeatures';
import Sidebar from '../components/layout/Sidebar';
const mock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), admin: true }));
vi.mock('../lib/api', () => ({ api: { get: mock.get, put: mock.put } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => mock.admin, hasPermission: () => true }) }));
vi.mock('../context/PropertyContext', () => ({ useProperty: () => ({ properties: [], propertyId: null, isPortfolioMode: false }) }));
function setup() { return renderWithProviders(<DashboardFeaturesProvider><Sidebar mobileOpen={false} onClose={() => {}} /><AdminFeatures /></DashboardFeaturesProvider>); }
beforeEach(() => { vi.clearAllMocks(); mock.admin = true; mock.get.mockResolvedValue({ data: { enabled: [] } }); mock.put.mockImplementation((_url, data) => Promise.resolve({ data })); });
describe('Shared admin menu', () => {
  it('keeps core tasks visible, saves chosen features, and reloads persisted preferences', async () => {
    const view = setup();
    const reports = await screen.findByRole('checkbox', { name: 'Reports' });
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    for (const name of ['Properties', 'Reservations', 'Booking Requests', 'Rooms', 'Rate Plans', 'Settings']) expect(screen.getByRole('link', { name })).toBeInTheDocument();
    await userEvent.click(reports);
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save menu' }));
    expect(await screen.findByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(mock.put).toHaveBeenCalledWith('/v1/admin/dashboard-features', { enabled: ['reports'] }, { params: { propertyId: undefined }, skipErrorToast: true });
    view.unmount(); mock.get.mockResolvedValue({ data: { enabled: ['reports'] } }); setup();
    expect(await screen.findByRole('checkbox', { name: 'Reports' })).toBeChecked();
  });
  it('does not pretend a failed save succeeded; retains the draft for retry', async () => {
    mock.put.mockRejectedValueOnce(new Error('network'));
    setup(); await userEvent.click(await screen.findByRole('checkbox', { name: 'Housekeeping' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save menu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.getByRole('checkbox', { name: 'Housekeeping' })).toBeChecked();
    expect(screen.queryByRole('link', { name: 'Housekeeping' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save menu' }));
    expect(await screen.findByRole('link', { name: 'Housekeeping' })).toBeInTheDocument();
  });
  it('supports show all, discard and reset to Essentials without writes until Save', async () => {
    setup(); await screen.findByRole('checkbox', { name: 'Reports' });
    await userEvent.click(screen.getByRole('button', { name: 'Show all tools' }));
    expect(screen.getByRole('checkbox', { name: 'Reports' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('checkbox', { name: 'Reports' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Use Essentials' }));
    expect(mock.put).not.toHaveBeenCalled();
  });
  it('does not show shared controls to non-admin staff', async () => {
    mock.admin = false; setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an administrator');
    expect(screen.queryByRole('button', { name: 'Save menu' })).not.toBeInTheDocument();
    expect(mock.put).not.toHaveBeenCalled();
  });
  it('keeps core navigation available when loading settings fails', async () => {
    mock.get.mockRejectedValue(new Error('offline')); setup();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'), { timeout: 4000 });
    expect(screen.getByRole('link', { name: 'Properties' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save menu' })).not.toBeInTheDocument();
  });
});
