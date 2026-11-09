import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@telivityhaip/database';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PropertyService } from './property.service';

const url = process.env['PROPERTY_TEST_DATABASE_URL'];
describe.skipIf(!url)('property creation on PostgreSQL', () => {
  // Opt in only against a disposable, migrated database.
  const client = postgres(url ?? 'postgresql://localhost/unavailable', { max: 3 });
  const db = drizzle(client, { schema });
  const service = new PropertyService(db);
  let code: string;
  beforeEach(() => { code = randomUUID().slice(0, 20); });
  afterEach(async () => { await db.delete(schema.properties).where(eq(schema.properties.code, code)); });
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
});
