import { Menu } from '@base-ui/react/menu';
import { useState, useRef, useId, useEffect } from 'react';
import { Star, Trash2, ArrowLeft, ArrowRight, ImagePlus, Upload, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useMediaList,
  useMediaConfig,
  useMediaMutations,
  type MediaOwnerType,
  type MediaItem,
} from '../../hooks/useMedia';

interface Props {
  propertyId: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  /** Show add/edit controls (admin). Defaults to true. */
  canManage?: boolean;
}

/**
 * Reusable image gallery for a property / room type / room. Lists media ordered
 * by sortOrder with primary badge, supports add-by-URL (always), file upload
 * (only when object storage is configured), set-primary, delete, and reorder.
 */
export default function MediaGallery({ propertyId, ownerType, ownerId, canManage = true }: Props) {
  const { t } = useTranslation();
  const { data: items = [], isLoading, isError, refetch } = useMediaList(propertyId, ownerType, ownerId);
  const { data: config } = useMediaConfig();
  const { addByUrl, upload, remove, setPrimary, reorder } = useMediaMutations(propertyId, ownerType, ownerId);

  const pageSize = 6;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [propertyId, ownerType, ownerId]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visibleItems = items.slice(start, start + pageSize);
  const busy = remove.isPending || setPrimary.isPending || reorder.isPending;
  const fieldId = useId();
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    reorder.mutate(next.map((m) => m.id));
  };

  const submitUrl = () => {
    if (!url.trim()) return;
    addByUrl.mutate(
      { url: url.trim(), caption: caption.trim() || undefined },
      { onSuccess: () => { setUrl(''); setCaption(''); } },
    );
  };

  return (
    <div>
      {canManage && (
        <div className="mb-4 border-b border-gray-100 pb-4 space-y-2">
          {config?.uploadEnabled && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload.mutate(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
                className="flex min-h-[44px] items-center gap-2 rounded-lg bg-telivity-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Upload size={14} /> {upload.isPending ? t('media.uploading') : t('media.uploadFile')}
              </button>
            </div>
          )}
          <details className="pt-2">
            <summary className="min-h-[44px] cursor-pointer text-sm text-telivity-slate">{t('media.addUrl')}</summary>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 basis-full sm:basis-auto flex-1">
                <label htmlFor={`${fieldId}-url`} className="mb-2 block text-sm font-medium text-telivity-navy">{t('media.urlLabel')}</label>
                <input id={`${fieldId}-url`} type="url" value={url} onChange={event => setUrl(event.target.value)}
                  placeholder={t('media.urlPlaceholder')}
                  className="min-h-[44px] w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-telivity-teal" />
              </div>
              <div className="min-w-0 w-full sm:w-40">
                <label htmlFor={`${fieldId}-caption`} className="mb-2 block text-sm font-medium text-telivity-navy">{t('media.captionPlaceholder')}</label>
                <input id={`${fieldId}-caption`} type="text" value={caption} onChange={event => setCaption(event.target.value)}
                  className="min-h-[44px] w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-telivity-teal" />
              </div>
              <button onClick={submitUrl} disabled={!url.trim() || addByUrl.isPending}
                className="min-h-[44px] bg-telivity-teal text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 shrink-0">
                {t('media.add')}
              </button>
            </div>

          </details>
          {addByUrl.isError && <p className="text-xs text-red-500">{t('media.couldNotAddImage')}</p>}
        </div>
      )}
      {items.length > pageSize && (
        <nav aria-label={t('media.photoPages')} className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-telivity-slate" role="status">{t('media.pageRange', { start: start + 1, end: Math.min(start + pageSize, items.length), total: items.length })}</p>
          <div className="flex gap-2">
            <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm text-telivity-navy disabled:opacity-40">{t('media.previous')}</button>
            <button disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)} className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm text-telivity-navy disabled:opacity-40">{t('media.next')}</button>
          </div>
        </nav>
      )}
      {(remove.isError || setPrimary.isError || reorder.isError || upload.isError) && <p role="alert" className="mb-3 text-sm text-red-600">{t('media.updateFailed')}</p>}
      {isError ? <div role="alert" className="py-4 text-sm text-telivity-slate">{t('media.loadFailed')} <button onClick={() => refetch()} className="min-h-[44px] px-3 font-medium text-telivity-teal">{t('media.retry')}</button></div> : isLoading ? (
        <p className="text-sm text-telivity-mid-grey">{t('media.loadingImages')}</p>
      ) : items.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-telivity-mid-grey">
          <ImagePlus size={28} className="mx-auto mb-2 opacity-60" />
          {t('media.noImagesYet')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleItems.map((m: MediaItem, index: number) => {
            const i = start + index;
            return (
              <div key={m.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="relative bg-gray-50">
                  <img src={m.url} alt={m.altText ?? m.caption ?? t('media.photoNumber', { number: i + 1 })} className="aspect-[4/3] w-full object-contain" loading="lazy" />
                  {m.isPrimary && <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-telivity-teal px-2 py-1 text-xs font-semibold text-white"><Star size={12} aria-hidden="true" />{t('media.primary')}</span>}
                </div>
                <div className="flex min-h-[52px] items-center justify-between gap-2 px-2">
                  <p className="min-w-0 truncate text-sm text-telivity-slate" title={m.caption ?? undefined}>{m.caption || t('media.photoNumber', { number: i + 1 })}</p>
                  {canManage && <Menu.Root modal={false}>
                    <Menu.Trigger aria-label={t('media.photoActions', { number: i + 1 })} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-telivity-slate hover:bg-telivity-light-grey"><MoreHorizontal size={18} /></Menu.Trigger>
                    <Menu.Portal><Menu.Positioner align="end" sideOffset={4} collisionPadding={8} className="z-[60]">
                      <Menu.Popup className="w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                        {!m.isPrimary && <Menu.Item disabled={busy} onClick={() => setPrimary.mutate(m.id)} className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-telivity-navy hover:bg-telivity-light-grey data-[highlighted]:bg-telivity-light-grey outline-none"><Star size={16} />{t('media.setAsPrimary')}</Menu.Item>}
                        <Menu.Item disabled={busy || i === 0} onClick={() => move(i, -1)} className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-telivity-navy hover:bg-telivity-light-grey data-[disabled]:opacity-40 data-[highlighted]:bg-telivity-light-grey outline-none"><ArrowLeft size={16} />{t('media.moveLeft')}</Menu.Item>
                        <Menu.Item disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-telivity-navy hover:bg-telivity-light-grey data-[disabled]:opacity-40 data-[highlighted]:bg-telivity-light-grey outline-none"><ArrowRight size={16} />{t('media.moveRight')}</Menu.Item>
                        <Menu.Item disabled={busy} onClick={() => { if (window.confirm(t('media.confirmDelete'))) remove.mutate(m.id); }} className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50 data-[highlighted]:bg-red-50 outline-none"><Trash2 size={16} />{t('media.delete')}</Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner></Menu.Portal>
                  </Menu.Root>}
                </div>
              </div>
            );
          })}
        </div>
      )}


    </div>
  );
}
