import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PropertyService } from './property.service';

const dto = { name: 'Test accommodation', code: 'TEST', countryCode: 'GB', currencyCode: 'GBP', timezone: 'Europe/London', totalRooms: 2 };
function setup() {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const db = { insert: vi.fn(() => ({ values })) };
  return { service: new PropertyService(db), returning, values };
}
describe('Property creation', () => {
  it('returns the persisted property using the existing schema', async () => {
    const { service, returning, values } = setup();
    returning.mockResolvedValue([{ id: 'new-property', ...dto }]);
    expect(await service.create(dto)).toEqual({ id: 'new-property', ...dto, staffLogoUrl: null });
    expect(values).toHaveBeenCalledWith(dto);
  });
  it.each([false, true])('reports a unique code conflict (wrapped: %s)', async wrapped => {
    const { service, returning } = setup();
    const error = { code: '23505', constraint_name: 'properties_code_key' };
    returning.mockRejectedValue(wrapped ? { cause: error } : error);
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not misclassify unrelated storage failures as a duplicate code', async () => {
    const { service, returning } = setup();
    const error = new Error('storage unavailable');
    returning.mockRejectedValue(error);
    await expect(service.create(dto)).rejects.toBe(error);
  });
});
