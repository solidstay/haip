import { Injectable, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface IdentityUser { id: string; email?: string; emailVerified?: boolean; requiredActions?: string[]; attributes?: Record<string, string[]>; }
/** Realm-scoped service account. No passwords or invitation links pass through HAIP. */
@Injectable()
export class StaffIdentityService {
  constructor(private readonly config: ConfigService) {}
  get ready() {
    return ['KEYCLOAK_URL', 'KEYCLOAK_REALM', 'STAFF_IDENTITY_CLIENT_ID', 'STAFF_IDENTITY_CLIENT_SECRET', 'STAFF_INVITATION_REDIRECT_URI'].every(k => !!this.config.get<string>(k));
  }
  private configuration() {
    if (!this.ready) throw new ServiceUnavailableException('Staff invitations are not configured yet');
    const base = this.config.getOrThrow<string>('KEYCLOAK_URL').replace(/\/$/, '');
    const realm = encodeURIComponent(this.config.getOrThrow<string>('KEYCLOAK_REALM'));
    return { base, realm };
  }
  private async request(path: string, method = 'GET', body?: unknown): Promise<Response> {
    const { base, realm } = this.configuration();
    try {
      const tokenResponse = await fetch(`${base}/realms/${realm}/protocol/openid-connect/token`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.config.getOrThrow('STAFF_IDENTITY_CLIENT_ID'), client_secret: this.config.getOrThrow('STAFF_IDENTITY_CLIENT_SECRET') }),
      });
      if (!tokenResponse.ok) throw new Error('Identity authentication failed');
      const token = await tokenResponse.json() as { access_token: string };
      const result = await fetch(`${base}/admin/realms/${realm}/${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!result.ok) throw new Error('Identity request failed');
      return result;
    } catch {
      throw new ServiceUnavailableException('The sign-in service could not complete this request. Retry from the staff list.');
    }
  }
  private assertOwned(user: IdentityUser, localId: string, email: string) {
    if (user.attributes?.['haip_staff_id']?.[0] !== localId || user.email?.toLowerCase() !== email.toLowerCase()) {
      throw new ConflictException('This email already has a sign-in account. It has not been changed.');
    }
  }
  async provision(localId: string, email: string, name: string): Promise<string> {
    const matches = await (await this.request('users?' + new URLSearchParams({ email, exact: 'true' }))).json() as IdentityUser[];
    if (matches.length) {
      if (matches.length !== 1) throw new ConflictException('This email has conflicting sign-in accounts');
      this.assertOwned(matches[0]!, localId, email);
      return matches[0]!.id;
    }
    const [firstName, ...remainingNames] = name.trim().split(/\s+/);
    await this.request('users', 'POST', {
      username: email, email, firstName, lastName: remainingNames.join(' '), enabled: true, emailVerified: false,
      requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'], attributes: { haip_staff_id: [localId] },
    });
    const created = await (await this.request('users?' + new URLSearchParams({ email, exact: 'true' }))).json() as IdentityUser[];
    if (created.length !== 1) throw new ServiceUnavailableException('Account created; retry to finish linking the login');
    this.assertOwned(created[0]!, localId, email);
    return created[0]!.id;
  }
  async invite(id: string, localId: string, email: string): Promise<'sent' | 'accepted'> {
    const user = await (await this.request('users/' + encodeURIComponent(id))).json() as IdentityUser;
    this.assertOwned(user, localId, email);
    if (user.emailVerified && !user.requiredActions?.length) return 'accepted';
    const query = new URLSearchParams({
      client_id: this.config.get('STAFF_INVITATION_CLIENT_ID', 'haip-dashboard'),
      redirect_uri: this.config.getOrThrow('STAFF_INVITATION_REDIRECT_URI'), lifespan: '86400',
    });
    await this.request(`users/${encodeURIComponent(id)}/execute-actions-email?${query}`, 'PUT', ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
    return 'sent';
  }
  async findOwned(localId: string, email: string): Promise<string | undefined> {
    const matches = await (await this.request('users?' + new URLSearchParams({ email, exact: 'true' }))).json() as IdentityUser[];
    if (!matches.length) return;
    // A conflicting pre-existing identity is never ours to disable.
    const owned = matches.filter(u => u.attributes?.['haip_staff_id']?.[0] === localId);
    if (!owned.length) return;
    if (owned.length !== 1) throw new ConflictException('Conflicting sign-in accounts');
    this.assertOwned(owned[0]!, localId, email);
    return owned[0]!.id;
  }
  async disable(id: string, localId: string, email: string) {
    const user = await (await this.request('users/' + encodeURIComponent(id))).json() as IdentityUser;
    this.assertOwned(user, localId, email);
    await this.request('users/' + encodeURIComponent(id), 'PUT', { enabled: false });
    await this.request(`users/${encodeURIComponent(id)}/logout`, 'POST');
  }
}
