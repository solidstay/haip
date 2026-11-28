import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaffIdentityService } from './staff-identity.service';
const config = new ConfigService({ KEYCLOAK_URL:'https://identity.test', KEYCLOAK_REALM:'staff', STAFF_IDENTITY_CLIENT_ID:'provisioner', STAFF_IDENTITY_CLIENT_SECRET:'test-only', STAFF_INVITATION_REDIRECT_URI:'https://pms.test/properties' });
afterEach(()=>vi.unstubAllGlobals());
function setup(responses: unknown[]) {
 const calls: {url:string;init?:RequestInit}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push({url:String(url),init});if(String(url).endsWith('/token'))return new Response(JSON.stringify({access_token:'test-token'}));const value=responses.shift();if(value instanceof Error)throw value;return new Response(JSON.stringify(value??{}));}));
 return {service:new StaffIdentityService(config),calls};
}
describe('native staff identity ownership and email actions',()=>{
 it('never takes over or alters an existing unmarked identity',async()=>{
  const {service,calls}=setup([[{id:'existing',email:'staff@test.invalid'}]]);await expect(service.provision('local','staff@test.invalid','Name')).rejects.toThrow('already has');expect(calls.filter(c=>c.init?.method!=='POST'&&c.init?.method!=='GET')).toHaveLength(0);
 });
 it('reconciles its own previously created account without duplicating it',async()=>{
  const {service,calls}=setup([[{id:'owned',email:'staff@test.invalid',attributes:{haip_staff_id:['local']}}]]);expect(await service.provision('local','staff@test.invalid','Name')).toBe('owned');expect(calls.some(c=>c.url.endsWith('/users')&&c.init?.method==='POST')).toBe(false);
 });
 it('sends native verification and password actions with a fixed redirect and 24-hour expiry',async()=>{
  const {service,calls}=setup([{id:'owned',email:'staff@test.invalid',attributes:{haip_staff_id:['local']}},{}]);expect(await service.invite('owned','local','staff@test.invalid')).toBe('sent');const email=calls.find(c=>c.url.includes('execute-actions-email'))!;const u=new URL(email.url);expect(u.searchParams.get('lifespan')).toBe('86400');expect(u.searchParams.get('redirect_uri')).toBe('https://pms.test/properties');expect(JSON.parse(email.init!.body as string)).toEqual(['VERIFY_EMAIL','UPDATE_PASSWORD']);
 });
 it('does not send a fresh password action for an already completed invitation',async()=>{
  const {service,calls}=setup([{id:'owned',email:'staff@test.invalid',emailVerified:true,requiredActions:[],attributes:{haip_staff_id:['local']}}]);expect(await service.invite('owned','local','staff@test.invalid')).toBe('accepted');expect(calls.some(c=>c.url.includes('execute-actions-email'))).toBe(false);
 });
 it('does not disable a conflicting identity and sanitizes external failures',async()=>{
  const {service}=setup([[{id:'other',email:'staff@test.invalid'}],new Error('secret remote response')]);expect(await service.findOwned('local','staff@test.invalid')).toBeUndefined();await expect(service.disable('other','local','staff@test.invalid')).rejects.toThrow('could not complete');
 });
});
