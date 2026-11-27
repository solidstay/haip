import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { roomTypes, services, auditLogs } from '@telivityhaip/database';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { DRIZZLE } from '../../database/database.module';
import type { CleaningFeeDto } from './dto/cleaning-fee.dto';

@Injectable()
export class RoomCleaningFeeService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async get(id: string, propertyId: string) {
    const [type] = await this.db.select().from(roomTypes)
      .where(and(eq(roomTypes.id, id), eq(roomTypes.propertyId, propertyId)));
    if (!type) throw new NotFoundException('Room type not found');
    if (!type.cleaningFeeServiceId) return { amount: '0.00', currencyCode: null };
    const [service] = await this.db.select().from(services).where(and(
      eq(services.id, type.cleaningFeeServiceId), eq(services.propertyId, propertyId)));
    if (!service) throw new BadRequestException('Configured cleaning fee is unavailable');
    return { amount: service.price, currencyCode: service.currencyCode };
  }

  async set(id: string, propertyId: string, dto: CleaningFeeDto) {
    const amount = new Decimal(dto.amount).toFixed(2);
    const result = await this.db.transaction(async (tx: any) => {
      const [type] = await tx.select().from(roomTypes)
        .where(and(eq(roomTypes.id, id), eq(roomTypes.propertyId, propertyId))).for('update');
      if (!type) throw new NotFoundException('Room type not found');
      let serviceId: string | null = type.cleaningFeeServiceId;
      const values = { price: amount, currencyCode: dto.currencyCode,
        chargeType: 'fee' as const, postingRule: 'once' as const,
        sellChannels: ['room_cleaning_fee'], isActive: true };
      if (serviceId) {
        const [updated] = await tx.update(services).set({ ...values, updatedAt: new Date() })
          .where(and(eq(services.id, serviceId), eq(services.propertyId, propertyId))).returning();
        if (!updated) throw new BadRequestException('Configured cleaning fee is unavailable');
      } else if (new Decimal(amount).greaterThan(0)) {
        const [service] = await tx.insert(services).values({
          propertyId, code: `CLEAN-${randomUUID().slice(0, 32)}`, name: 'Cleaning fee',
          description: `Once per stay for ${type.name}`, ...values,
        }).returning();
        serviceId = service.id;
      }
      await tx.update(roomTypes).set({ cleaningFeeServiceId: serviceId, updatedAt: new Date() })
        .where(and(eq(roomTypes.id, id), eq(roomTypes.propertyId, propertyId)));
      await tx.insert(auditLogs).values({ propertyId, action: 'update', entityType: 'room_type',
        entityId: id, description: 'room_type.cleaning_fee_updated',
        previousValue: { cleaningFeeServiceId: type.cleaningFeeServiceId },
        newValue: { cleaningFeeServiceId: serviceId, amount, currencyCode: dto.currencyCode } });
      return { amount, currencyCode: serviceId ? dto.currencyCode : null };
    });
    return result;
  }
}
