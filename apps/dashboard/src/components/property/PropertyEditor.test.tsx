import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/helpers';
import { api } from '../../lib/api';
import PropertyEditor from './PropertyEditor';
vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../media/MediaLibrarySummary', () => ({
  default: () => <div>Photo library</div>,
}));
const original = {
  id: 'property-a',
  name: 'Example home',
  code: 'EXAMPLE',
  description: 'Original description',
  countryCode: 'GB',
  currencyCode: 'GBP',
  defaultLanguage: 'en',
  overbookingPercentage: 0,
  timezone: 'Europe/London',
  checkInTime: '15:00',
  checkOutTime: '10:00',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    untouched: 'keep',
    publicListing: {
      houseRules: ['No smoking'],
      amenities: ['WiFi'],
      address: null,
      map: null,
    },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: structuredClone(original) });
});
describe('Property editor', () => {
  it('edits description and rules using the selected property, preserving hidden settings', async () => {
    vi.mocked(api.patch).mockImplementation(async (_url, value) => {
      const patch = value as Record<string, unknown>;
      return {
        data: {
          ...original,
          ...patch,
          settings: {
            ...original.settings,
            publicListing: patch.publicListing,
          },
        },
      };
    });
    renderWithProviders(<PropertyEditor propertyId="property-a" />);
    fireEvent.change(await screen.findByLabelText('Property description'), {
      target: { value: 'Edited description' },
    });
    fireEvent.change(screen.getByLabelText('House rules'), {
      target: { value: 'No smoking\nPlease call before arrival' },
    });
    fireEvent.change(screen.getByLabelText('Property type'), {
      target: { value: 'apartment' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/v1/properties/property-a',
        expect.objectContaining({
          description: 'Edited description',
          expectedUpdatedAt: original.updatedAt,
          publicListing: expect.objectContaining({
            propertyType: 'apartment',
            houseRules: ['No smoking', 'Please call before arrival'],
          }),
        }),
      ),
    );
    expect(vi.mocked(api.patch).mock.calls[0][1]).not.toHaveProperty(
      'settings',
    );
    expect(
      await screen.findByText(/Changes saved. Published website/),
    ).toBeInTheDocument();
  });
  it('guards property changes while edits are pending', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<PropertyEditor propertyId="property-a" />);
    fireEvent.change(await screen.findByLabelText('Property description'), {
      target: { value: 'Keep draft' },
    });
    expect(
      window.dispatchEvent(
        new CustomEvent('haip:before-property-change', { cancelable: true }),
      ),
    ).toBe(false);
    expect(screen.getByLabelText('Property description')).toHaveValue(
      'Keep draft',
    );
    confirm.mockRestore();
  });
  it('retains unsaved text and shows server conflict errors', async () => {
    vi.mocked(api.patch).mockRejectedValue({
      response: {
        data: { message: 'Changed by another user. Reload before saving.' },
      },
    });
    renderWithProviders(<PropertyEditor propertyId="property-a" />);
    fireEvent.change(await screen.findByLabelText('Property description'), {
      target: { value: 'Keep my edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload');
    expect(screen.getByLabelText('Property description')).toHaveValue(
      'Keep my edit',
    );
  });
});
