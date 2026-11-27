import { useUnsavedChanges } from './useUnsavedChanges';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { Field, control, errorMessage } from './PropertyEditor';
type Row = Record<string, any>;
export function CancellationPolicies() {
  const { propertyId } = useProperty();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const choose = (next: Row) => {
    if (dirty && selected && (selected.id ?? 'new') === (next.id ?? 'new')) return;
    if (!dirty || window.confirm('Leave without saving your policy changes?')) {
      setSelected(next);
      setSelectionVersion(version => version + 1);
      setDirty(false);
    }
  };
  const query = useQuery({
    queryKey: ['cancellation-policies', propertyId, page],
    queryFn: async () =>
      (
        await api.get('/v1/cancellation-policies', {
          params: { propertyId, page, limit: 20 },
        })
      ).data,
    enabled: !!propertyId,
  });
  if (!propertyId) return <p>Select a property first.</p>;
  if (query.isError)
    return (
      <p role="alert">
        Could not load cancellation policies.{' '}
        <button className="underline" onClick={() => query.refetch()}>
          Try again
        </button>
      </p>
    );
  if (!query.data) return <p role="status">Loading cancellation policies…</p>;
  const rows = query.data.data ?? query.data;
  return (
    <div>
      <Link
        to={`/settings?propertyId=${propertyId}`}
        className="inline-flex min-h-[44px] items-center text-telivity-teal"
      >
        Back to property settings
      </Link>
      <h1 className="mb-5 text-2xl font-semibold">Cancellation policies</h1>
      <p className="mb-5 text-sm text-telivity-slate">
        These are operational booking terms. Attach a policy to a rate plan to
        apply it to new bookings.
      </p>
      <div className="mb-6 flex flex-wrap gap-3">
        {rows.map((row: Row) => (
          <button
            key={row.id}
            aria-pressed={selected?.id === row.id}
            onClick={() => choose(row)}
            className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
          >
            {row.name}
          </button>
        ))}
        <button
          className="min-h-[44px] rounded-lg bg-telivity-teal px-4 py-2 text-sm font-semibold text-white"
          onClick={() =>
            choose({
              name: '',
              code: '',
              description: '',
              freeCancelHoursBeforeArrival: 24,
              penaltyType: 'first_night',
              penaltyPercentage: null,
              depositHandling: 'refund_if_refundable',
              isActive: true,
            })
          }
        >
          New policy
        </button>
      </div>
      {selected && (
        <TermsForm
          key={selectionVersion}
          row={selected}
          propertyId={propertyId}
          policy
          onDirtyChange={setDirty}
        />
      )}
      <div className="mt-5 flex items-center gap-4">
        <button
          disabled={page === 1}
          className="min-h-[44px] disabled:opacity-40"
          onClick={() => {
            if (
              !dirty ||
              window.confirm('Leave without saving your policy changes?')
            ) {
              setPage((p) => p - 1);
              setSelected(null);
              setDirty(false);
            }
          }}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={rows.length < 20}
          className="min-h-[44px] disabled:opacity-40"
          onClick={() => {
            if (
              !dirty ||
              window.confirm('Leave without saving your policy changes?')
            ) {
              setPage((p) => p + 1);
              setSelected(null);
              setDirty(false);
            }
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function RateTermsEditor({
  row,
  propertyId,
}: {
  row: Row;
  propertyId: string;
}) {
  return <TermsForm key={row.id} row={row} propertyId={propertyId} />;
}
function TermsForm({
  row,
  propertyId,
  policy = false,
  onDirtyChange,
}: {
  row: Row;
  propertyId: string;
  policy?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(
    policy ? 'policies.manage' : 'rateplans.manage',
  );
  const queryClient = useQueryClient();
  const [base, setBase] = useState(row);
  const [draft, setDraft] = useState(row);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useUnsavedChanges(dirty);
  const policies = useQuery({
    queryKey: ['policy-options', propertyId],
    queryFn: async () => {
      const result: Row[] = [];
      for (let page = 1; ; page++) {
        const payload = (
          await api.get('/v1/cancellation-policies', {
            params: { propertyId, limit: 100, page },
          })
        ).data;
        const items = payload.data ?? payload;
        result.push(...items);
        if (items.length < 100) break;
      }
      return result;
    },
    enabled: !policy,
  });
  const set = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    onDirtyChange?.(true);
    setSaved(false);
  };
  const field = (
    key: string,
    label: string,
    type = 'text',
    required = false,
    maxLength?: number,
  ) => (
    <Field label={label}>
      <input
        className={control}
        type={type}
        required={required}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
        maxLength={maxLength}
        value={draft[key] ?? ''}
        onChange={(e) =>
          set(
            key,
            key === 'freeCancelHoursBeforeArrival'
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </Field>
  );
  const select = (key: string, label: string, options: string[][]) => (
    <Field label={label}>
      <select
        className={control}
        value={draft[key] ?? ''}
        onChange={(e) => set(key, e.target.value || null)}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const path = policy ? 'cancellation-policies' : 'rate-plans';
      if (base.id) {
        const current = (
          await api.get(`/v1/${path}/${base.id}`, { params: { propertyId } })
        ).data;
        if (current.updatedAt !== base.updatedAt)
          throw Error(
            'These terms changed after you opened them. Reload before saving.',
          );
      }
      const keys = policy
        ? [
            'name',
            'code',
            'description',
            'freeCancelHoursBeforeArrival',
            'penaltyType',
            'penaltyPercentage',
            'depositHandling',
            'isActive',
          ]
        : [
            'name',
            'code',
            'description',
            'baseAmount',
            'currencyCode',
            'isTaxInclusive',
            'mealPlan',
            'validFrom',
            'validTo',
            'cancellationPolicyId',
          ];
      const patch = Object.fromEntries(
        keys
          .filter((k) => !base.id || draft[k] !== base[k])
          .map((k) => [
            k,
            draft[k] === '' &&
            ['validFrom', 'validTo', 'penaltyPercentage'].includes(k)
              ? null
              : draft[k],
          ]),
      );
      const response = base.id
        ? await api.patch(`/v1/${path}/${base.id}`, patch, {
            params: { propertyId },
          })
        : await api.post(`/v1/${path}`, { ...patch, propertyId });
      const next = response.data.data ?? response.data;
      setBase(next);
      setDraft(next);
      setDirty(false);
      onDirtyChange?.(false);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: [path] });
      await queryClient.invalidateQueries({ queryKey: ['policy-options'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="my-6 rounded-xl bg-white p-4 shadow-sm sm:p-6"
    >
      <h2 className="mb-4 text-lg font-semibold">
        {policy ? 'Policy details' : 'Edit rate & booking terms'}
      </h2>
      <fieldset disabled={saving || !canManage} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Name', 'text', true, 100)}
          {field('code', 'Code', 'text', true, 20)}
        </div>
        <Field label="Description">
          <textarea
            className={control}
            rows={3}
            value={draft.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        {policy ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {field(
                'freeCancelHoursBeforeArrival',
                'Free cancellation cutoff (hours before arrival)',
                'number',
                true,
              )}
              {select('penaltyType', 'Late cancellation charge', [
                ['none', 'None'],
                ['first_night', 'First night'],
                ['percentage', 'Percentage of stay'],
                ['full', 'Full stay'],
              ])}
              {draft.penaltyType === 'percentage' &&
                field(
                  'penaltyPercentage',
                  'Cancellation charge (%)',
                  'number',
                  true,
                )}
            </div>
            {select('depositHandling', 'Deposit handling', [
              ['refund_if_refundable', 'Refund if refundable'],
              ['always_forfeit', 'Always forfeit'],
              ['always_refund', 'Always refund'],
            ])}
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive !== false}
                onChange={(e) => set('isActive', e.target.checked)}
              />
              Active policy
            </label>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('baseAmount', 'Base nightly amount', 'number', true)}
              {field('currencyCode', 'Currency', 'text', true, 3)}
              {field('validFrom', 'Valid from', 'date')}
              {field('validTo', 'Valid until', 'date')}
            </div>
            {select('mealPlan', 'Meal plan', [
              ['room_only', 'Room only'],
              ['breakfast', 'Breakfast'],
              ['half_board', 'Half board'],
              ['full_board', 'Full board'],
              ['all_inclusive', 'All inclusive'],
            ])}
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isTaxInclusive ?? false}
                onChange={(e) => set('isTaxInclusive', e.target.checked)}
              />
              Rate includes tax
            </label>
            {policies.isError ? (
              <p role="alert">
                Could not load policies.{' '}
                <button type="button" onClick={() => policies.refetch()}>
                  Try again
                </button>
              </p>
            ) : (
              select('cancellationPolicyId', 'Cancellation policy', [
                ['', 'No linked policy'],
                ...(policies.data ?? [])
                  .filter(
                    (p) => p.isActive || p.id === draft.cancellationPolicyId,
                  )
                  .map((p) => [
                    p.id,
                    p.name + (p.isActive === false ? ' (inactive)' : ''),
                  ]),
              ])
            )}
            <Link
              className="inline-flex min-h-[44px] items-center text-sm text-telivity-teal underline"
              to={`/rate-plans/policies?propertyId=${propertyId}`}
            >
              Manage cancellation policies
            </Link>
          </>
        )}
      </fieldset>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <p role="status" className="text-sm">
          {saving
            ? 'Saving…'
            : saved
              ? 'Changes saved.'
              : dirty
                ? 'You have unsaved changes.'
                : ''}
        </p>
        <button
          disabled={!dirty || saving || !canManage}
          className="min-h-[44px] rounded-lg bg-telivity-teal px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save {policy ? 'policy' : 'rate terms'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
