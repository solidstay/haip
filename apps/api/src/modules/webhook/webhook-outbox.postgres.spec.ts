import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { properties, agentWebhookSubscriptions, webhookDeliveries } from '@telivityhaip/database';
import { WebhookDeliveryService } from './webhook-delivery.service';

const url = process.env['DATABASE_URL'];
const suite = process.env['STRIPE_OPERATIONS_LIVE_PG'] === '1' && url ? describe : describe.skip;
suite('Durable outbox delivery identities against PostgreSQL', () => {
  const client = postgres(url!, { max: 2 });
  const db = drizzle(client);
  afterAll(() => client.end());

  it('persists prefixed event IDs, deduplicates replays, and keeps existing UUID IDs', async () => {
    const propertyId = randomUUID();
    const subscriptionId = randomUUID();
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const service = new WebhookDeliveryService(db, undefined, queue);
    try {
      await db.insert(properties).values({ id: propertyId, name: 'Synthetic outbox test',
        code: propertyId.slice(0, 8), countryCode: 'GB', timezone: 'UTC', currencyCode: 'GBP', totalRooms: 1 });
      await db.insert(agentWebhookSubscriptions).values({ id: subscriptionId, propertyId,
        subscriberId: 'synthetic', callbackUrl: 'https://example.invalid/webhook', events: ['reservation.created'] });
      const payload = { propertyId, eventType: 'reservation.created', entityType: 'reservation',
        entityId: randomUUID(), data: {}, timestamp: new Date().toISOString() };
      const ids = [randomUUID(), `haip:direct:${randomUUID()}:0`, `stripe:evt_${randomUUID()}:0`];
      for (const id of ids) {
        const first = await service.enqueue(payload, subscriptionId, id);
        const replay = await service.enqueue(payload, subscriptionId, id);
        expect(first.logicalEventId).toBe(id);
        expect(replay.id).toBe(first.id);
      }
      expect(await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.propertyId, propertyId))).toHaveLength(3);
      expect(queue.add).toHaveBeenCalledTimes(6);
    } finally {
      await db.delete(webhookDeliveries).where(eq(webhookDeliveries.propertyId, propertyId));
      await db.delete(agentWebhookSubscriptions).where(eq(agentWebhookSubscriptions.propertyId, propertyId));
      await db.delete(properties).where(eq(properties.id, propertyId));
    }
  });
});
