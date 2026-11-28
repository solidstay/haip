import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { ReferenceSelect } from './ReferenceSelect';

export type AddressSuggestion = {
  id: string; label: string; source: 'address' | 'postcode'; countryCode: string;
  addressLine1?: string; city?: string; stateProvince?: string; postalCode?: string;
};
const inputClass = 'min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-telivity-navy focus:outline-none focus:ring-2 focus:ring-telivity-teal/40';
export default function AddressLookup({ countryCode, onSelect, disabled }: {
  countryCode: string; onSelect: (item: AddressSuggestion) => void; disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('address');
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  const generation = useRef(0);
  function clear() {
    generation.current++; request.current?.abort(); setItems([]); setSelected(''); setStatus(''); setBusy(false);
  }
  useEffect(() => { if (countryCode !== 'GB') setKind('address'); clear(); return () => { generation.current++; request.current?.abort(); }; }, [countryCode, kind]);
  async function search() {
    if (!countryCode || query.trim().length < 3 || busy || disabled) return;
    const current = ++generation.current;
    request.current?.abort(); request.current = new AbortController();
    setBusy(true); setStatus('Searching…'); setItems([]); setSelected('');
    try {
      const response = await api.get('/v1/properties/location-search', {
        params: { q: query.trim(), country: countryCode, kind, propertyId: undefined },
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
    {countryCode === 'GB' && <div className="flex flex-wrap gap-4 text-sm">
      {['address', 'postcode'].map(value => <label key={value} className="flex min-h-[44px] items-center gap-2">
        <input type="radio" name={`${id}-kind`} checked={kind === value} disabled={disabled} onChange={() => setKind(value)} />
        {value === 'address' ? 'Street or property name' : 'UK postcode'}
      </label>)}
    </div>}
    <div className="flex flex-col gap-2 sm:flex-row">
      <input id={id} className={inputClass} value={query} maxLength={160} disabled={disabled || !countryCode}
        placeholder={kind === 'postcode' && countryCode === 'GB' ? 'Enter a full or partial postcode' : 'Enter a street, building or property name'}
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
          setStatus(item.source === 'postcode' ? 'Postcode filled. Enter the building, street and town below.' : 'Address details filled. Check the building, street, town and postcode before saving.');
        }} />
      <p className="mt-2 text-xs leading-5 text-telivity-slate">
        {kind === 'postcode' ? <a className="underline" href="https://postcodes.io/docs/licences/" target="_blank" rel="noreferrer">Postcode data credits</a>
          : <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
      </p>
    </div>}
  </div>;
}
