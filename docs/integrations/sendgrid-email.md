# SendGrid transactional email

Use [SendGrid](https://sendgrid.com/) as HAIP’s email transport for guest confirmations, pre-arrival messages, and operational mail. HAIP picks **SendGrid before SMTP** when both are configured.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDGRID_API_KEY` | Yes | SendGrid API key with Mail Send permission |
| `SENDGRID_FROM` | Yes | Verified sender address (e.g. `frontdesk@yourhotel.com`) |

SMTP variables (`SMTP_*`) remain supported as a fallback when SendGrid is not set.

## Behavior

- Guest-comms and reservation messaging call `EmailService`, which routes through the SendGrid adapter when configured.
- If neither SendGrid nor SMTP is configured, messages are **logged only** (console provider) — same as before for unset SMTP.

## Verify

1. Set `SENDGRID_API_KEY` and `SENDGRID_FROM` on the API container.
2. Trigger a guest email (e.g. compose from the dashboard or a reservation lifecycle event).
3. Check API logs for `Email sent via SendGrid to …`.

## Webhooks (optional)

SendGrid delivery events can be wired to HAIP webhooks in a later wave; this adapter covers outbound send only.

See also: [Integration catalog](../INTEGRATIONS.md) — **SendGrid**.

### Optional installation email layout

Set `EMAIL_LAYOUT_PATH` to a UTF-8 HTML file in the API container to wrap email
fragments in an operator-owned layout. It must contain exactly one `{{body}}`
placeholder and at least one `{{subject}}` placeholder, and be at most 100 KB.
The subject is HTML-escaped. The body is the already rendered HTML supplied by
the caller; this option does not sanitize caller HTML. Place the body placeholder
in an HTML content position, never in an attribute or script. No template code is
evaluated. Invalid or unreadable configured files fail at service startup.

The file is read once at startup. With no path configured, behavior is unchanged.
Messages already containing an `<html>` document are left intact. Recipients,
subjects, plain text, stable message identity and delivery/retry behavior remain
unchanged. Keep installation branding outside this repository.
