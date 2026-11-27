import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PropertyService } from './property.service';
import { UpdatePropertyDto } from './dto/update-property.dto';
const stamp = '2026-01-01T12:00:00.000Z';
const listing = {
  houseRules: ['No smoking'],
  amenities: ['WiFi'],
  address: null,
  map: null,
  checkInUntil: null,
  checkOutFrom: null,
};
function setup(race = false) {
  const previous = {
    id: 'a',
    updatedAt: new Date(stamp),
    settings: {
      privateSetting: 'keep',
      publicListing: { houseRules: ['old'] },
    },
  };
  const set = vi.fn((values: unknown) => ({
    where: vi.fn(() => ({
      returning: vi.fn(async () =>
        race ? [] : [{ ...previous, ...(values as object) }],
      ),
    })),
  }));
  const audit = vi.fn(async () => undefined);
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: async () => [previous] }) }),
    }),
    update: () => ({ set }),
    insert: () => ({ values: audit }),
  };
  const db = { transaction: (run: (tx: unknown) => unknown) => run(tx) };
  return { service: new PropertyService(db), set, audit };
}
describe('Property content editing', () => {
  it('stores validated public fields without replacing unrelated settings or persisting transport controls', async () => {
    const { service, set, audit } = setup();
    const result = await service.update('a', {
      expectedUpdatedAt: stamp,
      publicListing: listing,
      description: 'Updated',
    });
    expect(result.settings).toEqual({
      privateSetting: 'keep',
      publicListing: listing,
    });
    expect(set.mock.calls[0][0]).not.toHaveProperty('expectedUpdatedAt');
    expect(set.mock.calls[0][0]).not.toHaveProperty('publicListing');
    expect(audit).toHaveBeenCalledOnce();
  });
  it('rejects a stale editor without writing', async () => {
    const { service, set } = setup();
    await expect(
      service.update('a', {
        expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
        description: 'wrong',
      }),
    ).rejects.toThrow('Reload');
    expect(set).not.toHaveBeenCalled();
  });
  it('does not create an audit event when an update returns no record', async () => {
    const { service, audit } = setup(true);
    await expect(
      service.update('a', { expectedUpdatedAt: stamp, publicListing: listing }),
    ).rejects.toThrow('Reload');
    expect(audit).not.toHaveBeenCalled();
  });
  it.each([
    { map: { latitude: 91, longitude: 0, precision: 'exact' } },
    { checkInUntil: '25:00' },
    { houseRules: ['x'.repeat(2001)] },
    { amenities: [42] },
    { propertyType: 'invented' },
    { propertyType: 42 },
    { address: { streetAddress: 'a', postalCode: 42 } },
  ])('rejects invalid nested public content %j', async (bad) => {
    const dto = plainToInstance(UpdatePropertyDto, {
      publicListing: { ...listing, ...bad },
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
  it('accepts explicit removal of a map/address and midnight arrivals', async () => {
    expect(
      await validate(
        plainToInstance(UpdatePropertyDto, {
          expectedUpdatedAt: stamp,
          publicListing: { ...listing, checkInUntil: '00:30' },
        }),
      ),
    ).toEqual([]);
  });
  it.each(['hotel', 'apartment', 'serviced_apartment', 'aparthotel', 'holiday_home', null])('accepts configured or cleared property type %s', async propertyType => {
    expect(await validate(plainToInstance(UpdatePropertyDto, {
      publicListing: { ...listing, propertyType },
    }))).toEqual([]);
  });
});
