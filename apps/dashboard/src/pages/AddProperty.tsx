import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Controller, useForm, type RegisterOptions } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { countryOptions, currencyOptions, timezoneOptions, ReferenceSelect, type ReferenceOption } from '../components/property/ReferenceSelect';
import AddressLookup from '../components/property/AddressLookup';
import { normalizePostalCode } from '@telivityhaip/shared';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';
import type { PropertySummary } from '../lib/property-types';

type PropertyForm = {
  name: string; code: string; countryCode: string; timezone: string;
  currencyCode: string; totalRooms: number; addressLine1: string;
  city: string; stateProvince: string; postalCode: string; email: string; phone: string;
  checkInTime: string; checkOutTime: string;
};

const inputClass = 'mt-2 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-telivity-navy focus:border-telivity-teal focus:outline-none focus:ring-2 focus:ring-telivity-teal/30';
const linkClass = 'inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-telivity-navy hover:bg-telivity-light-grey focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal';

export default function AddProperty() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { addCreatedProperty, propertyId } = useProperty();
  const navigate = useNavigate();
  const [created, setCreated] = useState<PropertySummary | null>(null);
  const [requestError, setRequestError] = useState('');
  const submitting = useRef(false);
  const focusNewForm = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const { control, watch, setValue, register, handleSubmit, reset, setError, setFocus, formState: { errors, isSubmitting } } = useForm<PropertyForm>({
    defaultValues: { checkInTime: '15:00', checkOutTime: '11:00', countryCode: '', currencyCode: '', timezone: '' },
  });

  useEffect(() => {
    if (isSubmitting) return;
    if (errors.code?.type === 'server') setFocus('code');
    else if (requestError) feedback.current?.focus();
    else if (created) successHeading.current?.focus();
    else if (focusNewForm.current) { setFocus('name'); focusNewForm.current = false; }
  }, [isSubmitting, errors.code, requestError, created, setFocus]);

  if (!hasRole('admin')) return <section className="max-w-2xl">
    <h1 className="text-2xl font-semibold text-telivity-navy">{t('addProperty.title')}</h1>
    <p role="alert" className="mt-3 text-telivity-slate">{t('addProperty.adminOnly')}</p>
  </section>;

  const submit = handleSubmit(async values => {
    if (submitting.current) return;
    submitting.current = true;
    setRequestError('');
    if (values.postalCode) values.postalCode = normalizePostalCode(values.postalCode, values.countryCode);
    try {
      const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
      // Creating a tenant must not inherit the currently selected tenant's query parameter.
      const response = await api.post('/v1/properties', { ...payload, overbookingPercentage: 0 }, {
        params: { propertyId: undefined }, skipErrorToast: true,
      });
      const property: PropertySummary = response.data?.data ?? response.data;
      addCreatedProperty(property);
      setCreated(property);
      navigate(`/properties/new?propertyId=${encodeURIComponent(property.id)}`, { replace: true });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setError('code', { type: 'server', message: t('addProperty.codeTaken') });
      } else {
        setRequestError(t(isAxiosError(error) && error.response?.status === 403
          ? 'addProperty.adminOnly' : 'addProperty.failed'));
      }
    } finally {
      submitting.current = false;
    }
  });

  function field(name: keyof PropertyForm, options: RegisterOptions<PropertyForm> = {}, attributes: InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) {
    return <div key={name}>
      <label htmlFor={`property-${name}`} className="block text-sm font-medium text-telivity-navy">
        {t(`addProperty.fields.${name}`)}{options.required ? ' *' : ''}
      </label>
      <input id={`property-${name}`} {...attributes} {...register(name, options)}
        aria-required={!!options.required} aria-invalid={!!errors[name]}
        aria-describedby={[hint && `property-${name}-hint`, errors[name] && `property-${name}-error`].filter(Boolean).join(' ') || undefined}
        className={inputClass} />
      {hint && <p id={`property-${name}-hint`} className="mt-2 text-sm text-telivity-slate">{hint}</p>}
      {errors[name] && <p id={`property-${name}-error`} role="alert" className="mt-2 text-sm text-red-700">{errors[name]?.message}</p>}
    </div>;
  }

  function reference(name: 'countryCode' | 'currencyCode' | 'timezone', label: string, options: ReferenceOption[]) {
    return <div><label htmlFor={`property-${name}`} className="block text-sm font-medium text-telivity-navy">{label} *</label>
      <Controller name={name} control={control} rules={{ required: t('addProperty.required'), validate: value => options.some(item => item.value === value) || 'Choose an option from the list.' }}
        render={({ field: { ref, ...props } }) => <ReferenceSelect {...props} ref={ref} id={`property-${name}`} required disabled={isSubmitting} options={options} className={inputClass}
          aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `property-${name}-error` : undefined} />} />
      {errors[name] && <p id={`property-${name}-error`} role="alert" className="mt-2 text-sm text-red-700">{errors[name]?.message}</p>}
    </div>;
  }
  const countryCode = watch('countryCode');
  const required = { required: t('addProperty.required'), setValueAs: (value: string) => value.trim() };
  const optional = { setValueAs: (value: string) => value.trim() };

  if (created) {
    const query = `?propertyId=${encodeURIComponent(created.id)}`;
    return <section className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-5 sm:p-8">
      <h1 ref={successHeading} tabIndex={-1} className="break-words text-2xl font-semibold text-telivity-navy">{t('addProperty.created', { name: created.name })}</h1>
      <p className="mt-3 text-telivity-slate">{t('addProperty.nextSteps')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className={linkClass} to={`/rooms${query}`}>{t('addProperty.setupRooms')}</Link>
        <Link className={linkClass} to={`/rate-plans${query}`}>{t('addProperty.setupRates')}</Link>
        <Link className={linkClass} to={`/settings${query}`}>{t('addProperty.setupSettings')}</Link>
      </div>
      <button type="button" className={`${linkClass} mt-6`} onClick={() => {
        reset(); setRequestError(''); focusNewForm.current = true; setCreated(null);
      }}>{t('addProperty.another')}</button>
    </section>;
  }

  return <section className="w-full max-w-3xl">
    <h1 className="text-2xl font-semibold text-telivity-navy">{t('addProperty.title')}</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-telivity-slate">{t('addProperty.description')}</p>
    <form noValidate onSubmit={submit} aria-busy={isSubmitting} className="mt-6 rounded-xl border border-gray-200 bg-white p-5 sm:p-8">
      <p className="mb-6 text-sm text-telivity-slate">{t('addProperty.requiredHint')}</p>
      {requestError && <p ref={feedback} tabIndex={-1} role="alert" className="mb-6 text-sm text-red-700">{requestError}</p>}
      <fieldset disabled={isSubmitting}>
        <legend className="mb-4 text-lg font-semibold text-telivity-navy">{t('addProperty.basics')}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {field('name', required, { maxLength: 255, autoComplete: 'organization' })}
          {field('code', required, { maxLength: 20, autoComplete: 'off' }, t('addProperty.codeHint'))}
          {field('totalRooms', { required: t('addProperty.required'), valueAsNumber: true, validate: value => (Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2147483647) || t('addProperty.roomsInvalid') }, { type: 'number', min: 1, step: 1 }, t('addProperty.roomsHint'))}
          {reference('currencyCode', 'Currency', currencyOptions)}
        </div>
      </fieldset>
      <fieldset disabled={isSubmitting} className="mt-8 border-t border-gray-200 pt-6">
        <legend className="text-lg font-semibold text-telivity-navy">{t('addProperty.location')}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {reference('countryCode', 'Country', countryOptions)}
          {reference('timezone', 'Timezone', timezoneOptions)}
          <div className="sm:col-span-2"><AddressLookup countryCode={countryCode} disabled={isSubmitting} onSelect={item => {
            if (item.source === 'address') {
              setValue('addressLine1', item.addressLine1 ?? '', { shouldDirty: true });
              setValue('city', item.city ?? '', { shouldDirty: true });
              setValue('stateProvince', item.stateProvince ?? '', { shouldDirty: true });
            }
            setValue('postalCode', item.postalCode ?? '', { shouldDirty: true });
          }} /></div>
          {field('addressLine1', optional, { maxLength: 255, autoComplete: 'address-line1' })}
          {field('city', optional, { maxLength: 100, autoComplete: 'address-level2' })}
          {field('stateProvince', optional, { maxLength: 100, autoComplete: 'address-level1' })}
          {field('postalCode', optional, { maxLength: 20, autoComplete: 'postal-code' })}
        </div>
      </fieldset>
      <fieldset disabled={isSubmitting} className="mt-8 border-t border-gray-200 pt-6">
        <legend className="text-lg font-semibold text-telivity-navy">{t('addProperty.operations')}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {field('checkInTime', { ...required, pattern: { value: /^([01]\d|2[0-3]):[0-5]\d$/, message: t('addProperty.timeInvalid') } }, { type: 'time' })}
          {field('checkOutTime', { ...required, pattern: { value: /^([01]\d|2[0-3]):[0-5]\d$/, message: t('addProperty.timeInvalid') } }, { type: 'time' })}
          {field('email', { ...optional, pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('addProperty.emailInvalid') } }, { type: 'email', maxLength: 255, autoComplete: 'email' })}
          {field('phone', optional, { type: 'tel', maxLength: 30, autoComplete: 'tel' })}
        </div>
      </fieldset>
      <div className="mt-8 flex flex-wrap gap-3 border-t border-gray-200 pt-6">
        <button type="submit" disabled={isSubmitting} className="min-h-[44px] rounded-lg bg-telivity-teal px-5 py-2 text-sm font-semibold text-white hover:bg-telivity-teal/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal disabled:cursor-wait disabled:opacity-60">
          {t(isSubmitting ? 'addProperty.saving' : 'addProperty.create')}
        </button>
        {!isSubmitting && <Link className={linkClass} to={propertyId ? `/settings?propertyId=${encodeURIComponent(propertyId)}` : '/'}>{t('common.cancel')}</Link>}
      </div>
    </form>
  </section>;
}
