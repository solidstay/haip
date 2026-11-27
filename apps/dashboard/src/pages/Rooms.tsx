import RoomDetails from '../components/rooms/RoomDetails';
import { control, Field, errorMessage } from '../components/property/PropertyEditor';
import CleaningFeeEditor from '../components/property/CleaningFeeEditor';
import AccommodationEditor from '../components/property/AccommodationEditor';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Routes, Route, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DoorOpen, LayoutGrid, List, Plus, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/ui/StatusBadge';
import RoomCard from '../components/rooms/RoomCard';
import Modal from '../components/ui/Modal';
import MediaGallery from '../components/media/MediaGallery';

interface Room {
  id: string;
  number: string;
  roomTypeId: string;
  roomTypeName?: string;
  floor?: string;
  building?: string;
  status: string;
  guestName?: string;
  isAccessible?: boolean;
  amenities?: string[];
}

interface RoomType {
  id: string;
  name: string;
  code: string;
  maxOccupancy?: number;
  bedType?: string;
  roomCount?: number;
}

interface RoomDiaryEntry {
  roomId: string;
  guestName?: string | null;
  arrivalDate: string;
  departureDate: string;
  status: string;
}

interface StatusCount {
  status: string;
  count: number;
}

// ---- Room List / Rack ----
function RoomList() {
  const { t } = useTranslation();
  const { propertyId } = useProperty();
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [view, setView] = useState<'rack' | 'list'>('rack');
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const openRoom = (id: string) => navigate(`/rooms/${id}?propertyId=${propertyId}`);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newFloor, setNewFloor] = useState('');

  const { data: discrepanciesData } = useQuery({
    queryKey: ['rooms', 'discrepancies', propertyId, today],
    queryFn: () => api.get('/v1/rooms/discrepancies', { params: { propertyId, date: today } }).then((r) => r.data),
    enabled: !!propertyId,
  });

  const discrepancies = discrepanciesData?.discrepancies ?? discrepanciesData?.data?.discrepancies ?? [];

  const { data: roomsData } = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => api.get('/v1/rooms', { params: { propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });

  const { data: summaryData } = useQuery({
    queryKey: ['rooms', 'status-summary', propertyId],
    queryFn: () => api.get('/v1/rooms/status-summary', { params: { propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });

  const { data: typesData } = useQuery({
    queryKey: ['rooms', 'types', propertyId],
    queryFn: () => api.get('/v1/rooms/types', { params: { propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });

  const { data: diaryData } = useQuery({
    queryKey: ['reservations', 'room-diary', propertyId, today],
    queryFn: () =>
      api
        .get('/v1/reservations', {
          params: {
            propertyId,
            statuses: 'assigned,checked_in,stayover,due_out',
            arrivalDateTo: today,
            departureDateFrom: today,
            limit: 100,
          },
        })
        .then((r) => r.data),
    enabled: !!propertyId,
  });

  const rawRooms: Room[] = roomsData?.data ?? roomsData ?? [];
  const summary: StatusCount[] = summaryData?.data ?? summaryData ?? [];
  const types: RoomType[] = typesData?.data ?? typesData ?? [];
  const typesById = new Map(types.map((type) => [type.id, type]));
  // The room list returns type IDs; resolve names for cards, list and details.
  const rooms = rawRooms.map((room) => ({
    ...room,
    roomTypeName: typesById.get(room.roomTypeId)?.name ?? room.roomTypeName,
  }));

  const diaryByRoomId = useMemo(() => {
    const map = new Map<string, RoomDiaryEntry>();
    for (const r of (diaryData?.data ?? []) as RoomDiaryEntry[]) {
      if (r.roomId) map.set(r.roomId, r);
    }
    return map;
  }, [diaryData]);

  const createMutation = useMutation({
    mutationFn: () => api.post('/v1/rooms/individual', {
      propertyId, name: newRoomName.trim(), number: newRoomNumber.trim(),
      maxOccupancy: Number(newCapacity), ...(newFloor ? { floor: newFloor } : {}),
    }),
    onSuccess: async response => {
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setCreateOpen(false);
      openRoom((response.data.data ?? response.data).id);
    },
  });

  // Group rooms by floor for rack view
  const roomsByFloor = rooms.reduce<Record<string, Room[]>>((acc, r) => {
    const floor = r.floor ?? '1';
    (acc[floor] ??= []).push(r);
    return acc;
  }, {});

  if (!propertyId) {
    return <div className="flex items-center justify-center h-64 text-telivity-mid-grey">{t('rooms.selectProperty')}</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DoorOpen size={24} className="text-telivity-teal" />
        <h1 className="text-2xl font-semibold text-telivity-navy">{t('rooms.title')}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button aria-label={t('rooms.cardView', { defaultValue: 'Card view' })} aria-pressed={view === 'rack'} onClick={() => setView('rack')} className={`p-3 ${view === 'rack' ? 'bg-telivity-teal text-white' : 'hover:bg-telivity-light-grey'}`}><LayoutGrid size={16} /></button>
            <button aria-label={t('rooms.listView', { defaultValue: 'List view' })} aria-pressed={view === 'list'} onClick={() => setView('list')} className={`p-3 ${view === 'list' ? 'bg-telivity-teal text-white' : 'hover:bg-telivity-light-grey'}`}><List size={16} /></button>
          </div>
          {hasPermission('ops.manage') && <button onClick={() => { createMutation.reset(); setCreateOpen(true); }} className="flex items-center gap-2 bg-telivity-teal text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-telivity-light-teal transition-colors">
            <Plus size={16} /> {t('rooms.addRoom')}
          </button>}
        </div>
      </div>

      {/* Room status discrepancies */}
      {discrepancies.length > 0 && (
        <div className="bg-telivity-orange/10 border border-telivity-orange/30 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-telivity-orange" />
            <h3 className="text-sm font-semibold text-telivity-navy">{t('rooms.discrepancies.title')}</h3>
            <span className="text-xs text-telivity-mid-grey ml-auto">{t('rooms.discrepancies.count', { count: discrepancies.length })}</span>
          </div>
          <ul className="space-y-2">
            {discrepancies.map((d: { roomId: string; roomNumber: string; kind: string; message: string }) => (
              <li key={`${d.roomId}-${d.kind}`} className="text-sm text-telivity-slate flex items-start gap-2">
                <span className="font-medium text-telivity-navy">{d.roomNumber}</span>
                <span>
                  {d.kind === 'occupied_without_reservation'
                    ? t('rooms.discrepancies.occupiedWithoutReservation')
                    : t('rooms.discrepancies.vacantWithReservation')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status Summary */}
      <div className="flex flex-wrap gap-2 mb-4">
        {summary.map((s) => (
          <div key={s.status} className="bg-white rounded-lg shadow-sm px-3 py-2 flex items-center gap-2">
            <StatusBadge status={s.status} label={t(`dashboard.roomStatuses.${s.status}`, { defaultValue: s.status })} />
            <span className="text-sm font-semibold text-telivity-navy">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Rack View */}
      {view === 'rack' && (
        <div className="space-y-6">
          <p className="text-xs text-telivity-mid-grey">{t('rooms.diaryCaption', { date: today })}</p>
          {Object.entries(roomsByFloor).sort(([a], [b]) => Number(a) - Number(b)).map(([floor, floorRooms]) => (
            <div key={floor}>
              <h3 className="text-xs font-semibold text-telivity-mid-grey uppercase tracking-wider mb-2">{t('rooms.floorNumber', { floor })}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {floorRooms.sort((a, b) => a.number.localeCompare(b.number)).map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    roomType={typesById.get(room.roomTypeId)}
                    propertyId={propertyId}
                    diary={diaryByRoomId.get(room.id)}
                    onOpen={() => openRoom(room.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {rooms.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center text-telivity-mid-grey">{t('rooms.noRoomsFound')}</div>
          )}
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-telivity-teal/5 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.roomNumberHeader')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">Room name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.floor')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('common.status')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.guest')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.diaryStay')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">ADA</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => {
                const diary = diaryByRoomId.get(r.id);
                return (
                <tr key={r.id} onClick={() => openRoom(r.id)} className={`border-b border-gray-50 cursor-pointer hover:bg-telivity-light-grey/50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-telivity-navy">{r.number}</td>
                  <td className="px-4 py-3 text-sm text-telivity-slate"><Link to={`/rooms/${r.id}?propertyId=${propertyId}`} className="font-medium text-telivity-teal">{r.roomTypeName ?? 'View room'}</Link></td>
                  <td className="px-4 py-3 text-sm text-telivity-slate">{r.floor ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} label={t(`dashboard.roomStatuses.${r.status}`, { defaultValue: r.status })} /></td>
                  <td className="px-4 py-3 text-sm text-telivity-slate">{diary?.guestName ?? r.guestName ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-telivity-slate">
                    {diary ? `${diary.arrivalDate} → ${diary.departureDate}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">{r.isAccessible ? t('common.yes') : '—'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => { if (!createMutation.isPending) setCreateOpen(false); }} title="Add room">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); createMutation.mutate(); }}>
          <Field label="Room name"><input className={control} required maxLength={100} value={newRoomName} onChange={e => setNewRoomName(e.target.value)} /></Field>
          <Field label="Room number / label"><input className={control} required maxLength={20} value={newRoomNumber} onChange={e => setNewRoomNumber(e.target.value)} /></Field>
          <Field label="Maximum guests"><input className={control} type="number" required min={1} step={1} value={newCapacity} onChange={e => setNewCapacity(e.target.value)} /></Field>
          <Field label="Floor (optional)"><input className={control} maxLength={10} value={newFloor} onChange={e => setNewFloor(e.target.value)} /></Field>
          <p className="text-sm text-telivity-slate">Creates one individually advertised room. Add its photos, details and rates on the next page.</p>
          {createMutation.isError && <p role="alert" className="text-sm text-red-700">{errorMessage(createMutation.error)}</p>}
          <button disabled={!newRoomNumber.trim() || !newRoomName.trim() || !newCapacity || createMutation.isPending} className="min-h-[44px] w-full rounded-lg bg-telivity-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{createMutation.isPending ? 'Creating…' : 'Create room'}</button>
        </form>
      </Modal>
    </div>
  );
}

// ---- Room Types ----
function RoomTypeList() {
  const { t } = useTranslation();
  const { propertyId } = useProperty();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [maxOcc, setMaxOcc] = useState(2);
  const [bedType, setBedType] = useState('king');
  const [photoType, setPhotoType] = useState<RoomType | null>(null);

  const { data } = useQuery({
    queryKey: ['rooms', 'types', propertyId],
    queryFn: () => api.get('/v1/rooms/types', { params: { propertyId } }).then((r) => r.data),
    enabled: !!propertyId,
  });

  const types: RoomType[] = data?.data ?? data ?? [];

  const createMutation = useMutation({
    mutationFn: () => api.post('/v1/rooms/types', { propertyId, name, code, maxOccupancy: maxOcc, defaultOccupancy: maxOcc, bedType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', 'types'] });
      setCreateOpen(false);
      setName(''); setCode('');
    },
  });

  if (!propertyId) {
    return <div className="flex items-center justify-center h-64 text-telivity-mid-grey">{t('common.selectProperty')}</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/rooms')} className="p-1.5 rounded hover:bg-telivity-light-grey">
          <DoorOpen size={20} />
        </button>
        <h1 className="text-2xl font-semibold text-telivity-navy">{t('rooms.roomTypes')}</h1>
        <button onClick={() => setCreateOpen(true)} className="ml-auto flex items-center gap-2 bg-telivity-teal text-white rounded-lg px-4 py-2 text-sm font-semibold">
          <Plus size={16} /> {t('rooms.newType')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-telivity-teal/5 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('common.name')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.code')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.maxOccupancy')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.bedType')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.title')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-telivity-slate uppercase">{t('rooms.photos')}</th>
            </tr>
          </thead>
          <tbody>
              {types.map((roomType, i) => (
              <tr key={roomType.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-telivity-navy"><Link className="inline-flex min-h-[44px] items-center text-telivity-teal underline underline-offset-4" to={`/rooms/types/${roomType.id}?propertyId=${propertyId}`}>{roomType.name}</Link></td>
                <td className="px-4 py-3 text-sm text-telivity-slate">{roomType.code}</td>
                <td className="px-4 py-3 text-sm text-telivity-slate">{roomType.maxOccupancy ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-telivity-slate">{roomType.bedType ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-telivity-slate">{roomType.roomCount ?? '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <button onClick={() => setPhotoType(roomType)} className="flex items-center gap-1.5 text-telivity-teal hover:text-telivity-light-teal font-medium">
                    <ImageIcon size={14} /> {t('common.manage')}
                  </button>
                </td>
              </tr>
            ))}
            {types.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-telivity-mid-grey">{t('rooms.noRoomTypes')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {photoType && propertyId && (
        <Modal open={!!photoType} onClose={() => setPhotoType(null)} title={t('rooms.photosForType', { name: photoType.name })}>
          <MediaGallery propertyId={propertyId} ownerType="room_type" ownerId={photoType.id} />
        </Modal>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('rooms.newRoomType')}>
        <div className="space-y-4">
          <div><label className="block text-xs font-medium text-telivity-mid-grey mb-1">{t('common.name')} *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-telivity-teal" /></div>
          <div><label className="block text-xs font-medium text-telivity-mid-grey mb-1">{t('rooms.code')} *</label><input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-telivity-teal" /></div>
          <div><label className="block text-xs font-medium text-telivity-mid-grey mb-1">{t('rooms.maxOccupancy')}</label><input type="number" min={1} value={maxOcc} onChange={(e) => setMaxOcc(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-telivity-teal" /></div>
          <div>
            <label className="block text-xs font-medium text-telivity-mid-grey mb-1">{t('rooms.bedType')}</label>
            <select value={bedType} onChange={(e) => setBedType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-telivity-teal">
              <option value="king">{t('rooms.bedTypes.king')}</option><option value="queen">{t('rooms.bedTypes.queen')}</option><option value="double">{t('rooms.bedTypes.double')}</option><option value="twin">{t('rooms.bedTypes.twin')}</option><option value="suite">{t('rooms.bedTypes.suite')}</option>
            </select>
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!name || !code || createMutation.isPending} className="w-full bg-telivity-teal text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">{createMutation.isPending ? t('common.creating') : t('common.create')}</button>
        </div>
      </Modal>
    </div>
  );
}

export default function Rooms() {
  return (
    <Routes>
      <Route index element={<RoomList />} />
      <Route path="types" element={<RoomTypeList />} />
      <Route path="types/:id/cleaning-fee" element={<CleaningFeeEditor />} />
      <Route path="types/:id" element={<AccommodationEditor />} />
      <Route path=":id" element={<RoomDetails />} />
      <Route path=":id/edit" element={<AccommodationEditor unit />} />
    </Routes>
  );
}
