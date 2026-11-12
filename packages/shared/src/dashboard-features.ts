/** Optional dashboard surfaces. Visibility never grants or revokes API permissions. */
export const DASHBOARD_FEATURES = [
  'analytics', 'frontDesk', 'guests', 'billing', 'housekeeping', 'groups',
  'commercial', 'cashier', 'houseAccounts', 'accounting', 'tax', 'revenue',
  'nightAudit', 'reports', 'channels', 'integrations', 'communications',
  'reviews', 'staff', 'import',
] as const;
export type DashboardFeature = typeof DASHBOARD_FEATURES[number];
export interface DashboardFeaturesConfig { enabled: DashboardFeature[] }
