import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { DASHBOARD_FEATURES } from '@telivityhaip/shared';
import { DashboardSettingsController, UpdateDashboardFeaturesDto } from './dashboard-settings.controller';
import { DashboardSettingsService } from './dashboard-settings.service';
import { RolesGuard } from '../auth/roles.guard';

const config = (profile?: string) => new ConfigService({ DASHBOARD_DEFAULT_PROFILE: profile });
const emptyDb = { select: () => ({ from: () => ({ where: async () => [] }) }) };
describe('dashboard settings contract', () => {
  it('retains full navigation for existing installations and supports Essentials deployment defaults', async () => {
    expect(await new DashboardSettingsService(emptyDb, config()).get()).toEqual({ enabled: [...DASHBOARD_FEATURES] });
    expect(await new DashboardSettingsService(emptyDb, config('essentials')).get()).toEqual({ enabled: [] });
  });
  it.each([undefined, null, 'reports', ['invented'], ['reports', 'reports'], [true]])('rejects malformed feature selection %j', async enabled => {
    expect((await validate(Object.assign(new UpdateDashboardFeaturesDto(), { enabled }))).length).toBeGreaterThan(0);
  });
  it('accepts Essentials and explicit optional tools', async () => {
    for (const enabled of [[], ['reports', 'channels']]) expect(await validate(Object.assign(new UpdateDashboardFeaturesDto(), { enabled }))).toEqual([]);
  });
  it('allows authenticated reads but restricts writes to realm admins', () => {
    const guard = new RolesGuard(new Reflector(), new ConfigService({ AUTH_ENABLED: 'true' }));
    const context = (handler: 'get' | 'update', roles: string[]) => ({
      getHandler: () => DashboardSettingsController.prototype[handler], getClass: () => DashboardSettingsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'staff', roles } }) }),
    }) as any;
    expect(guard.canActivate(context('get', ['receptionist']))).toBe(true);
    expect(() => guard.canActivate(context('update', ['receptionist']))).toThrow('Access denied');
    expect(guard.canActivate(context('update', ['admin']))).toBe(true);
  });
});
