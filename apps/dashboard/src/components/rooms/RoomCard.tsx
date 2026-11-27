import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BedDouble, ChevronRight, Image as ImageIcon, Users } from 'lucide-react';
import { useMediaList } from '../../hooks/useMedia';
import StatusBadge from '../ui/StatusBadge';

interface RoomCardProps {
  propertyId: string;
  room: {
    id: string;
    number: string;
    roomTypeId: string;
    roomTypeName?: string;
    status: string;
    guestName?: string;
  };
  roomType?: { name: string; maxOccupancy?: number; bedType?: string };
  diary?: { guestName?: string | null; arrivalDate: string; departureDate: string };
  onOpen: () => void;
}

export default function RoomCard({ propertyId, room, roomType, diary, onOpen }: RoomCardProps) {
  const { t } = useTranslation();
  const { data: roomMedia = [], isPending: roomPending } = useMediaList(propertyId, 'room', room.id);
  const { data: typeMedia = [], isPending: typePending } = useMediaList(propertyId, 'room_type', room.roomTypeId);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const roomImage = roomMedia.find((media) => media.isPrimary) ?? roomMedia[0];
  const typeImage = typeMedia.find((media) => media.isPrimary) ?? typeMedia[0];
  const photo = [roomImage, typeImage].find((media) => media && !failedUrls.includes(media.url));
  const name = roomType?.name ?? room.roomTypeName;
  const guest = diary?.guestName ?? room.guestName;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('rooms.openRoom', { number: room.number, name: name ?? '', defaultValue: 'View {{number}} · {{name}}' })}
      className="room-overview-card min-w-0 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left hover:border-telivity-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-telivity-teal focus-visible:ring-offset-2"
    >
      <span className="flex h-40 w-full shrink-0 items-center justify-center bg-telivity-light-grey text-telivity-mid-grey">
        {photo ? (
          <img
            src={photo.url}
            alt={photo.altText ?? name ?? room.number}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setFailedUrls((urls) => [...urls, photo.url])}
          />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm">
            <ImageIcon size={24} aria-hidden="true" />
            {roomPending || typePending ? t('rooms.loadingPhoto', { defaultValue: 'Loading photo…' }) : t('rooms.noPhoto')}
          </span>
        )}
      </span>
      <span className="flex w-full flex-1 flex-col gap-3 p-4">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-telivity-slate">{room.number}</span>
          <StatusBadge status={room.status} />
        </span>
        <span className="block text-base font-semibold leading-snug text-telivity-navy break-words">
          {name ?? t('rooms.typeUnavailable', { defaultValue: 'Room type unavailable' })}
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-telivity-slate">
          {roomType?.maxOccupancy != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users size={16} aria-hidden="true" />
              {t('rooms.guestCapacity', { count: roomType.maxOccupancy, defaultValue: 'Up to {{count}} guests' })}
            </span>
          )}
          {roomType?.bedType && (
            <span className="inline-flex items-center gap-1.5">
              <BedDouble size={16} aria-hidden="true" />
              {t(`rooms.bedTypes.${roomType.bedType}`, { defaultValue: roomType.bedType.replace(/_/g, ' ') })}
            </span>
          )}
        </span>
        {(guest || diary) && (
          <span className="block text-sm text-telivity-slate">
            {guest && <span className="block font-medium break-words">{guest}</span>}
            {diary && <span className="block text-xs mt-1">{diary.arrivalDate} → {diary.departureDate}</span>}
          </span>
        )}
        <span className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-medium text-telivity-teal">
          {t('rooms.viewDetails', { defaultValue: 'View details' })}
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
