import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { users, properties, roles, userRoles, rolePermissions, auditLogs } from '@telivityhaip/database';
import { STAFF_ROLES, ROLE_DEFAULT_PERMISSIONS, actorFields, type AuditActor } from '@telivityhaip/shared';
import { DRIZZLE } from '../../database/database.module';
import { PermissionsService } from '../auth/permissions.service';
import type { AuthUser } from '../auth/current-user.decorator';
import { userCanAccessProperty } from '../auth/property-access';
import { StaffIdentityService } from './staff-identity.service';
import { InviteStaffDto, StaffAccessDto } from './dto/invite-staff.dto';

@Injectable()
export class StaffInvitationsService {
  constructor(@Inject(DRIZZLE) private readonly db: any, private readonly identity: StaffIdentityService, private readonly permissions: PermissionsService) {}
  async options(auth: AuthUser) {
    const all = await this.db.select({ id: properties.id, name: properties.name }).from(properties).where(eq(properties.isActive, true));
    const allowed = [];
    for (const p of all) if (await this.canManage(auth, p.id)) allowed.push(p);
    return { configured: this.identity.ready, properties: allowed, roles: STAFF_ROLES, canInvitePlatformAdmin: allowed.length > 0 && allowed.length === all.length };
  }
  private async canManage(auth: AuthUser, propertyId: string) {
    if (!auth?.roles.includes('admin') || !userCanAccessProperty(auth, propertyId)) return false;
    const caller = await this.permissions.findLocalUser(auth.sub, auth.email);
    if (!caller || caller.status !== 'active') return false;
    const grants = await this.permissions.getEffectivePermissions(caller.id, propertyId);
    return grants.includes('admin.users.manage') && grants.includes('admin.roles.manage');
  }
  private async authorize(auth: AuthUser, ids: string[]) {
    if (!ids.length) throw new ForbiddenException('No managed property access');
    for (const id of ids) if (!await this.canManage(auth, id)) throw new ForbiddenException('Staff administration permission is required at every affected property');
  }
  private async validateAccess(dto: StaffAccessDto, auth: AuthUser) {
    await this.authorize(auth, dto.propertyIds);
    const active = await this.db.select({ id: properties.id }).from(properties).where(eq(properties.isActive, true));
    const ids = new Set(active.map((p: { id: string }) => p.id));
    if (dto.propertyIds.some(id => !ids.has(id))) throw new BadRequestException('Choose active properties');
    if (dto.roleKey === 'admin' && (ids.size !== dto.propertyIds.length || dto.propertyIds.some(id => !ids.has(id)))) {
      throw new BadRequestException('A platform administrator has access to every property. Choose Property manager for restricted access.');
    }
  }
  private async memberships(db: any, id: string): Promise<string[]> {
    const rows = await db.selectDistinct({ id: userRoles.propertyId }).from(userRoles).where(eq(userRoles.userId, id));
    return rows.map((r: { id: string }) => r.id);
  }
  private async managed(db: any, id: string, lock = false) {
    let q = db.select().from(users).where(and(eq(users.id, id), isNotNull(users.staffProvisioning)));
    if (lock) q = q.for('update');
    const [user] = await q;
    if (!user) throw new NotFoundException('Invited staff account not found');
    return user;
  }
  private async audit(db: any, user: any, action: 'create' | 'update', description: string, actor: AuditActor) {
    await db.insert(auditLogs).values({ propertyId: user.propertyId, entityType: 'user', entityId: user.id, action, description, ...actorFields(actor) });
  }
  private view(user: any, propertyIds: string[]) {
    return { id: user.id, name: user.name, email: user.email, status: user.status, propertyIds, roleKey: user.staffProvisioning.roleKey,
      delivery: user.staffProvisioning.delivery, sentAt: user.staffProvisioning.sentAt ?? null, acceptedAt: user.staffProvisioning.acceptedAt ?? null,
      error: user.staffProvisioning.error ?? null, identitySync: user.staffProvisioning.identitySync ?? 'complete', updatedAt: user.updatedAt };
  }
  async list(auth: AuthUser) {
    const rows = await this.db.select().from(users).where(isNotNull(users.staffProvisioning));
    const result = [];
    for (const row of rows) {
      const ids = await this.memberships(this.db, row.id);
      if (ids.length && (await Promise.all(ids.map(id => this.canManage(auth, id)))).every(Boolean)) result.push(this.view(row, ids));
    }
    return result;
  }
  private async grants(db: any, userId: string, dto: StaffAccessDto) {
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    for (const propertyId of dto.propertyIds) {
      const key = 'staff_invite_' + dto.roleKey;
      let [role] = await db.select().from(roles).where(and(eq(roles.propertyId, propertyId), eq(roles.key, key)));
      if (!role) {
        await db.insert(roles).values({ propertyId, key, name: STAFF_ROLES.find(r => r.key === dto.roleKey)!.name, isSystem: true,
          description: 'Managed staff invitation role' }).onConflictDoNothing();
        [role] = await db.select().from(roles).where(and(eq(roles.propertyId, propertyId), eq(roles.key, key)));
      }
      if (!role?.isSystem) throw new ConflictException('A custom role uses a reserved staff key');
      await db.insert(rolePermissions).values(ROLE_DEFAULT_PERMISSIONS[dto.roleKey]!.map(permissionKey => ({ propertyId, roleId: role.id, permissionKey }))).onConflictDoNothing();
      await db.insert(userRoles).values({ propertyId, roleId: role.id, userId });
    }
  }
  async create(dto: InviteStaffDto, auth: AuthUser, actor: AuditActor) {
    if (!this.identity.ready) throw new BadRequestException('Staff invitations are not configured yet');
    await this.validateAccess(dto, auth);
    const email = dto.email.trim().toLowerCase();
    const [duplicate] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (duplicate) throw new ConflictException('This email already has a staff record. Manage or resend the existing invitation.');
    const user = await this.db.transaction(async (tx: any) => {
      const [created] = await tx.insert(users).values({ propertyId: dto.propertyIds[0], name: dto.name.trim(), email,
        status: 'invited', staffProvisioning: { roleKey: dto.roleKey, delivery: 'pending' } }).returning();
      await this.grants(tx, created.id, dto);
      await this.audit(tx, created, 'create', 'staff.invited', actor);
      return created;
    }).catch((e: any) => {
      if (e?.code === '23505' || e?.cause?.code === '23505') throw new ConflictException('This email already has a staff record. Manage the existing invitation.');
      throw e;
    });
    return this.resend(user.id, auth, actor);
  }
  async resend(id: string, auth: AuthUser, actor: AuditActor) {
    return this.db.transaction(async (tx: any) => {
      const user = await this.managed(tx, id, true); const ids = await this.memberships(tx, id); await this.authorize(auth, ids);
      if (user.status !== 'invited') throw new ConflictException('Only pending invitations can be resent');
      const state = { ...user.staffProvisioning };
      if (state.sentAt && Date.now() - Date.parse(state.sentAt) < 60000) throw new ConflictException('Wait one minute before resending this invitation');
      let subject = user.keycloakSub;
      try {
        subject ??= await this.identity.provision(user.id, user.email, user.name);
        // Preserve the link even if SMTP subsequently fails.
        await tx.update(users).set({ keycloakSub: subject }).where(eq(users.id, id));
        const delivery = await this.identity.invite(subject, user.id, user.email);
        state.delivery = 'sent'; state.sentAt = new Date().toISOString(); delete state.error;
        if (delivery === 'accepted') { state.acceptedAt = new Date().toISOString(); user.status = 'active'; }
      } catch (e) {
        state.delivery = 'failed';
        state.error = e instanceof ConflictException ? 'An existing sign-in account uses this email. No existing account was changed.' : 'Invitation could not be delivered. Retry from this staff record.';
      }
      const [saved] = await tx.update(users).set({ keycloakSub: subject, status: user.status, staffProvisioning: state, updatedAt: new Date() }).where(eq(users.id, id)).returning();
      await this.audit(tx, saved, 'update', state.delivery === 'sent' ? 'staff.invitation.sent' : 'staff.invitation.failed', actor);
      return this.view(saved, ids);
    });
  }
  async access(id: string, dto: StaffAccessDto & { expectedUpdatedAt: string }, auth: AuthUser, actor: AuditActor) {
    await this.validateAccess(dto, auth);
    return this.db.transaction(async (tx: any) => {
      const user = await this.managed(tx, id, true); await this.authorize(auth, await this.memberships(tx, id));
      if (user.keycloakSub === auth.sub) throw new ConflictException('Ask another platform administrator to change your own access');
      if (user.status === 'disabled') throw new ConflictException('This staff account is disabled');
      if (new Date(user.updatedAt).getTime() !== Date.parse(dto.expectedUpdatedAt)) throw new ConflictException('This account changed. Reload before saving.');
      await this.grants(tx, id, dto);
      const [saved] = await tx.update(users).set({ propertyId: dto.propertyIds[0], staffProvisioning: { ...user.staffProvisioning, roleKey: dto.roleKey }, updatedAt: new Date() }).where(eq(users.id, id)).returning();
      await this.audit(tx, saved, 'update', 'staff.access.changed', actor);
      return this.view(saved, dto.propertyIds);
    });
  }
  async disable(id: string, auth: AuthUser, actor: AuditActor) {
    // Commit local denial before asking the remote identity service to revoke sessions.
    await this.db.transaction(async (tx: any) => {
      const user = await this.managed(tx, id, true); await this.authorize(auth, await this.memberships(tx, id));
      if (user.keycloakSub === auth.sub) throw new ConflictException('You cannot disable your own account');
      await tx.update(users).set({ status: 'disabled', staffProvisioning: { ...user.staffProvisioning, identitySync: 'pending' }, updatedAt: new Date() }).where(eq(users.id, id));
      await this.audit(tx, user, 'update', 'staff.disabled', actor);
    });
    return this.db.transaction(async (tx: any) => {
      const user = await this.managed(tx, id, true); const state = { ...user.staffProvisioning };
      try {
        const subject = user.keycloakSub ?? await this.identity.findOwned(user.id, user.email);
        if (subject) await this.identity.disable(subject, user.id, user.email);
        state.identitySync = 'complete'; delete state.error;
      } catch { state.error = 'PMS access is disabled. Retry to finish disabling the sign-in account.'; }
      const [saved] = await tx.update(users).set({ staffProvisioning: state, updatedAt: new Date() }).where(eq(users.id, id)).returning();
      return this.view(saved, await this.memberships(tx, id));
    });
  }
}
