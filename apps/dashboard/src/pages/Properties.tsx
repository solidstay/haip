import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';

export default function Properties() {
  const { t } = useTranslation();
  const { hasRole, hasPermission } = useAuth();
  const { properties, propertiesLoading, propertiesError } = useProperty();
  const [search, setSearch] = useState('');
  const matches = properties.filter(property => `${property.name} ${property.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const link = 'inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-telivity-navy hover:bg-telivity-light-grey focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal';
  return <section className="w-full max-w-5xl">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold text-telivity-navy">{t('propertyHub.title')}</h1>
      {hasRole('admin') && <Link className={link + ' bg-white'} to="/properties/new">{t('addProperty.title')}</Link>}
    </div>
    <p className="mt-3 text-telivity-slate">{t('propertyHub.description')}</p>
    {propertiesLoading ? <p role="status" className="mt-6">{t('propertyScope.loading')}</p> : propertiesError ? <div role="alert" className="mt-6"><p>{t('propertyScope.loadFailed')}</p><button className={link + ' mt-3'} onClick={() => window.location.reload()}>{t('propertyScope.reload')}</button></div> : <>
      {properties.length > 0 && <div className="mt-6 max-w-lg"><label htmlFor="hub-search" className="block text-sm font-medium text-telivity-navy">{t('propertyScope.search')}</label><input id="hub-search" type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2 text-base" /></div>}
      {!matches.length && <p className="mt-6 text-telivity-slate">{t(properties.length ? 'propertyHub.noMatches' : 'propertyHub.empty')}</p>}
      <ul className="mt-6 space-y-4">
        {matches.map(property => {
          const query = `?propertyId=${encodeURIComponent(property.id)}`;
          return <li key={property.id} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="break-words text-lg font-semibold text-telivity-navy">{property.name}</h2>
            <p className="mt-1 text-sm text-telivity-slate">{property.code}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {hasPermission('settings.manage') && <Link className={link} to={`/settings${query}`}>{t('propertyHub.photos')}</Link>}
              {hasPermission('rooms.read') && <Link className={link} to={`/rooms${query}`}>{t('propertyHub.rooms')}</Link>}
              {hasPermission('rateplans.read') && <Link className={link} to={`/rate-plans${query}`}>{t('propertyHub.pricing')}</Link>}
              {hasPermission('reservations.read') && <Link className={link} to={`/reservations${query}`}>{t('propertyHub.bookings')}</Link>}
            </div>
          </li>;
        })}
      </ul>
    </>}
  </section>;
}
