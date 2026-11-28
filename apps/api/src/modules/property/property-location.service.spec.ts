import { afterEach, describe, expect, it, vi } from 'vitest';
import { PropertyLocationService } from './property-location.service';
import { normalizePostalCode } from '@telivityhaip/shared';
afterEach(() => vi.unstubAllGlobals());
describe('Staff property location lookup', () => {
  it('restricts queries to a fixed provider and country, maps actual address fields and caches repeat searches', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [
      { properties: { countrycode: 'GB', osm_id: 1, street: 'Test Street', housenumber: '12', city: 'Test Town', postcode: 'sw1a1aa' } },
      { properties: { countrycode: 'FR', street: 'Foreign result' } },
    ] }) });
    vi.stubGlobal('fetch', fetcher); const service = new PropertyLocationService();
    const result = await service.search('Test Street', 'gb', 'address');
    expect(result).toEqual([{ id: '1', source: 'address', countryCode: 'GB', addressLine1: '12 Test Street', city: 'Test Town', stateProvince: '', postalCode: 'SW1A 1AA', label: '12 Test Street, Test Town, SW1A 1AA' }]);
    expect(fetcher.mock.calls[0]![0].origin).toBe('https://photon.komoot.io');
    expect(fetcher.mock.calls[0]![0].searchParams.get('countrycode')).toBe('GB');
    expect(await service.search('test street', 'GB', 'address')).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([['ab','GB','address'],['street','ZZ','address'],['SW1A 1AA','GB','postcode'],['street','GB','unknown']])('rejects invalid lookup %s/%s/%s before network access', async (q, country, kind) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new PropertyLocationService().search(q!, country!, kind!)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds provider requests and returns a recoverable message without exposing upstream details', async () => {
    const fetcher = vi.fn().mockRejectedValue(Error('private provider detail')); vi.stubGlobal('fetch', fetcher);
    const service = new PropertyLocationService();
    await expect(service.search('street', 'GB', 'address')).rejects.toThrow('Enter the address manually');
    await expect(service.search('another', 'GB', 'address')).rejects.toThrow('Please wait');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('formats UK postcodes and preserves other countries’ postal formats', () => {
    expect(normalizePostalCode(' sw1a1aa ', 'GB')).toBe('SW1A 1AA');
    expect(normalizePostalCode(' 75001 ', 'FR')).toBe('75001');
    expect(normalizePostalCode(' 12345-6789 ', 'US')).toBe('12345-6789');
  });
});
