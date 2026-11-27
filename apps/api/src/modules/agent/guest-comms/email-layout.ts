import { readFileSync } from 'node:fs';
import type { EmailMessage } from './email-provider.interface';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

/** Operator-owned presentation only. No template evaluation or remote resources. */
export class EmailLayout {
  private readonly template: string | undefined;

  constructor(path = process.env['EMAIL_LAYOUT_PATH']) {
    if (!path) return;
    const template = readFileSync(path, 'utf8');
    if (Buffer.byteLength(template) > 100_000 || template.split('{{body}}').length !== 2 || !template.includes('{{subject}}')) {
      throw new Error('Email layout must contain one {{body}} and a {{subject}} placeholder and be at most 100 KB');
    }
    this.template = template;
  }

  render(message: EmailMessage): EmailMessage {
    // Already complete HTML documents own their layout; preserve them unchanged.
    if (!this.template || /<html(?:\s|>)/i.test(message.html)) return message;
    const html = this.template.replace(/\{\{(subject|body)\}\}/g, (_, key: string) =>
      key === 'subject' ? escapeHtml(message.subject) : message.html,
    );
    return { ...message, html };
  }
}
