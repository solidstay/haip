import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { CreateIndividualRoomDto } from './dto/create-individual-room.dto';
import { validate } from 'class-validator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';

describe('individual room input and authorization', () => {
  it('rejects contradictory property scopes before calling the service', () => {
    const controller = new RoomController(null as any, null as any, null as any, null as any);
    expect(() => controller.createIndividualRoom({ propertyId: randomUUID(), name: 'Test', number: '101', maxOccupancy: 2 }, randomUUID())).toThrow();
  });
  it('requires ops.manage', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RoomController.prototype.createIndividualRoom)).toEqual(['ops.manage']);
  });
  it.each([{ propertyId: 'invalid' }, { name: '  ' }, { number: ' ' }, { maxOccupancy: 0 }, { maxOccupancy: 1.5 }, { floor: '12345678901' }])('rejects invalid input %j', async invalid => {
    const dto = Object.assign(new CreateIndividualRoomDto(), { propertyId: randomUUID(), name: 'Synthetic room', number: '101', maxOccupancy: 2 }, invalid);
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
const url = process.env['INDIVIDUAL_ROOM_TEST_DATABASE_URL'];
describe.skipIf(!url)('individual room creation on disposable PostgreSQL', () => {
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 4 });
  const db = drizzle(client, { schema });
  const service = new RoomService(db);
  let propertyId: string;
  const dto = () => ({ propertyId, name: 'Synthetic room', number: '101', maxOccupancy: 2, floor: '1' });
  beforeEach(async () => {
    const [property] = await db.insert(schema.properties).values({ name: 'Synthetic individual room test', code: randomUUID().slice(0, 20), countryCode: 'GB', timezone: 'Europe/London', currencyCode: 'GBP', totalRooms: 0, overbookingPercentage: 0 }).returning();
    propertyId = property!.id;
  });
  afterEach(async () => {
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.propertyId, propertyId));
    await db.delete(schema.rooms).where(eq(schema.rooms.propertyId, propertyId));
    await db.delete(schema.roomTypes).where(eq(schema.roomTypes.propertyId, propertyId));
    await db.delete(schema.properties).where(eq(schema.properties.id, propertyId));
  });
  afterAll(() => client.end());
  it('creates one unit, one listing and audit events without rates or fees', async () => {
    const room = await service.createIndividualRoom(dto());
    expect(room).toMatchObject({ propertyId, number: '101', floor: '1', status: 'vacant_clean' });
    expect(await service.findRoomTypeById(room.roomTypeId, propertyId)).toMatchObject({ name: 'Synthetic room', maxOccupancy: 2, defaultOccupancy: 2, cleaningFeeServiceId: null });
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.propertyId, propertyId))).toHaveLength(2);
    expect(await db.select().from(schema.ratePlans).where(eq(schema.ratePlans.propertyId, propertyId))).toHaveLength(0);
    await expect(service.findRoomById(room.id, randomUUID())).rejects.toThrow('not found');
  });
  it('serializes duplicate submissions without an orphan listing', async () => {
    const results = await Promise.allSettled([service.createIndividualRoom(dto()), service.createIndividualRoom(dto())]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await service.findAllRooms(propertyId)).toHaveLength(1);
    expect(await service.findAllRoomTypes(propertyId)).toHaveLength(1);
  });
  it('rejects a nonexistent tenant before inserting anything', async () => {
    await expect(service.createIndividualRoom({ ...dto(), propertyId: randomUUID() })).rejects.toThrow('Property not found');
    expect(await service.findAllRoomTypes(propertyId)).toHaveLength(0);
  });
  it('rolls both records back when auditing fails', async () => {
    const failingDb = new Proxy(db, { get(target, key) {
      if (key !== 'transaction') return Reflect.get(target, key);
      return (callback: (tx: unknown) => unknown) => target.transaction(tx => callback(new Proxy(tx, { get(transaction, field) {
        if (field === 'insert') return (table: unknown) => {
          if (table === schema.auditLogs) throw Error('audit unavailable');
          return transaction.insert(table as typeof schema.rooms);
        };
        return Reflect.get(transaction, field);
      } })));
    } });
    await expect(new RoomService(failingDb).createIndividualRoom(dto())).rejects.toThrow('audit unavailable');
    expect(await service.findAllRooms(propertyId)).toHaveLength(0);
    expect(await service.findAllRoomTypes(propertyId)).toHaveLength(0);
  });
});
