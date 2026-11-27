import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers';
import { api } from '../../lib/api';
import { CancellationPolicies, RateTermsEditor } from './BookingTermsEditor';
vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../../context/PropertyContext', () => ({ useProperty: () => ({ propertyId: 'property-a' }) }));
const row = {
  id: 'plan-a',
  name: 'Standard',
  code: 'STD',
  baseAmount: '80.00',
  currencyCode: 'GBP',
  updatedAt: '2026-01-01T00:00:00Z',
  cancellationPolicyId: 'policy-a',
  mealPlan: 'room_only',
};
describe('Rate terms editor', () => {
  it('keeps the dirty guard when the current policy is selected again', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 'policy-a', name: 'Flexible', code: 'FLEX', isActive: true, penaltyType: 'none', depositHandling: 'always_refund', freeCancelHoursBeforeArrival: 48 }] } });
    renderWithProviders(<CancellationPolicies />);
    fireEvent.click(await screen.findByRole('button', { name: 'Flexible' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Flexible' }));
    fireEvent.click(screen.getByRole('button', { name: 'New policy' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Name')).toHaveValue('Unsaved name');
    confirm.mockRestore();
  });
  it('shows a linked inactive policy without implying it was removed', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: [{ id: 'policy-a', name: 'Previous policy', isActive: false }],
      },
    });
    renderWithProviders(<RateTermsEditor row={row} propertyId="property-a" />);
    expect(
      await screen.findByRole('option', { name: 'Previous policy (inactive)' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Cancellation policy')).toHaveValue(
      'policy-a',
    );
  });
  it('patches only the changed value within the current property', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: String(url).includes('cancellation-policies')
        ? { data: [{ id: 'policy-a', name: 'Flexible' }] }
        : row,
    }));
    vi.mocked(api.patch).mockResolvedValue({
      data: { ...row, baseAmount: '85.00' },
    });
    renderWithProviders(<RateTermsEditor row={row} propertyId="property-a" />);
    fireEvent.change(screen.getByLabelText('Base nightly amount'), {
      target: { value: '85.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save rate terms' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/v1/rate-plans/plan-a',
        { baseAmount: '85.00' },
        { params: { propertyId: 'property-a' } },
      ),
    );
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
  });
});
