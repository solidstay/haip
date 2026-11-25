import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsersService } from './users.service';
import { PermissionsService } from '../auth/permissions.service';

const url = process.env['PROPERTY_TEST_DATABASE_URL'];
describe.skipIf(!url)('cross-property roles on disposable PostgreSQL', () => {
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 3 });
  const db = drizzle(client, { schema });
  const permissions = new PermissionsService(db);
  const service = new UsersService(db, permissions);
  let source: string, target: string, userId: string, sourceRole: string, targetRole: string;
  beforeEach(async () => {
    source = randomUUID(); target = randomUUID(); userId = randomUUID(); sourceRole = randomUUID(); targetRole = randomUUID();
    await db.insert(schema.properties).values([source, target].map(id => ({ id, name: 'Synthetic scope', code: id.slice(0, 20), countryCode: 'GB', timezone: 'UTC', currencyCode: 'GBP', totalRooms: 0 })));
    await db.insert(schema.users).values({ id: userId, propertyId: source, email: `${userId}@example.test`, name: 'Synthetic reader' });
    await db.insert(schema.roles).values([{ id: sourceRole, propertyId: source, key: 'reader', name: 'Reader' }, { id: targetRole, propertyId: target, key: 'reader', name: 'Reader' }]);
    await db.insert(schema.rolePermissions).values([{ propertyId: source, roleId: sourceRole, permissionKey: 'rooms.read' }, { propertyId: target, roleId: targetRole, permissionKey: 'reservations.read' }]);
    await db.insert(schema.userRoles).values({ propertyId: source, userId, roleId: sourceRole });
  });
  afterEach(async () => {
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.propertyId, [source, target]));
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
    await db.delete(schema.rolePermissions).where(inArray(schema.rolePermissions.propertyId, [source, target]));
    await db.delete(schema.roles).where(inArray(schema.roles.propertyId, [source, target]));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await db.delete(schema.properties).where(inArray(schema.properties.id, [source, target]));
  });
  afterAll(() => client.end());
  it('grants and revokes at the target without changing the source assignments or home', async () => {
    expect(await service.assignRoles(userId, target, [targetRole, targetRole], undefined, source)).toEqual({ userId, propertyId: target, permissions: ['reservations.read'] });
    await service.assignRoles(userId, target, [targetRole], undefined, source);
    expect(await db.select().from(schema.userRoles).where(eq(schema.userRoles.propertyId, target))).toHaveLength(1);
    expect(await permissions.getEffectivePermissions(userId, source)).toEqual(['rooms.read']);
    expect((await db.select().from(schema.users).where(eq(schema.users.id, userId)))[0].propertyId).toBe(source);
    await service.assignRoles(userId, target, [], undefined, source);
    expect(await permissions.getEffectivePermissions(userId, target)).toEqual([]);
    expect(await permissions.getEffectivePermissions(userId, source)).toEqual(['rooms.read']);
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.propertyId, target))).toHaveLength(3);
  });
  it('retains the original same-property endpoint boundary and rejects false source scope', async () => {
    await expect(service.assignRoles(userId, target, [targetRole])).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assignRoles(userId, target, [targetRole], undefined, target)).rejects.toBeInstanceOf(NotFoundException);
    expect(await permissions.getEffectivePermissions(userId, target)).toEqual([]);
  });
  it('rejects a role from another property without deleting existing grants', async () => {
    await service.assignRoles(userId, target, [targetRole], undefined, source);
    await expect(service.assignRoles(userId, target, [sourceRole], undefined, source)).rejects.toBeInstanceOf(BadRequestException);
    expect(await permissions.getEffectivePermissions(userId, target)).toEqual(['reservations.read']);
  });
  it('supports a global identity through its source membership but does not expose unrelated users', async () => {
    await db.update(schema.users).set({ propertyId: null }).where(eq(schema.users.id, userId));
    expect(await service.list(source)).toEqual([]);
    expect((await service.list(source, true)).map((user: { id: string }) => user.id)).toEqual([userId]);
    expect(await service.list(target, true)).toEqual([]);
    await service.assignRoles(userId, target, [targetRole], undefined, source);
    expect((await service.list(target, true)).map((user: { id: string }) => user.id)).toEqual([userId]);
    expect(await permissions.getEffectivePermissions(userId, target)).toEqual(['reservations.read']);
  });
  it('rolls back the assignment replacement when auditing fails', async () => {
    await service.assignRoles(userId, target, [targetRole], undefined, source);
    await expect(service.assignRoles(userId, target, [], { userId: 'invalid-uuid', userEmail: null, ipAddress: null }, source)).rejects.toThrow();
    expect(await permissions.getEffectivePermissions(userId, target)).toEqual(['reservations.read']);
  });
});
