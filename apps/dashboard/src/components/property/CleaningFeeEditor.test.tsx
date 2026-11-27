import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers';
import { CleaningFeeForm } from './CleaningFeeEditor';
import { api } from '../../lib/api';
vi.mock('../../lib/api', () => ({ api: { put: vi.fn() } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
const props = { id: 'room-a', propertyId: 'property-a', name: 'Synthetic room',
  initial: { amount: '0.00', currencyCode: null }, currency: 'GBP' };
beforeEach(() => vi.resetAllMocks());
describe('room cleaning fee editor', () => {
  it('starts unchanged and sends a scoped fixed fee only on save', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} });
    renderWithProviders(<CleaningFeeForm {...props} />);
    expect(screen.getByRole('button', { name: 'Save cleaning fee' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Cleaning fee amount'), { target: { value: '25.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cleaning fee' }));
    await screen.findByText('Cleaning fee saved.');
    expect(api.put).toHaveBeenCalledWith('/v1/rooms/types/room-a/cleaning-fee',
      { amount: '25.50', currencyCode: 'GBP' }, { params: { propertyId: 'property-a' } });
  });
  it('removes the fee with zero', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} });
    renderWithProviders(<CleaningFeeForm {...props} initial={{ amount: '25.00', currencyCode: 'GBP' }} />);
    fireEvent.change(screen.getByLabelText('Cleaning fee amount'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cleaning fee' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(expect.any(String),
      { amount: '0', currencyCode: 'GBP' }, expect.any(Object)));
  });
  it('retains the draft after failure and allows retry', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce({ data: {} });
    renderWithProviders(<CleaningFeeForm {...props} />);
    fireEvent.change(screen.getByLabelText('Cleaning fee amount'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cleaning fee' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Cleaning fee amount')).toHaveValue(30);
    fireEvent.click(screen.getByRole('button', { name: 'Save cleaning fee' }));
    await screen.findByText('Cleaning fee saved.');
  });
});
