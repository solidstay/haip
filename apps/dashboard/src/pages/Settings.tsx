import { useDashboardFeatures } from '../context/DashboardFeaturesContext';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Settings as SettingsIcon, Building, Link2, Shield, ShieldCheck, Globe } from 'lucide-react';
import { api } from '../lib/api';
import { useProperty } from '../context/PropertyContext';
import PropertyEditor from '../components/property/PropertyEditor';
import UserSettings from '../components/admin/UserSettings';
import RolesSettings from '../components/admin/RolesSettings';
import BookingEngineSettings from '../components/admin/BookingEngineSettings';
import { useTranslation } from 'react-i18next';

type Tab = 'property' | 'users' | 'roles' | 'webhooks' | 'booking-engine';

const TABS: { key: Tab; labelKey: string; icon: typeof Building }[] = [
  { key: 'property', labelKey: 'settings.tabs.property', icon: Building },
  { key: 'users', labelKey: 'settings.tabs.users', icon: Shield },
  { key: 'roles', labelKey: 'settings.tabs.roles', icon: ShieldCheck },
  { key: 'webhooks', labelKey: 'settings.tabs.webhooks', icon: Link2 },
  { key: 'booking-engine', labelKey: 'settings.tabs.bookingEngine', icon: Globe },
];

export default function Settings() {
  const { t } = useTranslation();
  const { propertyId } = useProperty();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasFeature } = useDashboardFeatures();
  const visibleTabs = TABS.filter(item => !(['users', 'roles'].includes(item.key) && !hasFeature('staff')) && !(item.key === 'webhooks' && !hasFeature('integrations')));
  const selectedTab = searchParams.get('tab') || 'property';
  const tab = TABS.some(item => item.key === selectedTab) ? selectedTab : 'property';
  function setTab(next: Tab) {
    setSearchParams(previous => { const params = new URLSearchParams(previous); params.set('tab', next); return params; });
  }

  if (!propertyId) {
    return <div className="flex items-center justify-center h-64 text-telivity-mid-grey">{t('settings.selectProperty')}</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon size={24} className="text-telivity-teal" />
        <h1 className="text-2xl font-semibold text-telivity-navy">{t('settings.title')}</h1>
      </div>

      <div className="flex flex-wrap gap-1 bg-white rounded-xl shadow-sm p-1 mb-4">
        {visibleTabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === tabItem.key ? 'bg-telivity-teal text-white' : 'text-telivity-slate hover:bg-telivity-light-grey'
              }`}
          >
            <tabItem.icon size={16} />
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'property' && <PropertyEditor key={propertyId} propertyId={propertyId} />}
      {tab === 'users' && <UserSettings propertyId={propertyId} />}
      {tab === 'roles' && <RolesSettings propertyId={propertyId} />}
      {tab === 'webhooks' && <WebhookSettings propertyId={propertyId} />}
      {tab === 'booking-engine' && <BookingEngineSettings propertyId={propertyId} />}
    </div>
  );
}

function WebhookSettings({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['connect', 'subscriptions', propertyId],
    queryFn: () => api.get('/v1/connect/subscriptions', { params: { propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });

  const subs = data?.data ?? data ?? [];

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-telivity-navy">{t('settings.agentWebhookSubscriptions')}</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-telivity-teal/5 border-b border-gray-100">
            <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('settings.subscriber')}</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('settings.callbackUrl')}</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('settings.events')}</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('settings.active')}</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-telivity-slate uppercase">{t('settings.failures')}</th>
          </tr>
        </thead>
        <tbody>
          {(subs as { id: string; subscriberId: string; subscriberName?: string; callbackUrl: string; events: string[]; isActive: boolean; failureCount: number }[]).map((s, i) => (
            <tr key={s.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
              <td className="px-4 py-3 text-sm font-medium text-telivity-navy">{s.subscriberName ?? s.subscriberId}</td>
              <td className="px-4 py-3 text-sm text-telivity-slate truncate max-w-[200px]">{s.callbackUrl}</td>
              <td className="px-4 py-3 text-sm text-telivity-slate">{s.events.join(', ')}</td>
              <td className="px-4 py-3">{s.isActive ? <span className="w-2 h-2 bg-telivity-dark-teal rounded-full inline-block" /> : <span className="w-2 h-2 bg-telivity-mid-grey rounded-full inline-block" />}</td>
              <td className="px-4 py-3 text-sm text-right">{s.failureCount}</td>
            </tr>
          ))}
          {subs.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-telivity-mid-grey">{t('settings.noWebhookSubscriptions')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

