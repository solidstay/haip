import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingEmailListener } from './booking-email.listener';
afterEach(() => vi.unstubAllEnvs());
function fixture(overrides: Record<string, unknown> = {}) {
  const row = { guest: { email: 'guest@example.test' }, property: { name: '<img src=x>' }, booking: { channelCode: 'booking_engine', confirmationNumber: 'TEST-123' }, reservation: { arrivalDate: '2030-01-01', departureDate: '2030-01-03', currencyCode: 'GBP', totalAmount: '100.00', holdExpiresAt: null }, ...overrides };
  const chain: any = { select: () => chain, from: () => chain, innerJoin: () => chain, where: async () => [row] };
  const send = vi.fn().mockResolvedValue({ sent: true });
  return { listener: new BookingEmailListener(chain, { send } as any), send };
}
const event: any = { propertyId: 'p', entityId: 'r', data: {} };
describe('booking mail presentation', () => {
 it('retains real amounts, dates, reference and distinct status headings while escaping property content', async () => {
  vi.stubEnv('BOOKING_TRANSACTIONAL_EMAILS', 'true'); vi.stubEnv('STRIPE_MODE', 'live');
  const h = fixture();
  await h.listener.confirmed(event); await h.listener.cancelled(event);
  expect(h.send.mock.calls.map(c => c[0].subject)).toEqual(['Booking confirmed', 'Booking cancelled']);
  const m = h.send.mock.calls[0][0];
  for (const value of ['GBP 100.00', '2030-01-01', '2030-01-03', 'TEST-123']) { expect(m.html).toContain(value); expect(m.text).toContain(value); }
  expect(m.html).toContain('&lt;img src=x&gt;'); expect(m.html).not.toContain('<img src=x>');
 });
 it('preserves staging and unpaid hold notices and does not send created mail without a hold', async () => {
  vi.stubEnv('BOOKING_TRANSACTIONAL_EMAILS', 'true'); vi.stubEnv('STRIPE_MODE', 'mock');
  const noHold = fixture(); await noHold.listener.created(event); expect(noHold.send).not.toHaveBeenCalled();
  const h = fixture({ reservation: { arrivalDate: '2030-01-01', departureDate: '2030-01-03', currencyCode: 'GBP', totalAmount: '100.00', holdExpiresAt: new Date('2030-01-01T12:00:00Z') } });
  await h.listener.created(event);
  expect(h.send.mock.calls[0][0].subject).toBe('[STAGING] Booking awaiting manual payment');
  expect(h.send.mock.calls[0][0].html).toContain('Unpaid hold expires: 2030-01-01T12:00:00.000Z');
  expect(h.send.mock.calls[0][0].html).toContain('no real payment');
 });
});
