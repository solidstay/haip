import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminController } from './admin.controller';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';

const source = '11111111-1111-4111-a111-111111111111';
const target = '22222222-2222-4222-a222-222222222222';
const identity = { sub: 'admin-sub', email: 'admin@example.test', name: 'Admin', roles: ['admin'], propertyIds: [source, target] };
const actor = { userId: null, userEmail: null, ipAddress: null };
function setup(grants: string[] = []) {
  const users = { assignRoles: vi.fn().mockResolvedValue({ permissions: ['reservations.read'] }) };
  const permissions = { findLocalUser: vi.fn().mockResolvedValue({ id: 'caller' }), getEffectivePermissions: vi.fn().mockResolvedValue(grants) };
  return { users, permissions, controller: new AdminController(users as any, {} as any, permissions as any) };
}
describe('cross-property role authorization', () => {
  it('requires target user and role management through the permissions guard', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.assignPropertyRoles)).toEqual(['admin.users.manage', 'admin.roles.manage']);
  });
  it('rejects even a platform administrator without source user management before reading the target user', async () => {
    const { controller, users } = setup();
    await expect(controller.assignPropertyRoles('user', target, { sourcePropertyId: source, roleIds: [] }, identity, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.assignRoles).not.toHaveBeenCalled();
  });
  it('rejects a missing source property claim for a non-platform caller', async () => {
    const { controller, users, permissions } = setup(['admin.users.manage']);
    await expect(controller.assignPropertyRoles('user', target, { sourcePropertyId: source, roleIds: [] }, { ...identity, roles: ['front_desk'], propertyIds: [target] }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.findLocalUser).not.toHaveBeenCalled();
    expect(users.assignRoles).not.toHaveBeenCalled();
  });
  it('fails closed for missing or unlinked identities', async () => {
    const { controller, users, permissions } = setup(['admin.users.manage']);
    await expect(controller.assignPropertyRoles('user', target, { sourcePropertyId: source, roleIds: [] }, undefined as any, actor)).rejects.toBeInstanceOf(ForbiddenException);
    permissions.findLocalUser.mockResolvedValue(null as any);
    await expect(controller.assignPropertyRoles('user', target, { sourcePropertyId: source, roleIds: [] }, identity, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.assignRoles).not.toHaveBeenCalled();
  });
  it('passes both explicitly authorized scopes to the scoped assignment service', async () => {
    const { controller, users, permissions } = setup(['admin.users.manage']);
    await controller.assignPropertyRoles('user', target, { sourcePropertyId: source, roleIds: ['role'] }, identity, actor);
    expect(permissions.getEffectivePermissions).toHaveBeenCalledWith('caller', source);
    expect(users.assignRoles).toHaveBeenCalledWith('user', target, ['role'], actor, source);
  });
});
