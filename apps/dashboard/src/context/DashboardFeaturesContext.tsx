import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_FEATURES, type DashboardFeature, type DashboardFeaturesConfig } from '@telivityhaip/shared';
import { api } from '../lib/api';
import { featureForLink } from '../lib/dashboard-features';

export const dashboardFeaturesKey = ['dashboard-features'];
type FeatureContext = {
  enabled: readonly DashboardFeature[];
  hasFeature: (feature: DashboardFeature) => boolean;
  showLink: (href: string) => boolean;
  loading: boolean;
  failed: boolean;
  reload: () => void;
};
const Context = createContext<FeatureContext>({
  enabled: DASHBOARD_FEATURES, hasFeature: () => true, showLink: () => true,
  loading: false, failed: false, reload: () => {},
});

export function DashboardFeaturesProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: dashboardFeaturesKey,
    queryFn: async (): Promise<DashboardFeaturesConfig> => {
      const response = await api.get('/v1/admin/dashboard-features', { params: { propertyId: undefined }, skipErrorToast: true });
      return response.data?.data ?? response.data;
    },
    staleTime: 30_000, refetchInterval: 60_000, retry: 1,
  });
  // Keep essential tools usable on failure, without flashing every optional tool.
  const enabled = query.data?.enabled ?? [];
  return <Context.Provider value={{
    enabled, hasFeature: feature => enabled.includes(feature),
    showLink: href => { const feature = featureForLink(href); return !feature || enabled.includes(feature); },
    loading: query.isPending, failed: query.isError, reload: () => { void query.refetch(); },
  }}>{children}</Context.Provider>;
}
export const useDashboardFeatures = () => useContext(Context);
