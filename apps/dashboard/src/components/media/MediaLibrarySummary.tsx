import { Dialog } from '@base-ui/react/dialog';
import { Image as ImageIcon, Images, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMediaList } from '../../hooks/useMedia';
import { useAuth } from '../../context/AuthContext';
import MediaGallery from './MediaGallery';

export default function MediaLibrarySummary({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const canManage = hasRole('admin');
  const { data: items = [], isPending, isError } = useMediaList(propertyId, 'property', propertyId);
  const cover = items.find(item => item.isPrimary) ?? items[0];

  return (
    <Dialog.Root>
      <section className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[128px_minmax(0,1fr)_auto]" aria-label={t('settings.propertyPhotos')}>
        <div className="relative flex h-24 w-24 sm:w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-telivity-light-grey text-telivity-mid-grey">
          {cover ? <img src={cover.url} alt={cover.altText ?? t('media.coverPhoto')} className="h-full w-full object-cover" /> : <ImageIcon size={24} aria-hidden="true" />}
          {cover?.isPrimary && <span className="absolute bottom-1 left-1 rounded bg-white px-2 py-0.5 text-xs text-telivity-navy">{t('media.primary')}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-telivity-navy">{t('settings.propertyPhotos')}</h2>
          <p className="mt-1 text-sm text-telivity-slate" role="status">
            {isPending ? t('media.loadingImages') : isError ? t('media.loadFailed') : t('media.photoCount', { count: items.length })}
          </p>
          <p className="mt-1 text-sm text-telivity-mid-grey">{t('media.libraryHint')}</p>
        </div>
        <Dialog.Trigger className="col-span-2 inline-flex min-h-[44px] items-center justify-center sm:col-span-1 gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-telivity-navy hover:bg-telivity-light-grey">
          <Images size={16} aria-hidden="true" />{canManage ? t('media.managePhotos') : t('media.viewPhotos')}
        </Dialog.Trigger>
      </section>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-6">
            <div>
              <Dialog.Title className="text-lg font-semibold text-telivity-navy">{t('settings.propertyPhotos')}</Dialog.Title>
              <Dialog.Description className="text-sm text-telivity-slate">{t('media.libraryHint')}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t('common.close')} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-telivity-slate hover:bg-telivity-light-grey"><X size={20} aria-hidden="true" /></Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            <MediaGallery key={propertyId} propertyId={propertyId} ownerType="property" ownerId={propertyId} canManage={canManage} />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
