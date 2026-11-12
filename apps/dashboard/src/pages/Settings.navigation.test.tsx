import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/helpers';
import Settings from './Settings';
vi.mock('../context/PropertyContext', () => ({ useProperty: () => ({ propertyId: 'property-a' }) }));
vi.mock('../context/DashboardFeaturesContext', () => ({ useDashboardFeatures: () => ({ hasFeature: () => false }) }));
vi.mock('../components/admin/UserSettings', () => ({ default: () => <p>User administration</p> }));
vi.mock('../components/admin/RolesSettings', () => ({ default: () => <p>Role administration</p> }));
vi.mock('../lib/api', () => ({ api: { get: vi.fn().mockResolvedValue({ data: [] }) } }));
describe('Hidden settings navigation', () => {
  it.each([['users', 'User administration'], ['roles', 'Role administration'], ['webhooks', 'Agent Webhook Subscriptions']])('preserves direct %s links while hiding optional tab buttons', (tab, content) => {
    window.history.replaceState({}, '', `/settings?tab=${tab}&propertyId=property-a`);
    renderWithProviders(<Settings />);
    expect(screen.getByText(content)).toBeInTheDocument();
    for (const name of ['Users', 'Roles', 'Webhooks']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });
});
