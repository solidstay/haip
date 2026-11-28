import { useEffect, useState } from 'react';
import { Link, Navigate, useBeforeUnload, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ExternalLink, Check, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WebsiteRequestError, websiteApiUrl, websiteRequest, websitePageSchema, websitePagesSchema, websiteMediaSchema, type WebsitePage, type WebsiteMedia, type WebsiteContent } from '../lib/website';

const button = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-telivity-light-grey focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal disabled:opacity-50 disabled:cursor-not-allowed';
const field = 'mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-telivity-navy focus:border-telivity-teal focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-telivity-teal';
const key = ['website-pages'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function WebsitePages() {
  const { hasRole } = useAuth();
  const { t } = useTranslation();
  const { pageId } = useParams();
  const enabled = hasRole('admin') && Boolean(websiteApiUrl());
  const pages = useQuery({ queryKey: key, queryFn: () => websiteRequest('pages', websitePagesSchema), enabled, staleTime: 0, retry: false, refetchOnWindowFocus: false });
  const media = useQuery({ queryKey: ['website-media'], queryFn: () => websiteRequest('media', websiteMediaSchema), enabled, staleTime: 60000, retry: false });
  const [dirty, setDirty] = useState(false);
  useBeforeUnload(event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  if (!enabled) return <Navigate to="/admin/features" replace />;
  const page = pages.data?.pages.find(page => page.id === pageId) ?? pages.data?.pages[0];
  return <section>
    <h1 className="text-2xl font-semibold text-telivity-navy">{t('websitePages.title')}</h1>
    <p className="mt-3 max-w-prose text-telivity-slate">{t('websitePages.introduction')}</p>
    {pages.isLoading ? <p role="status" className="mt-6">{t('websitePages.loading')}</p> : pages.isError ? <div role="alert" className="mt-6"><p>{t('websitePages.loadFailed')}</p><button className={button + ' mt-3'} onClick={() => pages.refetch()}>{t('common.retry')}</button></div> : page ? <div className="mt-8 grid gap-8 md:grid-cols-[160px_minmax(0,1fr)]">
      <nav aria-label={t('websitePages.pages')} className="flex flex-wrap content-start gap-1 md:flex-col">{pages.data!.pages.map(item => <Link key={item.id} to={`/admin/website/pages/${item.id}`} aria-current={item.id === page.id ? 'page' : undefined}
        onClick={event => { if (dirty && item.id !== page.id && !window.confirm(t('websitePages.discardConfirm'))) event.preventDefault(); }}
        className={`flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium ${item.id === page.id ? 'bg-blue-50 text-telivity-navy' : 'text-telivity-slate hover:bg-gray-100'}`}>{item.label}</Link>)}</nav>
      <PageEditor key={page.id} page={page} media={media.data} mediaFailed={media.isError} retryMedia={() => media.refetch()} onDirty={setDirty} />
    </div> : <p role="status" className="mt-6">{t('websitePages.empty')}</p>}
  </section>;
}

function PageEditor({ page, media, mediaFailed, retryMedia, onDirty }: { page: WebsitePage; media?: WebsiteMedia; mediaFailed: boolean; retryMedia: () => void; onDirty: (dirty: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WebsiteContent>(() => structuredClone(page.draft));
  const [saved, setSaved] = useState(page);
  const [propertySlug, setPropertySlug] = useState(page.draft.photo.propertySlug);
  const [photoPage, setPhotoPage] = useState(0);
  const [preview, setPreview] = useState<string>();
  const dirty = !same(draft, saved.draft);
  const unpublished = !same(saved.draft, saved.published);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const save = useMutation({
    mutationFn: (publish: boolean) => websiteRequest(`pages/${page.id}/${publish ? 'publish' : 'draft'}`, websitePageSchema, 'PUT', { revision: saved.revision, content: draft }),
    onSuccess: next => { setSaved(next); setDraft(structuredClone(next.draft)); setPreview(undefined); queryClient.setQueryData(key, (current: { pages: WebsitePage[] } | undefined) => current && ({ pages: current.pages.map(item => item.id === next.id ? next : item) })); },
  });
  const makePreview = useMutation({
    mutationFn: () => websiteRequest(`pages/${page.id}/preview`, z.object({ url: z.string().url(), expiresInSeconds: z.number() }), 'POST'),
    onSuccess: result => setPreview(result.url),
  });
  const status = dirty ? t('websitePages.unsaved') : unpublished ? t('websitePages.savedDraft') : t('websitePages.published');
  const selectedProperty = media?.properties.find(property => property.slug === propertySlug);
  const selectedPhoto = media?.properties.find(property => property.slug === draft.photo.propertySlug)?.photos.find(photo => photo.filename === draft.photo.filename);
  const photoCount = selectedProperty?.photos.length ?? 0;
  const photoPages = Math.max(1, Math.ceil(photoCount / 6));
  const busy = save.isPending || makePreview.isPending;
  function change(content: WebsiteContent) { setDraft(content); setPreview(undefined); save.reset(); makePreview.reset(); }
  const stale = save.error instanceof WebsiteRequestError && save.error.status === 409;
  const forbidden = save.error instanceof WebsiteRequestError && [401,403].includes(save.error.status);
  const invalid = save.error instanceof WebsiteRequestError && save.error.status === 400;
  return <form className="min-w-0" onSubmit={event => { event.preventDefault(); save.mutate(false); }}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-telivity-navy">{page.label}</h2><p role="status" className="text-sm text-telivity-slate">{status}</p></div>
    <fieldset disabled={busy} className="mt-6 space-y-6">
      <legend className="sr-only">{t('websitePages.heroContent')}</legend>
      <div><label htmlFor="hero-heading" className="text-sm font-medium text-telivity-navy">{t('websitePages.heading')}</label><textarea id="hero-heading" required maxLength={160} rows={3} value={draft.heading} onChange={event => change({ ...draft, heading: event.target.value })} className={field} aria-describedby="heading-help" /><p id="heading-help" className="mt-2 text-sm text-telivity-slate">{t('websitePages.headingHelp')}</p></div>
      <div><label htmlFor="hero-description" className="text-sm font-medium text-telivity-navy">{t('websitePages.description')}</label><textarea id="hero-description" required maxLength={500} rows={3} value={draft.description} onChange={event => change({ ...draft, description: event.target.value })} className={field} /></div>
      <section aria-labelledby="hero-photo-label">
        <h3 id="hero-photo-label" className="text-base font-semibold text-telivity-navy">{t('websitePages.heroPhoto')}</h3>
        <p className="mt-2 text-sm text-telivity-slate">{t('websitePages.photoHelp')} <Link to="/properties" className="underline underline-offset-2">{t('websitePages.managePhotos')}</Link></p>
        {selectedPhoto ? <figure className="mt-4"><img src={selectedPhoto.url} alt={selectedPhoto.alt} className="h-40 w-full rounded-lg object-cover" /><figcaption className="mt-2 text-sm text-telivity-slate">{t('websitePages.selectedPhoto')}</figcaption></figure> : <p className="mt-4 text-sm text-telivity-slate">{t('websitePages.photoUnavailable')}</p>}
        {mediaFailed ? <div role="alert" className="mt-4"><p>{t('websitePages.mediaFailed')}</p><button type="button" className={button + ' mt-2'} onClick={retryMedia}>{t('common.retry')}</button></div> : !media ? <p role="status" className="mt-4">{t('websitePages.loadingPhotos')}</p> : <>
          <label htmlFor="photo-property" className="mt-5 block text-sm font-medium text-telivity-navy">{t('websitePages.photoLibrary')}</label>
          <select id="photo-property" value={propertySlug} className={field} onChange={event => { setPropertySlug(event.target.value); setPhotoPage(0); }}>{!selectedProperty && <option value={propertySlug}>{t('websitePages.chooseProperty')}</option>}{media.properties.map(property => <option key={property.slug} value={property.slug}>{property.name}</option>)}</select>
          <div role="group" aria-label={t('websitePages.choosePhoto')} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{selectedProperty?.photos.slice(photoPage * 6, photoPage * 6 + 6).map((photo, index) => {
            const active = draft.photo.propertySlug === propertySlug && draft.photo.filename === photo.filename;
            return <button type="button" key={photo.filename} aria-label={t('websitePages.photoNumber', { number: photoPage * 6 + index + 1, property: selectedProperty.name })} aria-pressed={active}
              className={`relative overflow-hidden rounded-lg border-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-telivity-teal ${active ? 'border-telivity-teal' : 'border-transparent'}`}
              onClick={() => change({ ...draft, photo: { propertySlug, filename: photo.filename } })}><img loading="lazy" src={photo.url} alt="" className="aspect-[4/3] w-full object-cover" />{active && <span className="absolute right-2 top-2 rounded-full bg-white p-1 text-telivity-navy"><Check size={16} aria-hidden="true" /></span>}</button>;
          })}</div>
          {photoCount === 0 ? <p className="mt-3 text-sm text-telivity-slate">{t('websitePages.noPhotos')}</p> : <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button type="button" className={button} disabled={photoPage === 0} onClick={() => setPhotoPage(value => value - 1)}>{t('websitePages.previous')}</button><span role="status" className="text-sm text-telivity-slate">{t('websitePages.pagination', { page: photoPage + 1, pages: photoPages, count: photoCount })}</span><button type="button" className={button} disabled={photoPage >= photoPages - 1} onClick={() => setPhotoPage(value => value + 1)}>{t('websitePages.next')}</button></div>}
        </>}
      </section>
      <section aria-labelledby="hero-buttons-label"><h3 id="hero-buttons-label" className="text-base font-semibold text-telivity-navy">{t('websitePages.buttons')}</h3><p className="mt-2 text-sm text-telivity-slate">{t('websitePages.buttonsHelp')}</p>
        {draft.actions.map((action, index) => <div key={index} className="mt-4 grid gap-3 rounded-lg border border-gray-200 p-4 sm:grid-cols-2">
          <div><label htmlFor={`action-label-${index}`} className="text-sm font-medium">{t('websitePages.buttonLabel', { number: index + 1 })}</label><input id={`action-label-${index}`} required maxLength={60} value={action.label} onChange={event => change({ ...draft, actions: draft.actions.map((value,i) => i === index ? { ...value, label: event.target.value } : value) })} className={field} /></div>
          <div><label htmlFor={`action-link-${index}`} className="text-sm font-medium">{t('websitePages.buttonLink')}</label><input id={`action-link-${index}`} required maxLength={500} value={action.href} onChange={event => change({ ...draft, actions: draft.actions.map((value,i) => i === index ? { ...value, href: event.target.value } : value) })} className={field} /></div>
          <button type="button" className={button + ' sm:col-span-2 sm:justify-self-start'} onClick={() => change({ ...draft, actions: draft.actions.filter((_,i) => i !== index) })}>{t('websitePages.removeButton', { number: index + 1 })}</button>
        </div>)}
        {draft.actions.length < 2 && <button type="button" className={button + ' mt-4'} onClick={() => change({ ...draft, actions: [...draft.actions, { label: '', href: '' }] })}>{t('websitePages.addButton')}</button>}
      </section>
      <div className="border-t border-gray-200 pt-5">
        <div className="flex flex-wrap gap-3"><button type="submit" disabled={!dirty || busy || stale} className={button}>{save.isPending ? t('websitePages.saving') : t('websitePages.saveDraft')}</button>
          <button type="button" className={button} disabled={dirty || busy} onClick={() => makePreview.mutate()}><ImageIcon size={16} aria-hidden="true" />{t('websitePages.preview')}</button>
          <button type="button" disabled={dirty || !unpublished || busy || stale} className={button + ' border-transparent bg-telivity-teal text-white hover:bg-telivity-teal/90'} onClick={() => save.mutate(true)}>{t('websitePages.publish')}</button>
        </div><p className="mt-3 text-sm text-telivity-slate">{t('websitePages.workflow')}</p>
        {save.isSuccess && <p role="status" className="mt-3 text-sm text-telivity-slate">{save.variables ? t('websitePages.publishSuccess') : t('websitePages.draftSuccess')}</p>}
        {save.isError && <div role="alert" className="mt-3 text-sm text-red-700"><p>{t(stale ? 'websitePages.stale' : forbidden ? 'websitePages.denied' : invalid ? 'websitePages.invalid' : 'websitePages.saveFailed')}</p>{stale && <button type="button" className={button + ' mt-2'} onClick={() => { if (window.confirm(t('websitePages.discardConfirm'))) window.location.reload(); }}>{t('websitePages.reload')}</button>}</div>}
        {makePreview.isError && <p role="alert" className="mt-3 text-sm text-red-700">{t('websitePages.previewFailed')}</p>}
        {preview && <a href={preview} target="_blank" rel="noopener noreferrer" className={button + ' mt-4'}>{t('websitePages.openPreview')}<ExternalLink size={16} aria-hidden="true" /></a>}
      </div>
    </fieldset>
  </form>;
}
