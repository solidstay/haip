import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '../auth/permissions.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { StaffInvitationsService } from './staff-invitations.service';
import { StaffIdentityService } from './staff-identity.service';
import type { AuthUser } from '../auth/current-user.decorator';
const url = process.env['OPERATIONS_TEST_DATABASE_URL'];
describe.skipIf(!url)('staff invitations on real PostgreSQL', () => {
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 8 });
  const db = drizzle(client, { schema }); const permissions = new PermissionsService(db);
  const identity = { ready: true, provision: vi.fn(), invite: vi.fn(), disable: vi.fn(), findOwned: vi.fn() };
  const staff = new StaffInvitationsService(db, identity as unknown as StaffIdentityService, permissions);
  const strategy = new JwtStrategy(new ConfigService({ KEYCLOAK_URL: 'http://identity.test', KEYCLOAK_REALM: 'test', KEYCLOAK_CLIENT_ID: 'haip-api' }), permissions);
  let props: string[], caller: AuthUser, actor: any, callerId: string;
  const dto = () => ({ name: 'Synthetic invited staff', email: randomUUID() + '@example.invalid', roleKey: 'general_manager' as const, propertyIds: [props[0]!] });
  beforeEach(async () => {
    vi.clearAllMocks(); identity.provision.mockImplementation(async () => randomUUID()); identity.invite.mockResolvedValue('sent'); identity.disable.mockResolvedValue(undefined); identity.findOwned.mockResolvedValue(undefined);
    props = [randomUUID(), randomUUID()]; callerId = randomUUID(); caller = { sub: randomUUID(), email: callerId + '@example.invalid', name: 'Synthetic administrator', roles: ['admin'] }; actor = { userId: callerId, userName: caller.name };
    for (const id of props) await db.insert(schema.properties).values({ id, name: 'Synthetic invitation property', code: id.slice(0,20), countryCode: 'GB', timezone: 'UTC', currencyCode: 'GBP', totalRooms: 1 });
    await db.insert(schema.users).values({ id: callerId, propertyId: props[0], keycloakSub: caller.sub, email: caller.email, name: caller.name, status: 'active' });
    for (const propertyId of props) { const roleId=randomUUID(); await db.insert(schema.roles).values({ id: roleId, propertyId, key: 'caller', name: 'Synthetic caller' }); await db.insert(schema.rolePermissions).values(['admin.users.manage','admin.roles.manage'].map(permissionKey=>({propertyId,roleId,permissionKey}))); await db.insert(schema.userRoles).values({propertyId,roleId,userId:callerId}); }
  });
  afterEach(async () => {
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.propertyId, props));
    await db.delete(schema.userRoles).where(inArray(schema.userRoles.propertyId, props));
    await db.delete(schema.rolePermissions).where(inArray(schema.rolePermissions.propertyId, props));
    await db.delete(schema.roles).where(inArray(schema.roles.propertyId, props));
    await db.delete(schema.users).where(inArray(schema.users.propertyId, props));
    await db.delete(schema.properties).where(inArray(schema.properties.id, props));
  });
  afterAll(() => client.end());
  it('creates a login invitation, requires verification, ignores elevated token claims, and grants only selected properties', async () => {
    const result = await staff.create(dto(), caller, actor); expect(result.status).toBe('invited'); expect(result.delivery).toBe('sent');
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id,result.id));
    const claims = { sub: row!.keycloakSub, email: row!.email, azp: 'haip-api', realm_access: { roles: ['admin'] }, property_ids: props };
    await expect(strategy.validate(claims)).rejects.toThrow('Complete the invitation');
    const verified = await strategy.validate({...claims,email_verified:true}); expect(verified.roles).toEqual(['general_manager']); expect(verified.propertyIds).toEqual([props[0]]);
    const grants = await permissions.getEffectivePermissions(result.id,props[0]!); expect(grants).toContain('reservations.write'); expect(grants).not.toContain('admin.users.manage');
    expect(await permissions.getEffectivePermissions(result.id,props[1]!)).toEqual([]);
    expect((await staff.list(caller))[0].status).toBe('active');
  });
  it('changes scope on retained tokens, rejects stale writes and blocks disabled staff even if remote revocation fails', async () => {
    const result=await staff.create(dto(),caller,actor); const [row]=await db.select().from(schema.users).where(eq(schema.users.id,result.id)); const claims={sub:row!.keycloakSub,azp:'haip-api',email_verified:true}; await strategy.validate(claims);
    const current=(await staff.list(caller))[0]; const change={roleKey:'readonly' as const,propertyIds:[props[1]!],expectedUpdatedAt:new Date(current.updatedAt).toISOString()};
    await staff.access(result.id,change,caller,actor); expect((await strategy.validate(claims)).propertyIds).toEqual([props[1]]); expect((await strategy.validate(claims)).roles).toEqual(['readonly']);
    await expect(staff.access(result.id,change,caller,actor)).rejects.toThrow('Reload');
    identity.disable.mockRejectedValueOnce(new Error('unavailable')); expect((await staff.disable(result.id,caller,actor)).identitySync).toBe('pending'); await expect(strategy.validate(claims)).rejects.toThrow('not active');
    expect((await staff.disable(result.id,caller,actor)).identitySync).toBe('complete');
  });
  it('retains one durable record after delivery failure and reuses the subject on retry',async()=>{
    identity.invite.mockRejectedValueOnce(new Error('SMTP unavailable')); const result=await staff.create(dto(),caller,actor); expect(result.delivery).toBe('failed');
    const retry=await staff.resend(result.id,caller,actor); expect(retry.delivery).toBe('sent'); expect(identity.provision).toHaveBeenCalledTimes(1);
    await expect(staff.resend(result.id,caller,actor)).rejects.toThrow('one minute');
  });
  it('rejects duplicate/concurrent invitations and unauthorized scope without contacting identity',async()=>{
    const input=dto(); const outcomes=await Promise.allSettled([staff.create(input,caller,actor),staff.create(input,caller,actor)]); expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(identity.provision).toHaveBeenCalledTimes(1);
    identity.provision.mockClear(); await expect(staff.create({...dto(),propertyIds:[randomUUID()]},caller,actor)).rejects.toThrow('every affected property');
    await expect(staff.create(dto(),{...caller,roles:['general_manager']},actor)).rejects.toThrow(); expect(identity.provision).not.toHaveBeenCalled();
  });
  it('requires every property for platform administrators and protects the caller from self changes',async()=>{
    await expect(staff.create({...dto(),roleKey:'admin'},caller,actor)).rejects.toThrow('every property');
    const result=await staff.create({...dto(),roleKey:'admin',propertyIds:props},caller,actor); const [row]=await db.select().from(schema.users).where(eq(schema.users.id,result.id)); const self={...caller,sub:row!.keycloakSub!}; await strategy.validate({sub:self.sub,email_verified:true});
    await expect(staff.disable(result.id,self,actor)).rejects.toThrow('own account');
  });
  it('refuses ambiguous managed identity links',async()=>{
    const result=await staff.create(dto(),caller,actor); const [row]=await db.select().from(schema.users).where(eq(schema.users.id,result.id)); await db.update(schema.users).set({keycloakSub:row!.keycloakSub}).where(eq(schema.users.id,callerId));
    await expect(strategy.validate({sub:row!.keycloakSub,email_verified:true})).rejects.toThrow('Conflicting');
  });
  it('does not bind or suspend an unrelated identity with the same email',async()=>{
    identity.provision.mockRejectedValueOnce(new Error('existing identity')); const result=await staff.create(dto(),caller,actor);
    await expect(permissions.assertActiveIdentity({sub:randomUUID(),email:result.email})).resolves.toBeUndefined();
    expect(await permissions.findLocalUser(randomUUID(),result.email)).toBeNull();
  });
  it('reconciles a provisioned but unlinked identity when disabling after a timeout',async()=>{
    identity.provision.mockRejectedValueOnce(new Error('timeout')); const result=await staff.create(dto(),caller,actor); const subject=randomUUID(); identity.findOwned.mockResolvedValueOnce(subject); await staff.disable(result.id,caller,actor); expect(identity.disable).toHaveBeenCalledWith(subject,result.id,result.email);
  });
});
