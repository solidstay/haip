import { useUnsavedChanges } from './useUnsavedChanges';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import MediaGallery from '../media/MediaGallery';
import {
  control,
  Field,
  EditorSection,
  errorMessage,
  lines,
} from './PropertyEditor';

type Row = Record<string, any>;
export default function AccommodationEditor({
  unit = false,
}: {
  unit?: boolean;
}) {
  const { propertyId } = useProperty();
  const { id } = useParams();
  const path = unit ? 'rooms' : 'rooms/types';
  const query = useQuery({
    queryKey: [path, propertyId, id],
    queryFn: async () =>
      (await api.get(`/v1/${path}/${id}`, { params: { propertyId } })).data,
    enabled: !!propertyId && !!id,
  });
  if (!propertyId) return <p>Select a property first.</p>;
  if (query.isError)
    return (
      <p role="alert">
        Could not load these details.{' '}
        <button className="underline" onClick={() => query.refetch()}>
          Try again
        </button>
      </p>
    );
  if (!query.data)
    return (
      <div
        aria-label="Loading accommodation"
        className="h-64 rounded-xl bg-white motion-safe:animate-pulse"
      />
    );
  return (
    <AccommodationForm
      key={`${propertyId}:${id}`}
      row={query.data.data ?? query.data}
      propertyId={propertyId}
      unit={unit}
    />
  );
}
export function AccommodationForm({
  row,
  propertyId,
  unit,
  embedded = false,
}: {
  row: Row;
  propertyId: string;
  unit: boolean;
  embedded?: boolean;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('ops.manage');
  const queryClient = useQueryClient();
  const [base, setBase] = useState(row);
  const [draft, setDraft] = useState(row);
  const [features, setFeatures] = useState((row.amenities ?? []).join('\n'));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useUnsavedChanges(dirty);
  const path = unit ? 'rooms' : 'rooms/types';
  const set = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setSaved(false);
  };
  const field = (
    key: string,
    label: string,
    type = 'text',
    required = false,
    min?: number,
    maxLength?: number,
  ) => (
    <Field label={label}>
      <input
        className={control}
        type={type}
        required={required}
        min={min}
        maxLength={maxLength}
        value={draft[key] ?? ''}
        onChange={(e) =>
          set(
            key,
            type === 'number'
              ? e.target.value === ''
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </Field>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (!unit && draft.defaultOccupancy > draft.maxOccupancy)
        throw Error('Default occupancy cannot exceed maximum guests.');
      const current = (
        await api.get(`/v1/${path}/${row.id}`, { params: { propertyId } })
      ).data;
      const keys = unit
        ? [
            'number',
            'floor',
            'building',
            'isAccessible',
            'isConnecting',
            'connectingRoomId',
          ]
        : [
            'name',
            'code',
            'description',
            'maxOccupancy',
            'defaultOccupancy',
            'bedType',
            'bedCount',
            'squareMeters',
            'floor',
            'isAccessible',
            'sortOrder',
          ];
      // A fee or housekeeping save must not invalidate unrelated listing edits.
      const latest = current.data ?? current;
      if ([...keys, 'amenities'].some(k => JSON.stringify(latest[k]) !== JSON.stringify(base[k])))
        throw Error('These details changed after you opened them. Reload before saving.');
      const patch = Object.fromEntries(
        keys
          .filter((k) => draft[k] !== base[k])
          .map((k) => [
            k,
            draft[k] === '' && k === 'connectingRoomId' ? null : draft[k],
          ]),
      );
      const response = await api.patch(
        `/v1/${path}/${row.id}`,
        { ...patch, amenities: lines(features) },
        { params: { propertyId } },
      );
      const next = response.data.data ?? response.data;
      setBase(next);
      setDraft(next);
      setDirty(false);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="min-w-0">
      {!embedded && <>
      <Link
        to={`/${path}?propertyId=${propertyId}`}
        className="mb-4 inline-flex min-h-[44px] items-center text-sm font-medium text-telivity-teal"
      >
        Back to {unit ? 'physical units' : 'room types'}
      </Link>
      <h1 className="mb-5 break-words text-2xl font-semibold text-telivity-navy">
        {unit ? `Unit ${row.number}` : row.name}
      </h1>
      </>}
      <form
        onSubmit={save}
        className="rounded-xl bg-white p-4 shadow-sm sm:p-6"
      >
        <fieldset disabled={saving || !canManage}>
          <EditorSection
            id={unit ? 'unit-details' : 'accommodation-details'}
            title={unit ? 'Operational details' : 'Room details'}
            hint={
              unit
                ? 'Identify the physical unit and its features.'
                : 'Descriptions, capacity and amenities shown to guests.'
            }
          >
            {unit ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {field(
                  'number',
                  'Unit number / label',
                  'text',
                  true,
                  undefined,
                  20,
                )}
                {field('building', 'Building', 'text', false, undefined, 50)}
                {field('floor', 'Floor', 'text', false, undefined, 10)}
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field(
                    'name',
                    'Room name',
                    'text',
                    true,
                    undefined,
                    100,
                  )}
                  {field('code', 'Internal code', 'text', true, undefined, 20)}
                </div>
                <Field
                  label="Description & sleeping arrangements"
                  hint="Describe bedrooms, bathrooms and beds. Separate individual sleeping arrangements with semicolons."
                >
                  <textarea
                    className={control}
                    rows={5}
                    value={draft.description ?? ''}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('maxOccupancy', 'Maximum guests', 'number', true, 1)}
                  {field(
                    'defaultOccupancy',
                    'Default occupancy',
                    'number',
                    true,
                    1,
                  )}
                  {field('bedType', 'Bed type', 'text', false, undefined, 50)}
                  {field('bedCount', 'Number of beds', 'number', true, 1)}
                  {field('squareMeters', 'Floor area (m²)', 'number', false, 1)}
                  {field('floor', 'Floor', 'text', false, undefined, 10)}
                  {field('sortOrder', 'Display order', 'number', true)}
                </div>
              </>
            )}
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isAccessible ?? false}
                onChange={(e) => set('isAccessible', e.target.checked)}
              />
              Accessible accommodation
            </label>
            {unit && (
              <>
                <label className="flex min-h-[44px] items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.isConnecting ?? false}
                    onChange={(e) => set('isConnecting', e.target.checked)}
                  />
                  Connecting unit
                </label>
                {draft.isConnecting &&
                  field('connectingRoomId', 'Connected unit ID')}
              </>
            )}
            <Field
              label="Amenities"
              hint="One amenity per line. Only include facilities available in this accommodation."
            >
              <textarea
                className={control}
                rows={7}
                value={features}
                onChange={(e) => {
                  setFeatures(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
              />
            </Field>
          </EditorSection>
        </fieldset>
        <div className={`${embedded ? '' : 'sticky bottom-0 z-10'} flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white py-4`}>
          <p role="status" className="text-sm text-telivity-slate">
            {saving
              ? 'Saving…'
              : dirty
                ? 'You have unsaved changes.'
                : saved
                  ? 'Changes saved.'
                  : 'No unsaved changes.'}
          </p>
          <button
            disabled={!dirty || saving || !canManage}
            className="min-h-[44px] rounded-lg bg-telivity-teal px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {embedded ? (unit ? 'Save operational details' : 'Save room details') : 'Save accommodation'}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
      {!embedded && <>
      <Link className="mt-6 inline-flex min-h-[44px] items-center font-medium text-telivity-teal"
        to={`/rooms/types/${unit ? row.roomTypeId : row.id}/cleaning-fee?propertyId=${propertyId}`}>
        Configure cleaning fee{unit ? ' for this accommodation type' : ''}
      </Link>
      <section className="mt-6 rounded-xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Accommodation photos</h2>
        <MediaGallery
          propertyId={propertyId}
          ownerType={unit ? 'room' : 'room_type'}
          ownerId={row.id}
          canManage={canManage}
        />
      </section>
      </>}
    </div>
  );
}
