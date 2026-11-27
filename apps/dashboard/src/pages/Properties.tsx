import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, CalendarDays, DoorOpen, Image, Plus, Search, Tag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';

const control = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal';
const secondary = `${control} border border-gray-200 bg-white text-telivity-navy hover:bg-telivity-light-grey`;

export default function Properties() {
  const { t } = useTranslation();
  const { hasRole, hasPermission } = useAuth();
  const { properties, propertiesLoading, propertiesError } = useProperty();
  const [search, setSearch] = useState('');
  const matches = properties.filter(property => `${property.name} ${property.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  return (
    <section className="property-hub w-full" aria-labelledby="properties-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Building2 size={24} className="shrink-0 text-telivity-teal" aria-hidden="true" />
            <h1 id="properties-title" className="text-2xl font-semibold text-telivity-navy">{t('propertyHub.title')}</h1>
          </div>
          <p className="mt-2 text-sm leading-6 text-telivity-slate">{t('propertyHub.description')}</p>
        </div>
        {hasRole('admin') && (
          <Link className={`${control} shrink-0 bg-telivity-teal text-white hover:bg-telivity-light-teal`} to="/properties/new">
            <Plus size={16} aria-hidden="true" />{t('addProperty.title')}
          </Link>
        )}
      </div>
      {propertiesLoading ? (
        <p role="status" className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-telivity-slate">{t('propertyScope.loading')}</p>
      ) : propertiesError ? (
        <div role="alert" className="rounded-xl border border-gray-200 bg-white p-6 text-sm">
          <p>{t('propertyScope.loadFailed')}</p>
          <button className={`${secondary} mt-3`} onClick={() => window.location.reload()}>{t('propertyScope.reload')}</button>
        </div>
      ) : (
        <>
          {properties.length > 0 && (
            <div className="mb-6 max-w-lg">
              <label htmlFor="hub-search" className="mb-2 block text-sm font-medium text-telivity-navy">{t('propertyScope.search')}</label>
              <div className="relative">
                <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-telivity-slate" aria-hidden="true" />
                <input id="hub-search" type="search" value={search} onChange={event => setSearch(event.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-base text-telivity-navy focus:border-telivity-teal focus:outline-none focus:ring-2 focus:ring-telivity-teal/30" />
              </div>
            </div>
          )}
          {!matches.length && <p role="status" className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-telivity-slate">{t(properties.length ? 'propertyHub.noMatches' : 'propertyHub.empty')}</p>}
          <ul className="space-y-4">
            {matches.map(property => {
              const query = `?propertyId=${encodeURIComponent(property.id)}`;
              return (
                <li key={property.id} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                  <h2 className="break-words text-base font-semibold text-telivity-navy">{property.name}</h2>
                  <p className="mt-1 break-words text-sm text-telivity-slate">{property.code}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {hasPermission('settings.manage') && <Link className={`${secondary} col-span-2`} to={`/settings${query}`}><Image size={16} className="shrink-0" aria-hidden="true" /><span>{t('propertyHub.photos')}</span></Link>}
                    {hasPermission('rooms.read') && <Link className={`${secondary} col-span-2`} to={`/rooms${query}`}><DoorOpen size={16} className="shrink-0" aria-hidden="true" /><span>{t('propertyHub.rooms')}</span></Link>}
                    {hasPermission('rateplans.read') && <Link className={secondary} to={`/rate-plans${query}`}><Tag size={16} className="shrink-0" aria-hidden="true" /><span>{t('propertyHub.pricing')}</span></Link>}
                    {hasPermission('reservations.read') && <Link className={secondary} to={`/reservations${query}`}><CalendarDays size={16} className="shrink-0" aria-hidden="true" /><span>{t('propertyHub.bookings')}</span></Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
