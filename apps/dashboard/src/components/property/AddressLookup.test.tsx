import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddressLookup from './AddressLookup';
const get = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api', () => ({ api: { get } }));
beforeEach(() => { get.mockReset(); });
describe('Property address search', () => {
  it('searches only on request and applies only an explicitly selected match', async () => {
    const onSelect = vi.fn(); const item = { id: '1', label: '12 Test Street, Test Town', source: 'address', countryCode: 'GB', addressLine1: '12 Test Street', city: 'Test Town' };
    get.mockResolvedValue({ data: [item] });
    render(<AddressLookup countryCode="GB" onSelect={onSelect} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Find an address'), 'Test Street');
    expect(get).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Search address' }));
    expect(await screen.findByText(/1 suggestions found/)).toBeVisible();
    expect(screen.getByRole('link', { name: '© OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText('Choose a match'));
    await userEvent.click(await screen.findByRole('option', {name: item.label}));
    expect(onSelect).toHaveBeenCalledWith(item);
    expect(screen.getByRole('status')).toHaveTextContent('Check the building');
  });
  it('discards an in-flight search when the country changes ', async () => {
    let resolve!: (value: unknown) => void; get.mockReturnValue(new Promise(r => { resolve = r; }));
    const {rerender} = render(<AddressLookup countryCode="GB" onSelect={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Find an address'), 'Test Street');
    await userEvent.click(screen.getByRole('button', {name: 'Search address'}));
    rerender(<AddressLookup countryCode="FR" onSelect={vi.fn()} />);
    await act(async () => resolve({ data: [{id:'stale', label:'Stale result'}] }));
    expect(screen.queryByLabelText('Choose a match')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Search address'})).toBeEnabled();
    expect(screen.getByLabelText('Find an address')).toHaveAttribute('placeholder','Enter a street, building or property name');
  });
  it('keeps the typed query and explains manual entry when lookup fails', async () => {
    get.mockRejectedValue(Error('provider private detail'));
    render(<AddressLookup countryCode="GB" onSelect={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Find an address'), 'Test Street');
    await userEvent.click(screen.getByRole('button', {name:'Search address'}));
    expect(await screen.findByText(/Search is unavailable/)).toBeVisible();
    expect(screen.getByLabelText('Find an address')).toHaveValue('Test Street');
    expect(screen.queryByText('provider private detail')).not.toBeInTheDocument();
  });
});
