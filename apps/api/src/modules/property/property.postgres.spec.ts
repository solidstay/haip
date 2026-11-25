import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PropertyService } from './property.service';
import { PermissionsService } from '../auth/permissions.service';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/permissions.catalog';

const url = process.env['PROPERTY_TEST_DATABASE_URL'];
describe.skipIf(!url)('property creation on PostgreSQL', () => {
  // Opt in only against a disposable, migrated database.
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 3 });
  const db = drizzle(client, { schema });
  const service = new PropertyService(db);
  let code: string;
  beforeEach(() => { code = randomUUID().slice(0, 20); });
  afterEach(async () => {
    const rows = await db.select().from(schema.properties).where(eq(schema.properties.code, code));
    for (const row of rows) {
      await db.delete(schema.auditLogs).where(eq(schema.auditLogs.propertyId, row.id));
      await db.delete(schema.userRoles).where(eq(schema.userRoles.propertyId, row.id));
      await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.propertyId, row.id));
      await db.delete(schema.roles).where(eq(schema.roles.propertyId, row.id));
    }
    await db.delete(schema.properties).where(eq(schema.properties.code, code));
  });
  afterAll(() => client.end());
  const input = () => ({ name: 'Synthetic property creation test', code, countryCode: 'GB', timezone: 'Europe/London', currencyCode: 'GBP', totalRooms: 2, overbookingPercentage: 0 });
  it('persists and lists the record with zero overbooking and no invented rooms', async () => {
    const created = await service.create(input());
    expect(await service.findById(created.id)).toMatchObject({ ...input(), isActive: true, staffLogoUrl: null });
    expect(await service.findAll()).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    expect(await db.select().from(schema.rooms).where(eq(schema.rooms.propertyId, created.id))).toEqual([]);
  });
  it('rejects an existing code without changing the original property', async () => {
    const original = await service.create(input());
    await expect(service.create({ ...input(), name: 'Must not overwrite' })).rejects.toBeInstanceOf(ConflictException);
    expect(await service.findById(original.id)).toMatchObject(input());
  });
  it('allows exactly one of two concurrent attempts with the same code', async () => {
    const results = await Promise.allSettled([service.create(input()), service.create(input())]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ConflictException);
    expect(await db.select().from(schema.properties).where(eq(schema.properties.code, code))).toHaveLength(1);
  });
  it('retains an unconfigured property while deactivated and supports reactivation', async () => {
    const created = await service.create({ ...input(), totalRooms: 0 });
    await service.update(created.id, { isActive: false });
    expect(await service.findAll()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    expect(await service.findById(created.id)).toMatchObject({ id: created.id, totalRooms: 0, isActive: false, name: input().name });
    await service.update(created.id, { isActive: true });
    expect(await service.findAll()).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, totalRooms: 0 })]));
    expect(await db.select().from(schema.rooms).where(eq(schema.rooms.propertyId, created.id))).toEqual([]);
    expect((await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.propertyId, created.id))).map(row => row.description)).toEqual(['property.deactivated', 'property.activated']);
  });
  it('gives only the linked administrator creator scoped access to their new property', async () => {
    const sub = randomUUID();
    const [user] = await db.insert(schema.users).values({ email: `${sub}@example.test`, name: 'Creation test administrator', keycloakSub: sub, status: 'active' }).returning();
    const permissions = new PermissionsService(db);
    try {
      const authenticated = new PropertyService(db, undefined, permissions);
      const created = await authenticated.create({ ...input(), totalRooms: 0 }, { sub, email: user.email, name: user.name, roles: ['admin'] });
      expect((await permissions.getEffectivePermissions(user.id, created.id)).sort()).toEqual([...ROLE_DEFAULT_PERMISSIONS['admin']!].sort());
      const assignments = await db.select().from(schema.userRoles).where(eq(schema.userRoles.propertyId, created.id));
      expect(assignments).toHaveLength(1);
      expect(assignments[0].userId).toBe(user.id);
    } finally {
      await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, user.id));
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  });
  it('rolls back creation and grants when the audit write fails', async () => {
    const sub = randomUUID();
    const [user] = await db.insert(schema.users).values({ email: `${sub}@example.test`, name: 'Rollback test administrator', keycloakSub: sub, status: 'active' }).returning();
    const failingDb = new Proxy(db, { get(target, key) {
      if (key !== 'transaction') return Reflect.get(target, key);
      return (callback: (tx: unknown) => unknown) => target.transaction(tx => callback(new Proxy(tx, { get(transaction, field) {
        if (field === 'insert') return (table: unknown) => { if (table === schema.auditLogs) throw new Error('audit unavailable'); return transaction.insert(table as typeof schema.properties); };
        return Reflect.get(transaction, field);
      } })));
    } });
    try {
      const authenticated = new PropertyService(failingDb, undefined, new PermissionsService(db));
      await expect(authenticated.create(input(), { sub, email: user.email, name: user.name, roles: ['admin'] })).rejects.toThrow('audit unavailable');
      expect(await db.select().from(schema.properties).where(eq(schema.properties.code, code))).toEqual([]);
      expect(await db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, user.id))).toEqual([]);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  });
});
