import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PROPERTY_COUNTRIES, normalizePostalCode } from '@telivityhaip/shared';

export type LocationSuggestion = {
  id: string; label: string; source: 'address'; countryCode: string;
  addressLine1?: string; city?: string; stateProvince?: string; postalCode?: string;
};

@Injectable()
export class PropertyLocationService {
  private readonly cache = new Map<string, { expires: number; items: LocationSuggestion[] }>();
  private nextRequestAt = 0;

  async search(query: string, country: string, kind: string): Promise<LocationSuggestion[]> {
    const q = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
    const countryCode = typeof country === 'string' ? country.trim().toUpperCase() : '';
    if (q.length < 3 || q.length > 160 || !PROPERTY_COUNTRIES.includes(countryCode) || kind !== 'address') {
      throw new BadRequestException('Choose a country and enter between 3 and 160 characters.');
    }
    const key = `${kind}:${countryCode}:${q.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.items;
    // Staff explicitly search; bound aggregate requests to the shared free service.
    if (Date.now() < this.nextRequestAt) throw new ServiceUnavailableException('Please wait a moment before searching again.');
    this.nextRequestAt = Date.now() + 1100;
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '8');
    url.searchParams.set('countrycode', countryCode); url.searchParams.set('lang', 'en');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'error', headers: { 'Accept': 'application/json', 'User-Agent': 'HAIP-Property-Address-Lookup/1.0' } });
      if (!response.ok) throw Error('Lookup unavailable');
      const data = await response.json() as { features?: unknown };
      const clean = (value: unknown, max = 255): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
      const items: LocationSuggestion[] = (Array.isArray(data.features) ? data.features : []).slice(0, 8).flatMap((f: any, i: number) => {
          const p = f.properties ?? {};
          if (clean(p.countrycode).toUpperCase() !== countryCode) return [];
          const street = [clean(p.housenumber), clean(p.street)].filter(Boolean).join(' ');
          const name = p.osm_key === 'place' ? '' : clean(p.name);
          const addressLine1 = [name && name !== street && name !== clean(p.street) ? name : '', street].filter(Boolean).join(', ').slice(0,255);
          const city = clean(p.city || p.town || p.village, 100);
          const postalCode = normalizePostalCode(clean(p.postcode, 20), countryCode);
          const stateProvince = clean(p.county || p.state, 100);
          const label = [...new Set([addressLine1, city, postalCode, stateProvince].filter(Boolean))].join(', ');
          return label ? [{ id: `${p.osm_type ?? ''}${p.osm_id ?? i}`, label, source: 'address' as const, countryCode, addressLine1, city, postalCode, stateProvince }] : [];
        });
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: Date.now() + 86400000, items });
      return items;
    } catch {
      throw new ServiceUnavailableException('Address search is unavailable. Enter the address manually or try again.');
    }
  }
}
