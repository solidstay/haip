import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AddProperty from './AddProperty';

const mocks = vi.hoisted(() => ({ post: vi.fn(), add: vi.fn(), admin: true }));
vi.mock('../lib/api', () => ({ api: { post: mocks.post } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => mocks.admin }) }));
vi.mock('../context/PropertyContext', () => ({ useProperty: () => ({ addCreatedProperty: mocks.add, propertyId: 'portfolio' }) }));
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function setup() { render(<MemoryRouter initialEntries={['/properties/new?propertyId=portfolio']}><AddProperty /><Location /></MemoryRouter>); }
async function fill() {
  for (const [label, value] of [
    ['Property name', '  Test accommodation  '], ['Property code', '  TEST-ADD  '],
    ['Number of rooms or units', '2'], ['Currency code', 'gbp'], ['Country code', 'gb'], ['Timezone', 'Europe/London'],
  ]) await userEvent.type(screen.getByLabelText(`${label} *`), value);
}
beforeEach(() => { vi.clearAllMocks(); mocks.admin = true; mocks.post.mockResolvedValue({ data: { data: { id: 'new-property', name: 'Test accommodation', code: 'TEST-ADD', currencyCode: 'GBP' } } }); });

describe('Add property', () => {
  it('creates through the existing API, updates the chooser and offers scoped setup links', async () => {
    setup(); await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    expect(await screen.findByRole('heading', { name: 'Test accommodation created' })).toHaveFocus();
    expect(mocks.post).toHaveBeenCalledWith('/v1/properties', {
      name: 'Test accommodation', code: 'TEST-ADD', totalRooms: 2, currencyCode: 'GBP', countryCode: 'GB',
      timezone: 'Europe/London', checkInTime: '15:00', checkOutTime: '11:00', overbookingPercentage: 0,
    }, { params: { propertyId: undefined }, skipErrorToast: true });
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-property', currencyCode: 'GBP' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/properties/new?propertyId=new-property');
    expect(screen.getByRole('link', { name: 'Set up rooms' })).toHaveAttribute('href', '/rooms?propertyId=new-property');
    expect(screen.queryByRole('button', { name: 'Create property' })).not.toBeInTheDocument();
  });
  it('starts another property with a clean form and keyboard focus after creation', async () => {
    setup(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add another property' }));
    expect(screen.getByLabelText('Property name *')).toHaveValue('');
    expect(screen.getByLabelText('Property name *')).toHaveFocus();
    expect(screen.getByLabelText('Property code *')).toHaveValue('');
    expect(screen.getByLabelText('Check-in time *')).toHaveValue('15:00');
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('blocks missing fields and invalid timezone and room count before writing', async () => {
    setup(); await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    expect(screen.getByLabelText('Property name *')).toHaveFocus();
    expect(mocks.post).not.toHaveBeenCalled();
    await fill();
    fireEvent.change(screen.getByLabelText('Timezone *'), { target: { value: 'Not/AZone' } });
    fireEvent.change(screen.getByLabelText('Number of rooms or units *'), { target: { value: '1.5' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    expect(await screen.findByText('Enter a valid timezone, for example Europe/London.')).toBeInTheDocument();
    expect(screen.getByText('Enter a whole number of at least 1.')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('keeps entries and focuses the code after a duplicate, then permits correction', async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } });
    setup(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    await screen.findByText(/This property code is already in use/);
    expect(screen.getByLabelText('Property code *')).toHaveFocus();
    expect(screen.getByLabelText('Property name *')).toHaveValue('  Test accommodation  ');
    await userEvent.clear(screen.getByLabelText('Property code *'));
    await userEvent.type(screen.getByLabelText('Property code *'), 'DIFFERENT');
    await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    await screen.findByRole('heading', { name: 'Test accommodation created' });
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });
  it('shows a recoverable failure without clearing the form or exposing transport details', async () => {
    mocks.post.mockRejectedValueOnce(new Error('private server detail'));
    setup(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the property list before retrying');
    expect(screen.queryByText('private server detail')).not.toBeInTheDocument();
    expect(mocks.add).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create property' })).toBeEnabled();
  });
  it('prevents repeated submissions while the request is pending', async () => {
    let complete!: (value: unknown) => void;
    mocks.post.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    setup(); await fill();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Create property' }));
    expect(screen.getByRole('button', { name: 'Creating property…' })).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    complete({ data: { id: 'new-property', name: 'Test accommodation', code: 'TEST-ADD' } });
    await screen.findByRole('heading', { name: 'Test accommodation created' });
  });
  it('denies a non-admin opening the route directly', () => {
    mocks.admin = false; setup();
    expect(screen.getByRole('alert')).toHaveTextContent('An administrator account is required');
    expect(screen.queryByRole('button', { name: 'Create property' })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
