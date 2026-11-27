import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { api } from '../../lib/api';
import { control, Field, errorMessage } from './PropertyEditor';
import { useUnsavedChanges } from './useUnsavedChanges';

export default function CleaningFeeEditor({ roomTypeId, embedded = false }: { roomTypeId?: string; embedded?: boolean } = {}) {
  const { id: routeId } = useParams();
  const id = roomTypeId ?? routeId;
  const { propertyId, currencyCode } = useProperty();
  const query = useQuery({
    queryKey: ['cleaning-fee', propertyId, id],
    enabled: !!propertyId && !!id,
    queryFn: async () => {
      const [fee, room] = await Promise.all([
        api.get(`/v1/rooms/types/${id}/cleaning-fee`, { params: { propertyId } }),
        api.get(`/v1/rooms/types/${id}`, { params: { propertyId } }),
      ]);
      return { fee: fee.data.data ?? fee.data, room: room.data.data ?? room.data };
    },
  });
  if (!propertyId) return <p>Select a property first.</p>;
  if (query.isError) return <p role="alert">Could not load the cleaning fee. <button className="underline" onClick={() => query.refetch()}>Try again</button></p>;
  if (!query.data) return <p role="status">Loading cleaning fee…</p>;
  return <CleaningFeeForm key={`${propertyId}:${id}`} id={id!} propertyId={propertyId}
    name={query.data.room.name} initial={query.data.fee} currency={currencyCode} embedded={embedded} />;
}

export function CleaningFeeForm({ id, propertyId, name, initial, currency, embedded = false }: {
  id: string; propertyId: string; name: string; embedded?: boolean;
  initial: { amount: string; currencyCode: string | null }; currency: string | null;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('ops.manage') && hasPermission('services.manage');
  const [amount, setAmount] = useState(initial.amount);
  const [code, setCode] = useState(initial.currencyCode ?? currency ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useUnsavedChanges(dirty);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setSaved(false);
    try {
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) throw Error('Enter a non-negative amount with up to two decimal places.');
      await api.put(`/v1/rooms/types/${id}/cleaning-fee`, { amount, currencyCode: code }, { params: { propertyId } });
      setDirty(false); setSaved(true);
    } catch (error) { setError(errorMessage(error)); }
    finally { setSaving(false); }
  }
  return <div className={embedded ? undefined : "max-w-2xl"}>
    {!embedded && <>
    <Link className="mb-4 inline-flex min-h-[44px] items-center text-telivity-teal" to={`/rooms/types/${id}?propertyId=${propertyId}`}>Back to accommodation</Link>
    <h1 className="mb-2 text-2xl font-semibold text-telivity-navy">Cleaning fee</h1>
    <p className="mb-6 break-words text-telivity-slate">{name}</p>
    </>}
    <form onSubmit={save} className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
      {embedded && <h2 className="mb-4 text-lg font-semibold text-telivity-navy">Cleaning fee</h2>}
      <p className="mb-6 text-sm text-telivity-slate">A fixed charge once per stay, included in direct-booking totals. Set the amount to 0 to remove it. Existing accepted bookings keep their agreed price.</p>
      <fieldset disabled={saving || !canManage} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cleaning fee amount"><input className={control} type="number" min="0" max="9999999999.99" step="0.01" required value={amount} onChange={e => { setAmount(e.target.value); setDirty(true); setSaved(false); }} /></Field>
        <Field label="Currency" hint="Must match this accommodation’s booking rates."><input className={control} required pattern="[A-Z]{3}" maxLength={3} value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setDirty(true); setSaved(false); }} /></Field>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button disabled={!dirty || saving || !canManage} className="min-h-[44px] rounded-lg bg-telivity-teal px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save cleaning fee'}</button>
        <p role="status" className="text-sm text-telivity-slate">{saved ? 'Cleaning fee saved.' : dirty ? 'You have unsaved changes.' : ''}</p>
      </div>
    </form>
  </div>;
}
