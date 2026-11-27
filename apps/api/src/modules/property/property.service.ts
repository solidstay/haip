import { Injectable, Inject, Optional, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { properties, media, roles, rolePermissions, userRoles, auditLogs } from '@telivityhaip/database';
import { DRIZZLE } from '../../database/database.module';
import { WebhookService } from '../webhook/webhook.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PermissionsService } from '../auth/permissions.service';
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/permissions.catalog';
import type { AuthUser } from '../auth/current-user.decorator';
import { actorFields, type AuditActor } from '../../common/audit/audit-actor';

type PropertyRow = Record<string, unknown> & {
  id: string;
  staffLogoMediaId?: string | null;
};

@Injectable()
export class PropertyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    @Optional() private readonly webhookService?: WebhookService,
    @Optional() private readonly permissions?: PermissionsService,
  ) {}

  async create(dto: CreatePropertyDto, creator?: AuthUser, actor?: AuditActor) {
    // A newly created tenant has no local grants yet. Give only its authenticated
    // administrator creator the existing admin profile, scoped to this new row.
    const localUser = creator ? await this.permissions?.findLocalUser(creator.sub, creator.email) : undefined;
    if (creator && (!creator.roles.includes('admin') || !localUser || localUser.status !== 'active')) {
      throw new ForbiddenException('An active linked administrator is required to create a property');
    }
    try {
      if (localUser) {
        const property = await this.db.transaction(async (tx: any) => {
          const [created] = await tx.insert(properties).values(dto).returning();
          const propertyId = created.id;
          const [role] = await tx.insert(roles).values({ propertyId, key: 'property_administrator', name: 'Property administrator', isSystem: false }).returning();
          await tx.insert(rolePermissions).values(ROLE_DEFAULT_PERMISSIONS['admin']!.map(permissionKey => ({ propertyId, roleId: role.id, permissionKey })));
          await tx.insert(userRoles).values({ propertyId, userId: localUser.id, roleId: role.id });
          await tx.insert(auditLogs).values({ propertyId, action: 'create', entityType: 'property', entityId: propertyId, description: 'property.created_with_administrator_access', ...actorFields(actor), newValue: { name: dto.name, totalRooms: dto.totalRooms, administratorUserId: localUser.id } });
          return created;
        });
        return await this.withLogoUrl(property as PropertyRow);
      }
      const [property] = await this.db
        .insert(properties)
        .values(dto)
        .returning();
      return await this.withLogoUrl(property as PropertyRow);
    } catch (error) {
      // Let PostgreSQL arbitrate concurrent creates; a preflight read can race.
      const failure = error as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
      const databaseError = failure.cause ?? failure;
      if (databaseError.code === '23505' && ['properties_code_key', 'properties_code_unique'].includes(databaseError.constraint_name ?? '')) {
        throw new ConflictException('Property code already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<(PropertyRow & { staffLogoUrl: string | null })[]> {
    const rows = (await this.db
      .select()
      .from(properties)
      .where(eq(properties.isActive, true))) as PropertyRow[];
    return this.attachLogoUrls(rows);
  }

  async findById(id: string) {
    const [property] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, id));
    if (!property) {
      throw new NotFoundException(`Property ${id} not found`);
    }
    return this.withLogoUrl(property as PropertyRow);
  }

  async update(id: string, dto: UpdatePropertyDto, actor?: AuditActor) {
    // The properties row is the tenant; retain dependent history on deactivation.
    const property = await this.db.transaction(async (tx: any) => {
      const [previous] = await tx.select().from(properties).where(eq(properties.id, id)).for('update');
      if (!previous) throw new NotFoundException(`Property ${id} not found`);
      const { expectedUpdatedAt, publicListing, ...fields } = dto;
      if (expectedUpdatedAt && new Date(previous.updatedAt).toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
        throw new ConflictException('This property was changed by another user. Reload before saving.');
      }
      const changes = { ...fields, ...(publicListing ? { settings: { ...previous.settings, ...fields.settings, publicListing } } : {}) };
      const [updated] = await tx.update(properties).set({ ...changes, updatedAt: new Date() })
        .where(eq(properties.id, id)).returning();
      if (!updated) throw new ConflictException('This property was changed by another user. Reload before saving.');
      await tx.insert(auditLogs).values({ propertyId: id, action: 'update', entityType: 'property', entityId: id, description: dto.isActive === false ? 'property.deactivated' : dto.isActive === true ? 'property.activated' : 'property.updated', ...actorFields(actor), previousValue: { isActive: previous.isActive }, newValue: dto });
      return updated;
    });
    await this.webhookService?.emit(
      'property.content_updated',
      'property',
      id,
      { propertyId: id },
      id,
    );
    return this.withLogoUrl(property as PropertyRow);
  }

  private async withLogoUrl(property: PropertyRow) {
    const [enriched] = await this.attachLogoUrls([property]);
    return enriched!;
  }

  private async attachLogoUrls(rows: PropertyRow[]) {
    const logoIds = rows
      .map((r) => r['staffLogoMediaId'] as string | null | undefined)
      .filter((id): id is string => !!id);
    if (!logoIds.length) {
      return rows.map((r) => ({ ...r, staffLogoUrl: null as string | null }));
    }
    const mediaRows = await this.db
      .select({ id: media.id, url: media.url })
      .from(media)
      .where(inArray(media.id, logoIds));
    const urlById = new Map<string, string>(
      mediaRows.map((m: { id: string; url: string }) => [m.id, m.url]),
    );
    return rows.map((r) => {
      const logoId = r['staffLogoMediaId'] as string | null | undefined;
      const url: string | null = logoId ? (urlById.get(logoId) ?? null) : null;
      return {
        ...r,
        staffLogoUrl: url,
      };
    });
  }
}
