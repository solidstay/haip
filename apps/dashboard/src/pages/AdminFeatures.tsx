import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DASHBOARD_FEATURES, type DashboardFeature } from '@telivityhaip/shared';
import { useAuth } from '../context/AuthContext';
import { dashboardFeaturesKey, useDashboardFeatures } from '../context/DashboardFeaturesContext';
import { api } from '../lib/api';

export default function AdminFeatures() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { enabled, loading, failed, reload } = useDashboardFeatures();
  const [draft, setDraft] = useState<DashboardFeature[] | null>(null);
  const selected = draft ?? enabled;
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (features: readonly DashboardFeature[]) => {
      const response = await api.put('/v1/admin/dashboard-features', { enabled: features }, { params: { propertyId: undefined }, skipErrorToast: true });
      return response.data?.data ?? response.data;
    },
    onSuccess: data => { queryClient.setQueryData(dashboardFeaturesKey, data); setDraft(null); },
  });
  const button = 'min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal disabled:opacity-50';
  function change(next: DashboardFeature[]) { setDraft(next); save.reset(); }
  return <section className="w-full max-w-3xl">
    <h1 className="text-2xl font-semibold text-telivity-navy">{t('adminFeatures.title')}</h1>
    {!hasRole('admin') ? <p role="alert" className="mt-4">{t('adminFeatures.adminOnly')}</p> : <>
      <p className="mt-3 text-telivity-slate">{t('adminFeatures.description')}</p>
      <p className="mt-3 text-sm text-telivity-slate">{t('adminFeatures.core')}</p>
      {loading ? <p role="status" className="mt-6">{t('adminFeatures.loading')}</p> : failed ? <div role="alert" className="mt-6"><p>{t('adminFeatures.loadFailed')}</p><button className={button + ' mt-3'} onClick={reload}>{t('adminFeatures.retry')}</button></div> : <form className="mt-6" onSubmit={event => { event.preventDefault(); save.mutate(selected); }}>
        <fieldset disabled={save.isPending}>
          <legend className="sr-only">{t('adminFeatures.optional')}</legend>
          <div className="flex flex-wrap gap-3 mb-5">
            <button type="button" className={button} onClick={() => change([])}>{t('adminFeatures.essentials')}</button>
            <button type="button" className={button} onClick={() => change([...DASHBOARD_FEATURES])}>{t('adminFeatures.showAll')}</button>
          </div>
          <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white px-4 sm:px-6">
            {DASHBOARD_FEATURES.map(feature => <label key={feature} className="flex min-h-[56px] cursor-pointer items-center gap-4 py-3 text-sm text-telivity-navy">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-telivity-teal" checked={selected.includes(feature)} onChange={event => change(event.target.checked ? [...selected, feature] : selected.filter(value => value !== feature))} />
              <span>{t(`adminFeatures.features.${feature}`)}</span>
            </label>)}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={draft === null} className={button + ' bg-telivity-teal text-white border-transparent'}>{t(save.isPending ? 'adminFeatures.saving' : 'adminFeatures.save')}</button>
            {draft !== null && <button type="button" className={button} onClick={() => { setDraft(null); save.reset(); }}>{t('adminFeatures.discard')}</button>}
            {save.isSuccess && <p role="status" className="text-sm text-telivity-slate">{t('adminFeatures.saved')}</p>}
            {save.isError && <p role="alert" className="text-sm text-red-700">{t('adminFeatures.saveFailed')}</p>}
          </div>
        </fieldset>
      </form>}
    </>}
  </section>;
}
