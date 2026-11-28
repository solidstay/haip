import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { users, userRoles, rolePermissions, auditLogs } from '@telivityhaip/database';
import { isStaffRole } from '@telivityhaip/shared';
import type { AuthUser } from './current-user.decorator';
import { DRIZZLE } from '../../database/database.module';

/**
 * Resolves a request's effective permissions from the local RBAC tables.
 * Used by PermissionsGuard and the admin "effective permissions" endpoints.
 *
 * Lives in the auth module (not admin) so the globally-registered guard can
 * inject it without a circular module dependency.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /** Managed staff never inherit stale property or role claims from an older token. */
  async managedIdentity(identity: { sub?: string; email_verified?: boolean }): Promise<AuthUser | undefined> {
    if (!identity.sub || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(identity.sub)) return;
    const linked = await this.db.select().from(users).where(eq(users.keycloakSub, identity.sub));
    if (!linked.some((u: any) => u.staffProvisioning)) return;
    if (linked.length !== 1) throw new UnauthorizedException('Conflicting staff identity links');
    const found = linked[0];
    return this.db.transaction(async (tx: any) => {
      const [user] = await tx.select().from(users).where(eq(users.id, found.id)).for('update');
      if (!user || user.status === 'disabled' || !isStaffRole(user.staffProvisioning?.roleKey)) throw new UnauthorizedException('Staff account is not active');
      if (user.status === 'invited') {
        if (identity.email_verified !== true) throw new UnauthorizedException('Complete the invitation before signing in');
        await tx.update(users).set({ status: 'active', staffProvisioning: { ...user.staffProvisioning, acceptedAt: new Date().toISOString() }, updatedAt: new Date() }).where(and(eq(users.id, user.id), eq(users.status, 'invited')));
        await tx.insert(auditLogs).values({ propertyId: user.propertyId, action: 'update', entityType: 'user', entityId: user.id, description: 'staff.invitation.accepted' });
      }
      const memberships = await tx.selectDistinct({ propertyId: userRoles.propertyId }).from(userRoles).where(eq(userRoles.userId, user.id));
      return { sub: user.keycloakSub, email: user.email, name: user.name, roles: [user.staffProvisioning.roleKey], propertyIds: memberships.map((m: { propertyId: string }) => m.propertyId) };
    });
  }

  /** Find the local user for a JWT identity: by keycloakSub first, then email. */
  async findLocalUser(sub?: string, email?: string) {
    if (sub) {
      const [bySub] = await this.db
        .select()
        .from(users)
        .where(eq(users.keycloakSub, sub))
        .limit(1);
      if (bySub) return bySub;
    }
    if (email) {
      const [byEmail] = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (byEmail && !byEmail.staffProvisioning) return byEmail;
    }
    return null;
  }

  /** Status is global to the identity, not its home property or JWT lifetime. */
  async assertActiveIdentity(identity: { sub?: string; email?: string }): Promise<void> {
    // PostgreSQL UUID links also accept braced, undashed and upper-case UUIDs.
    // Non-UUID external subjects cannot match a link, but still use email fallback.
    const subject = identity.sub?.replace(/^\{(.*)\}$/, '$1').replaceAll('-', '');
    if (subject && /^[a-f\d]{32}$/i.test(subject)) {
      const linked = await this.db.select({ status: users.status }).from(users)
        .where(eq(users.keycloakSub, subject));
      if (linked.length > 0) {
        // Subject links are not unique. Any non-active match must deny rather
        // than selecting an arbitrary active row or falling through to email.
        if (linked.some((user: { status: string }) => user.status !== 'active')) {
          throw new UnauthorizedException('Staff account is not active');
        }
        return;
      }
    }
    if (identity.email) {
      const [linked] = await this.db.select({ status: users.status, staffProvisioning: users.staffProvisioning }).from(users)
        .where(eq(users.email, identity.email)).limit(1);
      // Invitations bind only their provisioned subject. An email collision must
      // never suspend an unrelated pre-existing identity.
      if (linked && !linked.staffProvisioning && linked.status !== 'active') throw new UnauthorizedException('Staff account is not active');
    }
    // Unlinked JWT principals keep their existing authorization path. Local
    // permissions still require a linked, active account.
  }

  /**
   * Effective permission keys for a user at a property = the union of grants
   * across every role the user holds at that property. Grants are keyed by
   * (roleId, propertyId), so a global role's grants are still property-scoped.
   */
  async getEffectivePermissions(userId: string, propertyId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ permissionKey: rolePermissions.permissionKey })
      .from(userRoles)
      .innerJoin(users, and(eq(users.id, userRoles.userId), eq(users.status, 'active')))
      .innerJoin(
        rolePermissions,
        and(
          eq(rolePermissions.roleId, userRoles.roleId),
          eq(rolePermissions.propertyId, userRoles.propertyId),
        ),
      )
      .where(and(eq(userRoles.userId, userId), eq(userRoles.propertyId, propertyId)));
    return rows.map((r: { permissionKey: string }) => r.permissionKey);
  }
}
