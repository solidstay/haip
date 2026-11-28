import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { ReferenceSelect } from './ReferenceSelect';

export type AddressSuggestion = {
  id: string; label: string; source: 'address'; countryCode: string;
  addressLine1?: string; city?: string; stateProvince?: string; postalCode?: string;
};
const inputClass = 'min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-telivity-navy focus:outline-none focus:ring-2 focus:ring-telivity-teal/40';
export default function AddressLookup({ countryCode, onSelect, disabled }: {
  countryCode: string; onSelect: (item: AddressSuggestion) => void; disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  const generation = useRef(0);
  function clear() {
    generation.current++; request.current?.abort(); setItems([]); setSelected(''); setStatus(''); setBusy(false);
  }
  useEffect(() => { clear(); return () => { generation.current++; request.current?.abort(); }; }, [countryCode]);
  async function search() {
    if (!countryCode || query.trim().length < 3 || busy || disabled) return;
    const current = ++generation.current;
    request.current?.abort(); request.current = new AbortController();
    setBusy(true); setStatus('Searching…'); setItems([]); setSelected('');
    try {
      const response = await api.get('/v1/properties/location-search', {
        params: { q: query.trim(), country: countryCode, propertyId: undefined },
        signal: request.current.signal, skipErrorToast: true,
      });
      if (generation.current !== current) return;
      const results: AddressSuggestion[] = response.data.data ?? response.data;
      setItems(results);
      setStatus(results.length ? `${results.length} suggestions found. Choose a match below.` : 'No matches found. Try a more complete address or enter the details below.');
    } catch {
      if (generation.current === current) setStatus('Search is unavailable. Try again in a moment or enter the details below.');
    } finally { if (generation.current === current) setBusy(false); }
  }
  return <div className="space-y-3">
    <label htmlFor={id} className="block text-sm font-medium text-telivity-navy">Find an address</label>
    <div className="flex flex-col gap-2 sm:flex-row">
      <input id={id} className={inputClass} value={query} maxLength={160} disabled={disabled || !countryCode}
        placeholder="Enter a street, building or property name"
        autoComplete="off" aria-describedby={`${id}-hint ${id}-status`}
        onChange={e => { clear(); setQuery(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
      <button type="button" disabled={disabled || busy || !countryCode || query.trim().length < 3}
        onClick={() => void search()} className="min-h-[44px] shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-telivity-navy hover:bg-telivity-light-grey focus-visible:outline focus-visible:outline-2 focus-visible:outline-telivity-teal disabled:opacity-50">
        {busy ? 'Searching…' : 'Search address'}
      </button>
    </div>
    <p id={`${id}-hint`} className="text-sm text-telivity-slate">{!countryCode ? 'Choose a country first. ' : ''}Search is optional. You can always enter the address below.</p>
    <p id={`${id}-status`} role="status" className="text-sm text-telivity-slate">{status}</p>
    {items.length > 0 && <div>
      <label htmlFor={`${id}-result`} className="mb-2 block text-sm font-medium text-telivity-navy">Choose a match</label>
      <ReferenceSelect id={`${id}-result`} value={selected} disabled={disabled} className={inputClass}
        options={items.map(item => ({value: item.id, label: item.label}))}
        onChange={value => { const item = items.find(item => item.id === value); if (!item) return;
          setSelected(value); onSelect(item);
          setStatus('Address details filled. Check the building, street, town and postcode before saving.');
        }} />
      <p className="mt-2 text-xs leading-5 text-telivity-slate">
        <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </p>
    </div>}
  </div>;
}
