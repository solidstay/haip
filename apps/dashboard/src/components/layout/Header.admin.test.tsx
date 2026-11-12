import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers';
import Header from './Header';
const auth = vi.hoisted(() => ({ admin: false }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => auth.admin, user: null, roles: [], authEnabled: true, logout: () => {} }) }));
vi.mock('../../context/PropertyContext', () => ({ useProperty: () => ({ propertyId: null, properties: [], isPortfolioMode: false, setPropertyId: () => {} }) }));
vi.mock('../../hooks/useSocket', () => ({ useSocket: () => ({ connected: true }) }));
vi.mock('../search/CommandPalette', () => ({ default: () => null, useCommandPaletteShortcut: () => {} }));
vi.mock('../notifications/NotificationBell', () => ({ default: () => null }));
vi.mock('../help/HelpPanel', () => ({ default: () => null }));
describe('Administration entry', () => {
  it('is absent for staff', () => {
    auth.admin = false; renderWithProviders(<Header onMenuClick={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });
  it('opens the separate workspace for administrators', () => {
    auth.admin = true; renderWithProviders(<Header onMenuClick={() => {}} />);
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin/features');
  });
});
