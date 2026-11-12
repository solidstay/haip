import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DashboardSettingsService } from './dashboard-settings.service';

const url = process.env['DASHBOARD_TEST_DATABASE_URL'];
describe.skipIf(!url)('shared menu persistence on disposable PostgreSQL', () => {
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 3 });
  const db = drizzle(client, { schema });
  const service = new DashboardSettingsService(db, new ConfigService({ DASHBOARD_DEFAULT_PROFILE: 'essentials' }));
  const actor = { userId: null, userEmail: null, ipAddress: null };
  beforeEach(async () => {
    await db.delete(schema.dashboardSettings);
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.entityType, 'dashboard_settings'));
  });
  afterAll(() => client.end());
  it('persists across service instances, replaces selection, and records global audit events', async () => {
    expect(await service.get()).toEqual({ enabled: [] });
    await service.update({ enabled: ['reports', 'channels'] }, actor);
    const otherSession = new DashboardSettingsService(db, new ConfigService());
    expect(await otherSession.get()).toEqual({ enabled: ['reports', 'channels'] });
    await otherSession.update({ enabled: [] }, actor);
    expect(await service.get()).toEqual({ enabled: [] });
    expect(await db.select().from(schema.dashboardSettings)).toHaveLength(1);
    const events = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityType, 'dashboard_settings'));
    expect(events).toHaveLength(2);
    expect(events.every(event => event.propertyId === null)).toBe(true);
  });
  it('rolls back the preference if its audit write fails', async () => {
    await service.update({ enabled: ['reports'] }, actor);
    await expect(service.update({ enabled: [] }, { ...actor, userId: 'invalid-uuid' })).rejects.toThrow();
    expect(await service.get()).toEqual({ enabled: ['reports'] });
  });
  it('keeps a single coherent selection during concurrent saves', async () => {
    await Promise.all([service.update({ enabled: ['reports'] }, actor), service.update({ enabled: ['channels'] }, actor)]);
    expect([['reports'], ['channels']]).toContainEqual((await service.get()).enabled);
    expect(await db.select().from(schema.dashboardSettings)).toHaveLength(1);
  });
});
