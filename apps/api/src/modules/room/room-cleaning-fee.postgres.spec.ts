import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomCleaningFeeService } from './room-cleaning-fee.service';

const url = process.env['CLEANING_FEE_TEST_DATABASE_URL'];
describe.skipIf(!url)('room cleaning fees on disposable PostgreSQL', () => {
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 4 });
  const db = drizzle(client, { schema });
  const service = new RoomCleaningFeeService(db);
  let propertyId: string;
  let roomId: string;
  beforeEach(async () => {
    const [property] = await db.insert(schema.properties).values({
      name: 'Synthetic cleaning fee test', code: randomUUID().slice(0, 20),
      countryCode: 'GB', timezone: 'Europe/London', currencyCode: 'GBP', totalRooms: 1, overbookingPercentage: 0,
    }).returning();
    propertyId = property!.id;
    const [room] = await db.insert(schema.roomTypes).values({
      propertyId, name: 'Synthetic room', code: 'TEST', maxOccupancy: 2, defaultOccupancy: 2,
    }).returning();
    roomId = room!.id;
  });
  afterEach(async () => {
    if (!propertyId) return;
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.propertyId, propertyId));
    await db.delete(schema.roomTypes).where(eq(schema.roomTypes.propertyId, propertyId));
    await db.delete(schema.services).where(eq(schema.services.propertyId, propertyId));
    await db.delete(schema.properties).where(eq(schema.properties.id, propertyId));
  });
  afterAll(() => client.end());
  it('defaults to no fee, saves, updates and removes without duplicate catalog services', async () => {
    expect(await service.get(roomId, propertyId)).toEqual({ amount: '0.00', currencyCode: null });
    await service.set(roomId, propertyId, { amount: '25.00', currencyCode: 'GBP' });
    expect(await service.get(roomId, propertyId)).toEqual({ amount: '25.00', currencyCode: 'GBP' });
    await service.set(roomId, propertyId, { amount: '35.00', currencyCode: 'GBP' });
    await service.set(roomId, propertyId, { amount: '0.00', currencyCode: 'GBP' });
    expect(await service.get(roomId, propertyId)).toEqual({ amount: '0.00', currencyCode: 'GBP' });
    const rows = await db.select().from(schema.services).where(eq(schema.services.propertyId, propertyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ price: '0.00', postingRule: 'once', chargeType: 'fee', sellChannels: ['room_cleaning_fee'] });
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.propertyId, propertyId))).toHaveLength(3);
  });
  it('rejects foreign property reads and writes without creating a charge', async () => {
    await expect(service.get(roomId, randomUUID())).rejects.toThrow('Room type not found');
    await expect(service.set(roomId, randomUUID(), { amount: '25', currencyCode: 'GBP' })).rejects.toThrow('Room type not found');
    expect(await db.select().from(schema.services).where(eq(schema.services.propertyId, propertyId))).toHaveLength(0);
  });
  it('serializes simultaneous first saves into one catalog fee', async () => {
    await Promise.all(['20.00', '30.00'].map(amount => service.set(roomId, propertyId, { amount, currencyCode: 'GBP' })));
    expect(['20.00', '30.00']).toContain((await service.get(roomId, propertyId)).amount);
    expect(await db.select().from(schema.services).where(eq(schema.services.propertyId, propertyId))).toHaveLength(1);
  });
  it('rolls back the service and room link if auditing fails', async () => {
    const failingDb = new Proxy(db, { get(target, key) {
      if (key !== 'transaction') return Reflect.get(target, key);
      return (callback: (tx: unknown) => unknown) => target.transaction(tx => callback(new Proxy(tx, { get(transaction, field) {
        if (field === 'insert') return (table: unknown) => {
          if (table === schema.auditLogs) throw Error('audit unavailable');
          return transaction.insert(table as typeof schema.services);
        };
        return Reflect.get(transaction, field);
      } })));
    } });
    await expect(new RoomCleaningFeeService(failingDb).set(roomId, propertyId, { amount: '25', currencyCode: 'GBP' })).rejects.toThrow('audit unavailable');
    expect((await service.get(roomId, propertyId)).amount).toBe('0.00');
    expect(await db.select().from(schema.services).where(eq(schema.services.propertyId, propertyId))).toHaveLength(0);
  });
});
