import { PERMISSIONS } from '@telivityhaip/shared';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Field, control, errorMessage } from '../components/property/PropertyEditor';
import { useUnsavedChanges } from '../components/property/useUnsavedChanges';

type StaffRole = { key: string; name: string; permissions: string[]; allProperties: boolean };
type Options = { configured: boolean; canInvitePlatformAdmin: boolean; properties: { id: string; name: string }[]; roles: StaffRole[] };
type StaffAccount = { id: string; name: string; email: string; roleKey: string; propertyIds: string[]; status: string; delivery: string; error: string | null; sentAt: string | null; acceptedAt: string | null; identitySync: string; updatedAt: string };
const config = { params: { propertyId: undefined }, skipErrorToast: true };
const button = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-telivity-navy hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal disabled:cursor-not-allowed disabled:opacity-50';
const primary = button.replace('text-telivity-navy', '').replace('border-gray-300', '').replace('hover:bg-gray-50', '') + ' border-transparent bg-telivity-teal text-white hover:bg-telivity-dark-teal';
export default function Staff() {
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ['staff-options'], queryFn: async () => (await api.get<Options>('/v1/admin/staff/options', config)).data });
  const accounts = useQuery({ queryKey: ['staff-accounts'], queryFn: async () => (await api.get<StaffAccount[]>('/v1/admin/staff', config)).data });
  const [editing, setEditing] = useState<StaffAccount | 'new' | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState('readonly');
  const [propertyIds, setPropertyIds] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null); const opener = useRef<HTMLButtonElement>(null);
  useUnsavedChanges(dirty);
  const selectedRole = options.data?.roles.find(r => r.key === role);
  const allIds = options.data?.properties.map(p => p.id) ?? [];
  const chosenIds = selectedRole?.allProperties ? allIds : propertyIds;
  function start(account: StaffAccount | 'new') {
    if (busy || (dirty && !window.confirm('Discard these unsaved staff details?'))) return;
    setEditing(account); setName(account === 'new' ? '' : account.name); setEmail(account === 'new' ? '' : account.email);
    setRole(account === 'new' ? 'readonly' : account.roleKey); setPropertyIds(account === 'new' ? [] : account.propertyIds);
    setSearch(''); setDirty(false); setError(''); setMessage('');
    requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start' }); });
  }
  function close() { if (dirty && !window.confirm('Discard these unsaved staff details?')) return; setEditing(null); setDirty(false); setError(''); opener.current?.focus(); }
  async function refresh() { await qc.invalidateQueries({ queryKey: ['staff-accounts'] }); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing || !chosenIds.length || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = editing === 'new'
        ? await api.post<StaffAccount>('/v1/admin/staff', { name: name.trim(), email: email.trim(), roleKey: role, propertyIds: chosenIds }, config)
        : await api.put<StaffAccount>(`/v1/admin/staff/${editing.id}/access`, { roleKey: role, propertyIds: chosenIds, expectedUpdatedAt: editing.updatedAt }, config);
      setDirty(false); setEditing(null);
      setMessage(data.delivery === 'failed' ? 'Staff record saved. The invitation email needs a retry below.' : editing === 'new' ? 'Invitation sent. They can verify their email and choose a password using the link.' : 'Access updated. The new permissions apply to their next request.');
      await refresh(); opener.current?.focus();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function action(account: StaffAccount, operation: 'resend' | 'disable') {
    if (busy) return;
    if (operation === 'disable' && account.status !== 'disabled' && !window.confirm(`Disable access for ${account.name}? They will no longer be able to use the PMS.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.post<StaffAccount>(`/v1/admin/staff/${account.id}/${operation}`, {}, config);
      setMessage(data.error ?? (operation === 'disable' ? 'Staff access disabled.' : data.status === 'active' ? 'This invitation has already been accepted.' : 'Invitation sent. The setup link is valid for 24 hours.'));
      await refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (options.isError || accounts.isError) return <section><h1 className="text-2xl font-semibold text-telivity-navy">Staff access</h1><p role="alert" className="my-4">Staff access could not be loaded.</p><button className={button} onClick={() => { options.refetch(); accounts.refetch(); }}>Try again</button></section>;
  if (!options.data || !accounts.data) return <section aria-busy="true"><h1 className="text-2xl font-semibold text-telivity-navy">Staff access</h1><p role="status" className="my-4 text-telivity-slate">Loading staff and available roles…</p></section>;
  const data = options.data;
  return <section className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-telivity-navy">Staff access</h1><p className="mt-2 max-w-xl text-sm leading-6 text-telivity-slate">Invite your team and choose what they can do at each property. Each person signs in with their own account.</p></div>
      <button ref={opener} className={primary} disabled={busy || !data.configured || !allIds.length} onClick={() => start('new')}><UserPlus size={17} aria-hidden="true" />Invite staff member</button>
    </div>
    {!data.configured && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Invitations are not configured yet. Ask your platform administrator to connect the staff sign-in service.</p>}
    {!allIds.length && <p role="alert">You need staff and role administration permission at a property before inviting someone.</p>}
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-telivity-navy">{message}</p>}
    {editing && <form onSubmit={save} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <h2 ref={heading} tabIndex={-1} className="scroll-mt-5 text-lg font-semibold text-telivity-navy">{editing === 'new' ? 'New staff invitation' : `Access for ${editing.name}`}</h2>
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name"><input className={control} required maxLength={255} autoComplete="name" disabled={editing !== 'new'} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} /></Field>
          <Field label="Email address" hint="The password-setup link will be sent to this address."><input className={control} required type="email" maxLength={255} autoComplete="email" disabled={editing !== 'new'} value={email} onChange={e => { setEmail(e.target.value); setDirty(true); }} /></Field>
        </div>
        <Field label="Role"><select className={control} value={role} onChange={e => { setRole(e.target.value); setDirty(true); }}>{data.roles.map(r => <option key={r.key} value={r.key} disabled={r.allProperties && !data.canInvitePlatformAdmin}>{r.name}</option>)}</select></Field>
        {selectedRole?.allProperties ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6">Platform administrators have full access across all properties, including staff and website administration. Choose Property manager to restrict access to selected properties.</p> : <p className="text-sm text-telivity-slate">This role applies only to the properties selected below.</p>}
        <details className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-medium text-telivity-navy">View role permissions ({selectedRole?.permissions.length ?? 0})</summary><ul className="mt-3 grid gap-2 text-sm text-telivity-slate sm:grid-cols-2">{selectedRole?.permissions.map(p => <li key={p}>{PERMISSIONS.find(permission => permission.key === p)?.label ?? p}</li>)}</ul></details>
        <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium text-telivity-navy">{selectedRole?.allProperties ? 'All properties' : 'Property access'}</legend>
          {!selectedRole?.allProperties && <><Field label="Find a property"><input type="search" className={control} value={search} onChange={e => setSearch(e.target.value)} /></Field><div className="my-2 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => { setPropertyIds(allIds); setDirty(true); }}>Select all</button><button type="button" className={button} onClick={() => { setPropertyIds([]); setDirty(true); }}>Clear selection</button></div></>}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {data.properties.filter(p => selectedRole?.allProperties || p.name.toLowerCase().includes(search.toLowerCase())).map(p => <label key={p.id} className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded px-2 py-3 text-sm text-telivity-navy hover:bg-gray-50"><input className="mt-0.5 h-4 w-4 shrink-0 accent-telivity-teal" type="checkbox" disabled={selectedRole?.allProperties} checked={chosenIds.includes(p.id)} onChange={e => { setPropertyIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id)); setDirty(true); }} /><span>{p.name}</span></label>)}
            {!data.properties.some(p => p.name.toLowerCase().includes(search.toLowerCase())) && !selectedRole?.allProperties && <p className="p-3 text-sm text-telivity-slate">No properties match that search.</p>}
          </div><p className="mt-2 text-sm text-telivity-slate">{chosenIds.length} {chosenIds.length === 1 ? 'property' : 'properties'} selected. {!chosenIds.length && 'Select at least one property to continue.'}</p>
        </fieldset>
        <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5"><button className={primary} disabled={!chosenIds.length || (editing !== 'new' && !dirty)}>{busy ? 'Saving…' : editing === 'new' ? 'Send invitation' : 'Save access'}</button><button type="button" className={button} onClick={close}>Cancel</button></div>
      </fieldset>
    </form>}
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5"><h2 className="text-lg font-semibold text-telivity-navy">Invited staff</h2><button className={button} disabled={busy || accounts.isFetching} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div>
      {!accounts.data.length ? <div className="p-6"><ShieldCheck size={24} className="mb-3 text-telivity-teal" aria-hidden="true" /><p className="font-medium text-telivity-navy">Your team starts here</p><p className="mt-2 text-sm leading-6 text-telivity-slate">People invited from this page will appear here with their role, properties and invitation status. Existing accounts keep their current access.</p></div> : <ul className="divide-y divide-gray-100">{accounts.data.map(account => <li key={account.id} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h3 className="break-words font-semibold text-telivity-navy">{account.name}</h3><p className="break-all text-sm text-telivity-slate">{account.email}</p></div><span className="text-sm font-medium text-telivity-navy">{account.status === 'disabled' ? 'Disabled' : account.status === 'active' ? 'Active' : account.delivery === 'sent' ? 'Invitation sent' : account.delivery === 'failed' ? 'Invitation needs attention' : 'Preparing invitation'}</span></div>
        <p className="mt-3 text-sm font-medium text-telivity-navy">{data.roles.find(r => r.key === account.roleKey)?.name ?? account.roleKey}</p><p className="mt-1 text-sm leading-6 text-telivity-slate">{account.roleKey === 'admin' ? 'All properties' : account.propertyIds.map(id => data.properties.find(p => p.id === id)?.name ?? 'Unavailable property').join(' · ')}</p>
        {account.sentAt && <p className="mt-2 text-xs text-telivity-slate">Last invitation: {new Date(account.sentAt).toLocaleString()}</p>}
        {account.error && <p className="mt-3 text-sm text-red-700">{account.error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">{account.status !== 'disabled' && <><button className={button} disabled={busy} onClick={() => start(account)}>Edit access</button>{account.status === 'invited' && <button className={button} disabled={busy || !data.configured} onClick={() => action(account, 'resend')}>Resend invitation</button>}<button className={button} disabled={busy} onClick={() => action(account, 'disable')}>Disable access</button></>}{account.status === 'disabled' && account.identitySync === 'pending' && <button className={button} disabled={busy} onClick={() => action(account, 'disable')}>Retry sign-in disable</button>}</div>
      </li>)}</ul>}
    </div>
  </section>;
}
