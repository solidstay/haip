import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { dashboardSettings, auditLogs } from '@telivityhaip/database';
import { DASHBOARD_FEATURES, type DashboardFeaturesConfig } from '@telivityhaip/shared';
import { DRIZZLE } from '../../database/database.module';
import { actorFields, type AuditActor } from '../../common/audit/audit-actor';

@Injectable()
export class DashboardSettingsService {
  constructor(@Inject(DRIZZLE) private readonly db: any, private readonly config: ConfigService) {}

  async get(): Promise<DashboardFeaturesConfig> {
    // Global presentation preferences, deliberately independent of selected tenant.
    const [row] = await this.db.select().from(dashboardSettings).where(eq(dashboardSettings.id, 'navigation'));
    const enabled: string[] = row?.enabled ?? (this.config.get('DASHBOARD_DEFAULT_PROFILE') === 'essentials' ? [] : [...DASHBOARD_FEATURES]);
    return { enabled: DASHBOARD_FEATURES.filter(feature => enabled.includes(feature)) };
  }

  async update(dto: DashboardFeaturesConfig, actor: AuditActor): Promise<DashboardFeaturesConfig> {
    const enabled = DASHBOARD_FEATURES.filter(feature => dto.enabled.includes(feature));
    await this.db.transaction(async (tx: any) => {
      await tx.insert(dashboardSettings).values({ id: 'navigation', enabled })
        .onConflictDoUpdate({ target: dashboardSettings.id, set: { enabled, updatedAt: new Date() } });
      await tx.insert(auditLogs).values({
        propertyId: null, action: 'update', entityType: 'dashboard_settings',
        description: 'dashboard.navigation_updated', newValue: { enabled }, ...actorFields(actor),
      });
    });
    return { enabled };
  }
}
