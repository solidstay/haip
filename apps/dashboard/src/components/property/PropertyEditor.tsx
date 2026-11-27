import { useUnsavedChanges } from './useUnsavedChanges';
import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import MediaLibrarySummary from '../media/MediaLibrarySummary';

export const control =
  '[scroll-margin-block:120px] w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-telivity-navy transition-colors focus:outline-none focus:ring-2 focus:ring-telivity-teal/40 disabled:bg-gray-50';
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-telivity-navy"
      >
        {label}
      </label>
      {cloneElement(children as ReactElement, {
        id,
        'aria-describedby': hint ? `${id}-hint` : undefined,
      })}
      {hint && (
        <p
          id={`${id}-hint`}
          className="mt-1.5 text-xs leading-5 text-telivity-slate"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
export function EditorSection({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 border-t border-gray-100 py-7 first:border-0"
    >
      <h2 className="text-lg font-semibold text-telivity-navy">{title}</h2>
      <p className="mb-5 mt-1 text-sm leading-6 text-telivity-slate">{hint}</p>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
export const lines = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
export function errorMessage(error: unknown): string {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  ).response?.data?.message;
  return Array.isArray(message)
    ? message.join('. ')
    : message ||
        (error instanceof Error
          ? error.message
          : 'Could not save. Your edits are retained; please try again.');
}
// Native HTTP fields only. Unknown settings remain owned by their existing tools.
type PropertyRecord = Record<string, any>;
export default function PropertyEditor({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ['properties', propertyId],
    queryFn: async () => (await api.get(`/v1/properties/${propertyId}`)).data,
  });
  if (query.isError)
    return (
      <div role="alert" className="p-6">
        Could not load property details.{' '}
        <button className="underline" onClick={() => query.refetch()}>
          Try again
        </button>
      </div>
    );
  if (!query.data)
    return (
      <div
        aria-label="Loading property details"
        className="space-y-5 rounded-xl bg-white p-6 motion-safe:animate-pulse"
      >
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-24 rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  return (
    <PropertyForm
      key={propertyId}
      propertyId={propertyId}
      property={query.data.data ?? query.data}
    />
  );
}
function PropertyForm({
  propertyId,
  property,
}: {
  propertyId: string;
  property: PropertyRecord;
}) {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManage = hasRole('admin');
  const [base, setBase] = useState(property);
  const [draft, setDraft] = useState<PropertyRecord>(property);
  const [listing, setListing] = useState<PropertyRecord>(
    property.settings?.publicListing ?? {
      houseRules: [],
      amenities: [],
      address: null,
      map: null,
      checkInUntil: null,
      checkOutFrom: null,
    },
  );
  const [rules, setRules] = useState<string>(
    (property.settings?.publicListing?.houseRules ?? []).join('\n'),
  );
  const [amenities, setAmenities] = useState<string>(
    (property.settings?.publicListing?.amenities ?? []).join('\n'),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const edit = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setMessage('');
  };
  const editListing = (key: string, value: unknown) => {
    setListing((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setMessage('');
  };
  useUnsavedChanges(dirty);
  const text = (
    key: string,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      maxLength?: number;
      hint?: string;
    } = {},
  ) => (
    <Field label={label} hint={options.hint}>
      <input
        className={control}
        type={options.type ?? 'text'}
        required={options.required}
        maxLength={options.maxLength}
        value={draft[key] ?? ''}
        onChange={(e) => edit(key, e.target.value)}
      />
    </Field>
  );
  const number = (key: string, label: string, min: number, max?: number) => (
    <Field label={label}>
      <input
        className={control}
        type="number"
        min={min}
        max={max}
        step="1"
        value={draft[key] ?? ''}
        onChange={(e) =>
          edit(key, e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </Field>
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      new Intl.DateTimeFormat('en', { timeZone: draft.timezone });
      if (
        !/^[A-Z]{2}$/.test(draft.countryCode) ||
        !/^[A-Z]{3}$/.test(draft.currencyCode)
      )
        throw Error(
          'Use uppercase country and currency codes, for example GB and GBP.',
        );
      setSaving(true);
      const keys = [
        'name',
        'code',
        'description',
        'addressLine1',
        'addressLine2',
        'city',
        'stateProvince',
        'postalCode',
        'countryCode',
        'phone',
        'email',
        'website',
        'timezone',
        'currencyCode',
        'defaultLanguage',
        'starRating',
        'taxJurisdiction',
        'checkInTime',
        'checkOutTime',
        'overbookingPercentage',
        'staffDisplayName',
        'staffLogoMediaId',
        'staffPrimaryColor',
        'staffAccentColor',
        'guestRegistrationRequired',
        'guestRegistrationConfig',
        'settings',
      ];
      const changes = Object.fromEntries(
        keys
          .filter(
            (key) => JSON.stringify(draft[key]) !== JSON.stringify(base[key]),
          )
          .map((key) => [
            key,
            draft[key] === '' &&
            ['email', 'starRating', 'staffLogoMediaId'].includes(key)
              ? null
              : draft[key],
          ]),
      );
      const response = await api.patch(`/v1/properties/${propertyId}`, {
        ...changes,
        expectedUpdatedAt: base.updatedAt,
        publicListing: {
          ...listing,
          houseRules: lines(rules),
          amenities: lines(amenities),
        },
      });
      const saved = response.data.data ?? response.data;
      setBase(saved);
      setDraft(saved);
      setListing(saved.settings.publicListing);
      setDirty(false);
      setMessage(
        'Changes saved. Published website content may take about a minute to refresh.',
      );
      await queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const scoped = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}propertyId=${encodeURIComponent(propertyId)}`;
  return (
    <form
      onSubmit={save}
      className="min-w-0 rounded-xl bg-white p-4 shadow-sm sm:p-6"
    >
      <MediaLibrarySummary propertyId={propertyId} />
      {!canManage && (
        <p role="status" className="mt-4 text-sm">
          Property settings are read-only. An administrator can save changes.
        </p>
      )}
      <nav
        aria-label="Property detail sections"
        className="my-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-gray-100 py-3"
      >
        {[
          ['overview', 'Overview'],
          ['location', 'Location'],
          ['rules', 'House rules'],
          ['operations', 'Operational setup'],
          ['advanced', 'Advanced'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-telivity-teal underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
          >
            {label}
          </a>
        ))}
      </nav>
      <fieldset disabled={saving || !canManage} className="min-w-0">
        <EditorSection
          id="overview"
          title="Property information"
          hint="Names, descriptions and facilities shown to guests."
        >
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            {text('name', 'Property name', { required: true, maxLength: 255 })}
            {text('code', 'Internal code', { required: true, maxLength: 20 })}
          </div>
          <Field
            label="Property description"
            hint="Describe the space and what guests can expect. Add house rules in the separate section below."
          >
            <textarea
              className={control}
              rows={7}
              value={draft.description ?? ''}
              onChange={(e) => edit('description', e.target.value)}
            />
          </Field>
          <Field
            label="Property amenities"
            hint="One amenity per line. Accommodation-specific amenities are managed under Room types."
          >
            <textarea
              className={control}
              rows={4}
              value={amenities}
              onChange={(e) => {
                setAmenities(e.target.value);
                setDirty(true);
                setMessage('');
              }}
            />
          </Field>
        </EditorSection>
        <EditorSection
          id="location"
          title="Location & contact"
          hint="Maintain the address used by staff and choose the location information guests can see."
        >
          {text('addressLine1', 'Address line 1', { maxLength: 255 })}
          {text('addressLine2', 'Address line 2', { maxLength: 255 })}
          <div className="grid gap-4 sm:grid-cols-2">
            {text('city', 'City', { maxLength: 100 })}
            {text('stateProvince', 'County / region', { maxLength: 100 })}
            {text('postalCode', 'Postcode', { maxLength: 20 })}
            {text('countryCode', 'Country code', {
              required: true,
              maxLength: 2,
              hint: 'Two-letter country code, for example GB.',
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('phone', 'Contact phone', { type: 'tel', maxLength: 30 })}
            {text('email', 'Contact email', { type: 'email' })}
          </div>
          {text('website', 'Property website', { type: 'url', maxLength: 500 })}
          <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={!!listing.address}
              onChange={(e) =>
                editListing(
                  'address',
                  e.target.checked
                    ? {
                        streetAddress: [draft.addressLine1, draft.addressLine2]
                          .filter(Boolean)
                          .join(', '),
                        postalCode: draft.postalCode ?? '',
                      }
                    : null,
                )
              }
            />
            Show a public street address
          </label>
          {listing.address && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Public street address">
                <input
                  className={control}
                  required
                  maxLength={255}
                  value={listing.address.streetAddress}
                  onChange={(e) =>
                    editListing('address', {
                      ...listing.address,
                      streetAddress: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Public postcode">
                <input
                  className={control}
                  required
                  maxLength={20}
                  value={listing.address.postalCode}
                  onChange={(e) =>
                    editListing('address', {
                      ...listing.address,
                      postalCode: e.target.value,
                    })
                  }
                />
              </Field>
              <button
                type="button"
                className="min-h-[44px] text-left text-sm font-medium text-telivity-teal underline"
                onClick={() =>
                  editListing('address', {
                    streetAddress: [draft.addressLine1, draft.addressLine2]
                      .filter(Boolean)
                      .join(', '),
                    postalCode: draft.postalCode ?? '',
                  })
                }
              >
                Use the property address
              </button>
            </div>
          )}
          <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={!!listing.map}
              onChange={(e) =>
                editListing(
                  'map',
                  e.target.checked
                    ? { latitude: '', longitude: '', precision: 'approximate' }
                    : null,
                )
              }
            />
            Show a public map location
          </label>
          {listing.map && (
            <div className="grid gap-4 sm:grid-cols-3">
              {(['latitude', 'longitude'] as const).map((key) => (
                <Field
                  key={key}
                  label={key === 'latitude' ? 'Latitude' : 'Longitude'}
                >
                  <input
                    className={control}
                    required
                    type="number"
                    step="any"
                    min={key === 'latitude' ? -90 : -180}
                    max={key === 'latitude' ? 90 : 180}
                    value={listing.map[key]}
                    onChange={(e) =>
                      editListing('map', {
                        ...listing.map,
                        [key]:
                          e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              ))}
              <Field label="Map accuracy">
                <select
                  className={control}
                  value={listing.map.precision}
                  onChange={(e) =>
                    editListing('map', {
                      ...listing.map,
                      precision: e.target.value,
                    })
                  }
                >
                  <option value="approximate">Approximate area</option>
                  <option value="exact">Exact location</option>
                </select>
              </Field>
            </div>
          )}
        </EditorSection>
        <EditorSection
          id="rules"
          title="Arrival & house rules"
          hint="Times use the property timezone. A check-in cutoff after midnight means the following morning."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {text('checkInTime', 'Check-in from', {
              type: 'time',
              required: true,
            })}
            <Field label="Check-in until (optional)">
              <input
                className={control}
                type="time"
                value={listing.checkInUntil ?? ''}
                onChange={(e) =>
                  editListing('checkInUntil', e.target.value || null)
                }
              />
            </Field>
            <Field label="Check-out from (optional)">
              <input
                className={control}
                type="time"
                value={listing.checkOutFrom ?? ''}
                onChange={(e) =>
                  editListing('checkOutFrom', e.target.value || null)
                }
              />
            </Field>
            {text('checkOutTime', 'Check-out by', {
              type: 'time',
              required: true,
            })}
          </div>
          {text('timezone', 'Property timezone', {
            required: true,
            maxLength: 50,
            hint: 'For example Europe/London. This also controls operational dates and times.',
          })}
          <Field
            label="House rules"
            hint="One rule per line: children, pets, smoking, parties, arrival notice or identification. Financial and cancellation terms belong in rate plans and policies."
          >
            <textarea
              className={control}
              rows={8}
              value={rules}
              onChange={(e) => {
                setRules(e.target.value);
                setDirty(true);
                setMessage('');
              }}
            />
          </Field>
        </EditorSection>
        <EditorSection
          id="operations"
          title="Operational setup"
          hint="Use the existing tools for accommodation, availability and booking terms."
        >
          <div className="grid gap-x-6 sm:grid-cols-2">
            {[
              ['/rooms/types', 'Room types, beds & amenities'],
              ['/rooms', 'Physical units & unit photos'],
              ['/rate-plans', 'Rates & stay restrictions'],
              ['/rate-plans/policies', 'Cancellation policies'],
              ['/channels/ical', 'Calendar connections'],
              ['/settings?tab=booking-engine', 'Booking & payment settings'],
              ['/tax', 'Taxes & fees'],
            ].map(([path, label]) => (
              <Link
                key={path}
                to={scoped(path)}
                className="flex min-h-[48px] items-center justify-between gap-2 border-b border-gray-100 py-3 text-sm font-medium text-telivity-teal"
              >
                {label}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <p className="text-sm text-telivity-slate">
            Registered physical units: {base.totalRooms}. Manage actual units in
            Rooms.
          </p>
        </EditorSection>
        <details id="advanced" className="border-t border-gray-100 py-6">
          <summary className="min-h-[44px] cursor-pointer text-base font-semibold text-telivity-navy">
            Advanced property settings
          </summary>
          <div className="mt-4 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {text('currencyCode', 'Currency code', {
                required: true,
                maxLength: 3,
              })}
              {text('defaultLanguage', 'Default language', { maxLength: 5 })}
              {number('starRating', 'Verified star rating', 1, 5)}
              {number(
                'overbookingPercentage',
                'Overbooking allowance (%)',
                0,
                100,
              )}
            </div>
            {text('taxJurisdiction', 'Tax jurisdiction', { maxLength: 100 })}
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.guestRegistrationRequired !== false}
                onChange={(e) =>
                  edit('guestRegistrationRequired', e.target.checked)
                }
              />
              Require guest registration
            </label>
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={
                  draft.guestRegistrationConfig
                    ?.minorGuardianIdentificationRequired !== false
                }
                onChange={(e) =>
                  edit('guestRegistrationConfig', {
                    ...draft.guestRegistrationConfig,
                    minorGuardianIdentificationRequired: e.target.checked,
                  })
                }
              />
              Require guardian identification for minors
            </label>
            <h3 className="text-sm font-semibold">Reporting thresholds</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['occupancyRate', 'Occupancy warning below (0–1)'],
                ['adr', 'ADR warning below'],
                ['revpar', 'RevPAR warning below'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    className={control}
                    type="number"
                    min="0"
                    max={key === 'occupancyRate' ? 1 : undefined}
                    step="0.01"
                    value={
                      draft.settings?.kpiThresholds?.[key]?.warnBelow ?? ''
                    }
                    onChange={(e) =>
                      edit('settings', {
                        ...draft.settings,
                        kpiThresholds: {
                          ...draft.settings?.kpiThresholds,
                          [key]:
                            e.target.value === ''
                              ? {}
                              : { warnBelow: Number(e.target.value) },
                        },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            {text('staffDisplayName', 'Staff display name', { maxLength: 200 })}
            {text('staffLogoMediaId', 'Staff logo media ID')}
            <div className="grid gap-4 sm:grid-cols-2">
              {text('staffPrimaryColor', 'Staff primary colour', {
                maxLength: 9,
              })}
              {text('staffAccentColor', 'Staff accent colour', {
                maxLength: 9,
              })}
            </div>
          </div>
        </details>
      </fieldset>
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-gray-200 bg-white px-4 py-4 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-telivity-slate">
            {saving
              ? 'Saving changes…'
              : dirty
                ? 'You have unsaved changes.'
                : message || 'All changes saved.'}
          </p>
          <button
            type="submit"
            disabled={!dirty || saving || !canManage}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-telivity-teal px-5 py-2 text-sm font-semibold text-white hover:bg-telivity-dark-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {dirty ? (
              <Save size={16} aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            Save changes
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
