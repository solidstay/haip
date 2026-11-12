import type { DashboardFeature } from '@telivityhaip/shared';

export const OPTIONAL_ROUTES: Record<string, DashboardFeature> = {
  '/front-desk': 'frontDesk', '/guests': 'guests', '/folios': 'billing',
  '/housekeeping': 'housekeeping', '/groups': 'groups', '/commercial': 'commercial',
  '/cashier': 'cashier', '/house-accounts': 'houseAccounts', '/accounting': 'accounting',
  '/tax': 'tax', '/revenue': 'revenue', '/night-audit': 'nightAudit', '/reports': 'reports',
  '/channels': 'channels', '/integrations': 'integrations', '/communications': 'communications',
  '/reviews': 'reviews', '/import': 'import',
};

export function featureForLink(href: string): DashboardFeature | undefined {
  const url = new URL(href, 'https://dashboard.invalid');
  if (url.pathname === '/settings') {
    if (['users', 'roles'].includes(url.searchParams.get('tab') ?? '')) return 'staff';
    if (url.searchParams.get('tab') === 'webhooks') return 'integrations';
  }
  const root = '/' + url.pathname.split('/').filter(Boolean)[0];
  return OPTIONAL_ROUTES[root];
}
