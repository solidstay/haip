import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { StripeWebhookController } from './stripe-webhook.controller';
import { CONNECT_CHECKOUT_STRIPE_HANDLER } from './connect-checkout-stripe-handler.interface';

function fixture() {
  const checkout = { handleSession: vi.fn().mockResolvedValue(undefined) };
  const connect = { handleCheckoutSessionCompleted: vi.fn().mockResolvedValue(undefined) };
  const moduleRef = { get: vi.fn().mockReturnValue(connect) };
  const tx = {};
  const emit = vi.fn();
  const events = { process: vi.fn(async (_event, handler) => handler(tx, emit)) };
  const controller = new StripeWebhookController(
    {} as any, {} as any, {} as any,
    new ConfigService({ STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' }),
    moduleRef as unknown as ModuleRef, undefined, events as any, checkout as any,
  );
  const stripe = new Stripe('sk_test_fixture');
  const send = (type: string, metadata: Record<string, string>, validSignature = true) => {
    const payload = JSON.stringify({ id: 'evt_fixture', type, livemode: false, data: { object: { id: 'cs_fixture', metadata } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: validSignature ? 'whsec_fixture' : 'whsec_other' });
    return controller.handleWebhook(
      { body: Buffer.from(payload), headers: { 'stripe-signature': signature } },
      { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() },
    );
  };
  return { checkout, connect, moduleRef, events, send, tx, emit };
}

describe('signed Stripe checkout event ownership', () => {
  it.each(['completed', 'async_payment_succeeded', 'async_payment_failed', 'expired'])(
    'retains direct Checkout %s handling inside the event transaction', async (suffix) => {
      const f = fixture();
      await f.send(`checkout.session.${suffix}`, { haip_checkout_id: 'checkout-id', haip_property_id: 'property-id' });
      expect(f.checkout.handleSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs_fixture' }), f.tx, f.emit);
      expect(f.connect.handleCheckoutSessionCompleted).not.toHaveBeenCalled();
    },
  );

  it('routes upstream Connect completion to its existing handler', async () => {
    const f = fixture();
    await f.send('checkout.session.completed', { confirmationNumber: 'HAIP-fixture' });
    expect(f.moduleRef.get).toHaveBeenCalledWith(CONNECT_CHECKOUT_STRIPE_HANDLER, { strict: false });
    expect(f.connect.handleCheckoutSessionCompleted).toHaveBeenCalledWith('evt_fixture', expect.objectContaining({ id: 'cs_fixture' }));
    expect(f.checkout.handleSession).not.toHaveBeenCalled();
  });

  it('leaves unrelated account Checkout events alone', async () => {
    const f = fixture();
    await f.send('checkout.session.completed', {});
    expect(f.checkout.handleSession).not.toHaveBeenCalled();
    expect(f.moduleRef.get).not.toHaveBeenCalled();
  });

  it('asks Stripe to retry when the required Connect handler is unavailable', async () => {
    const f = fixture();
    f.moduleRef.get.mockReturnValue(undefined as any);
    await expect(f.send('checkout.session.completed', { confirmationNumber: 'HAIP-fixture' })).rejects.toThrow('Stripe event processing failed');
  });

  it('rejects invalid signatures before either handler or the event ledger', async () => {
    const f = fixture();
    await expect(f.send('checkout.session.completed', { confirmationNumber: 'HAIP-fixture' }, false)).rejects.toThrow('Invalid Stripe webhook signature');
    expect(f.events.process).not.toHaveBeenCalled();
    expect(f.connect.handleCheckoutSessionCompleted).not.toHaveBeenCalled();
  });
});
