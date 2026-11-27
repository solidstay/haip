import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EmailLayout } from './email-layout';
import { EmailService } from './email.service';
const directories: string[] = [];
const message = { to: 'guest@example.test', from: 'host@example.test', subject: 'Hello <guest> & friends', text: 'Plain text', html: '<p>Escaped content &lt;guest&gt; {{subject}} $&</p>', messageId: '<stable@example.test>', idempotencyKey: 'stable' };
function fixture(template: string) {
  const directory = mkdtempSync(join(tmpdir(), 'email-layout-'));
  directories.push(directory);
  const path = join(directory, 'layout.html');
  writeFileSync(path, template);
  return path;
}
afterEach(() => { directories.splice(0).forEach(d => rmSync(d, { recursive: true })); vi.unstubAllEnvs(); });
describe('optional email presentation', () => {
  it('is a no-op without configuration and preserves complete documents', () => {
    expect(new EmailLayout('').render(message)).toBe(message);
    const complete = { ...message, html: '<!doctype html><html lang="en"><body>Existing</body></html>' };
    expect(new EmailLayout(fixture('<h1>{{subject}}</h1>{{body}}')).render(complete)).toBe(complete);
  });
  it('escapes the heading, substitutes once, and preserves all transport and plain-text fields', () => {
    const actual = new EmailLayout(fixture('<html><title>{{subject}}</title><body>{{body}}</body></html>')).render(message);
    expect(actual.html).toBe('<html><title>Hello &lt;guest&gt; &amp; friends</title><body>'+message.html+'</body></html>');
    expect({ ...actual, html: message.html }).toEqual(message);
    expect(message.html).toContain('{{subject}}');
  });
  it.each(['{{subject}}', '{{body}}{{body}}{{subject}}', '{{body}}', '{{subject}}{{body}}'+'x'.repeat(100_000)])('fails invalid operator configuration at startup', template => {
    expect(() => new EmailLayout(fixture(template))).toThrow();
  });
  it('applies presentation through the actual service before the provider without changing identity', async () => {
    vi.stubEnv('EMAIL_LAYOUT_PATH', fixture('<h1>{{subject}}</h1>{{body}}'));
    const send = vi.fn().mockResolvedValue({ status: 'sent', sent: true });
    await new EmailService([{ name: 'smtp', isConfigured: () => true, send }]).send(message, { maxAttempts: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: message.text, messageId: message.messageId, idempotencyKey: message.idempotencyKey, html: expect.stringContaining('<h1>Hello &lt;guest&gt; &amp; friends</h1>') }), { maxAttempts: 1 });
  });
});
