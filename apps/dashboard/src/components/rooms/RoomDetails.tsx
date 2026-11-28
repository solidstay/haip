import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { api } from '../../lib/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useMediaList } from '../../hooks/useMedia';
import MediaGallery from '../media/MediaGallery';
import StatusBadge from '../ui/StatusBadge';
import { AccommodationForm } from '../property/AccommodationEditor';
import CleaningFeeEditor from '../property/CleaningFeeEditor';
import { RateTermsEditor } from '../property/BookingTermsEditor';
import { control, Field, errorMessage } from '../property/PropertyEditor';

type Row = Record<string, any>;
const unwrap = (response: any) => response.data.data ?? response.data;
const card = 'rounded-xl bg-white p-4 shadow-sm sm:p-6';
const link = 'inline-flex min-h-[44px] items-center font-medium text-telivity-teal';
const transitions: Record<string, string[]> = {
  vacant_clean: ['occupied', 'vacant_dirty', 'out_of_order', 'out_of_service'],
  vacant_dirty: ['clean', 'out_of_order'], clean: ['inspected', 'vacant_clean', 'out_of_order'],
  inspected: ['guest_ready', 'out_of_order'], guest_ready: ['occupied', 'out_of_order'],
  occupied: ['vacant_dirty'], out_of_order: ['vacant_dirty'], out_of_service: ['vacant_dirty'],
};

export default function RoomDetails() {
  const { propertyId } = useProperty();
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['rooms', 'detail', propertyId, id], enabled: !!propertyId && !!id,
    queryFn: async () => {
      const room = unwrap(await api.get(`/v1/rooms/${id}`, { params: { propertyId } }));
      const [listing, siblings] = await Promise.all([
        api.get(`/v1/rooms/types/${room.roomTypeId}`, { params: { propertyId } }).then(unwrap),
        api.get('/v1/rooms', { params: { propertyId, roomTypeId: room.roomTypeId } }).then(unwrap),
      ]);
      return { room, listing, shared: siblings.length > 1 };
    },
  });
  if (!propertyId) return <p>Select a property first.</p>;
  if (query.isError) return <div role="alert">Could not load this room. <button className="underline" onClick={() => query.refetch()}>Try again</button> <Link className={link} to={`/rooms?propertyId=${propertyId}`}>Back to rooms</Link></div>;
  if (!query.data) return <p role="status">Loading room…</p>;
  return <RoomPage key={`${propertyId}:${id}`} propertyId={propertyId} {...query.data} />;
}

function RoomPage({ propertyId, room, listing, shared }: { propertyId: string; room: Row; listing: Row; shared: boolean }) {
  const { hasRole, hasPermission } = useAuth();
  const canManagePhotos = hasRole('admin', 'general_manager', 'front_desk');
  const ownPhotos = useMediaList(propertyId, 'room', room.id);
  const canReadFees = hasPermission('ops.read') && hasPermission('services.read');
  const canReadRates = hasPermission('rateplans.read');
  const canReadBookings = hasPermission('reservations.read');
  return <div className="mx-auto max-w-6xl min-w-0 space-y-6">
    <header>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link className={link} to="/properties">Properties</Link><span aria-hidden="true">/</span>
        <Link className={link} to={`/rooms?propertyId=${propertyId}`}>Rooms</Link><span aria-hidden="true">/</span><span aria-current="page">{listing.name}</span>
      </nav>
      <h1 className="mt-2 break-words text-2xl font-semibold text-telivity-navy">{listing.name}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-telivity-slate"><span>Room {room.number}</span><StatusBadge status={room.status} />{listing.maxOccupancy && <span>Up to {listing.maxOccupancy} guests</span>}</div>
      <nav aria-label="Room sections" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-y border-gray-200 py-1 text-sm">
        <a className={link} href="#room-photos">Photos</a><a className={link} href="#room-details">Details & amenities</a>
        {canReadRates && <a className={link} href="#room-rates">Rates</a>}{canReadFees && <a className={link} href="#room-cleaning-fee">Cleaning fee</a>}
        {canReadBookings && <a className={link} href="#room-bookings">Availability & bookings</a>}<a className={link} href="#room-operations">Housekeeping & operations</a>
      </nav>
    </header>
    {shared && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">This listing is shared by multiple rooms. Photos, descriptions, rates and cleaning fees apply to all rooms in the listing. Operational settings apply only to room {room.number}.</p>}
    <section id="room-photos" className={card}>
      <h2 className="mb-2 text-lg font-semibold text-telivity-navy">Room photos</h2>
      <p className="mb-4 text-sm text-telivity-slate">These photos appear on this room’s guest listing.</p>
      <MediaGallery propertyId={propertyId} ownerType="room_type" ownerId={listing.id} canManage={canManagePhotos} />
      {ownPhotos.isError && <p role="alert">Could not load additional room photos. <button className="underline" onClick={() => ownPhotos.refetch()}>Try again</button></p>}
      {!!ownPhotos.data?.length && <div className="mt-6 border-t border-gray-200 pt-4"><h3 className="mb-2 font-semibold">Additional operational photos</h3><p className="mb-4 text-sm text-telivity-slate">Photos attached directly to this physical room.</p><MediaGallery propertyId={propertyId} ownerType="room" ownerId={room.id} canManage={canManagePhotos} /></div>}
    </section>
    <section id="room-details"><AccommodationForm row={listing} propertyId={propertyId} unit={false} embedded /></section>
    {canReadRates && <section id="room-rates"><RoomRates propertyId={propertyId} roomTypeId={listing.id} /></section>}
    {canReadFees && <section id="room-cleaning-fee"><CleaningFeeEditor roomTypeId={listing.id} embedded /></section>}
    {canReadBookings && <section id="room-bookings"><RoomBookings propertyId={propertyId} room={room} shared={shared} /></section>}
    <section id="room-operations" className="space-y-4">
      <RoomStatus propertyId={propertyId} room={room} />
      <details className={card}><summary className="cursor-pointer py-2 font-semibold text-telivity-navy">Advanced operational details</summary><p className="my-3 text-sm text-telivity-slate">Internal room label, building, location and physical-room overrides.</p><AccommodationForm row={room} propertyId={propertyId} unit embedded /></details>
    </section>
  </div>;
}

function RoomRates({ propertyId, roomTypeId }: { propertyId: string; roomTypeId: string }) {
  const query = useQuery({ queryKey: ['rate-plans', 'room', propertyId, roomTypeId],
    queryFn: async () => (unwrap(await api.get('/v1/rate-plans', { params: { propertyId } })) as Row[]).filter(row => row.roomTypeId === roomTypeId),
  });
  return <div className="space-y-4"><h2 className="text-lg font-semibold text-telivity-navy">Rates & booking terms</h2>
    {query.isError ? <p role="alert">Could not load rates. <button className="underline" onClick={() => query.refetch()}>Try again</button></p>
      : !query.data ? <p role="status">Loading rates…</p>
      : query.data.length === 0 ? <div className={card}><p>No rate plan is configured for this room.</p><Link className={link} to={`/rate-plans?propertyId=${propertyId}`}>Manage rate plans</Link></div>
      : query.data.map(rate => <div key={rate.id}><h3 className="mb-2 font-semibold">{rate.name}</h3><RateTermsEditor row={rate} propertyId={propertyId} /><Link className={link} to={`/rate-plans/${rate.id}?propertyId=${propertyId}`}>Rate calendar & restrictions</Link></div>)}
  </div>;
}

function RoomStatus({ propertyId, room }: { propertyId: string; room: Row }) {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [nextStatus, setNextStatus] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.patch(`/v1/rooms/${room.id}/status`, { status: nextStatus }, { params: { propertyId } }),
    onSuccess: async () => { setNextStatus(''); await client.invalidateQueries({ queryKey: ['rooms'] }); },
  });
  return <div className={card}><h2 className="mb-4 text-lg font-semibold text-telivity-navy">Housekeeping & operations</h2><StatusBadge status={room.status} />
    {hasPermission('ops.manage') && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
      <Field label="Change room status"><select className={control} value={nextStatus} onChange={e => setNextStatus(e.target.value)} required><option value="">Select status</option>{(transitions[room.status] ?? []).map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></Field>
      <button disabled={!nextStatus || mutation.isPending} className="min-h-[44px] rounded-lg bg-telivity-teal px-4 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving…' : 'Update status'}</button>
    </form>}
    {mutation.isError && <p role="alert" className="mt-3 text-sm text-red-700">{errorMessage(mutation.error)}</p>}
    {mutation.isSuccess && <p role="status" className="mt-3 text-sm">Room status updated.</p>}
    <Link className={`${link} mt-2`} to={`/housekeeping?propertyId=${propertyId}`}>Open housekeeping board</Link>
  </div>;
}

function RoomBookings({ propertyId, room, shared }: { propertyId: string; room: Row; shared: boolean }) {
  const [checkIn, setCheckIn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [range, setRange] = useState({ checkIn, checkOut });
  const query = useQuery({ queryKey: ['reservations', 'room-detail', propertyId, room.id, shared, range],
    queryFn: async () => {
      const rows: Row[] = [];
      for (let page = 1; ; page++) {
        const response = (await api.get('/v1/reservations', { params: {
          propertyId, arrivalDateTo: range.checkOut, departureDateFrom: range.checkIn, page, limit: 100,
        } })).data;
        rows.push(...(response.data ?? response));
        if (!response.hasMore) break;
      }
      return rows.filter(row => (row.roomId === room.id || (!shared && !row.roomId && row.roomTypeId === room.roomTypeId))
        && row.arrivalDate < range.checkOut && row.departureDate > range.checkIn)
        .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
    },
  });
  const availability = useQuery({ queryKey: ['room-availability', propertyId, room.roomTypeId, range],
    queryFn: async () => unwrap(await api.post('/v1/reservations/search-availability', { propertyId, roomTypeId: room.roomTypeId, ...range })) as Row[],
  });
  return <div className={card}><h2 className="mb-4 text-lg font-semibold text-telivity-navy">Availability & bookings</h2>
    <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (checkOut > checkIn) setRange({ checkIn, checkOut }); }}>
      <Field label="From"><input className={control} type="date" required value={checkIn} onChange={e => setCheckIn(e.target.value)} /></Field>
      <Field label="Until"><input className={control} type="date" min={format(addDays(new Date(`${checkIn || range.checkIn}T12:00:00`), 1), 'yyyy-MM-dd')} required value={checkOut} onChange={e => setCheckOut(e.target.value)} /></Field>
      <button className="min-h-[44px] rounded-lg border border-gray-300 px-4 text-sm font-semibold">Show dates</button>
    </form>
    <p className="mb-3 text-sm text-telivity-slate">Nights from {range.checkIn} to {range.checkOut} (departure).{shared ? ' Availability is shared across rooms in this listing.' : ''}</p>
    {availability.isError ? <p role="alert">Could not load availability. <button className="underline" onClick={() => availability.refetch()}>Try again</button></p>
      : !availability.data ? <p role="status">Loading availability…</p>
      : !availability.data.length ? <p>Availability is not configured for these dates.</p>
      : <ul aria-label="Nightly availability" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{availability.data.map(day => <li key={day.date} className="rounded-lg border border-gray-200 p-2 text-sm"><span className="block text-telivity-slate">{day.date}</span><strong>{shared ? `${Math.max(0, day.available)} available` : day.available > 0 ? 'Available' : 'Unavailable'}</strong></li>)}</ul>}
    <h3 className="mb-3 font-semibold">Bookings in these dates</h3>
    {query.isError ? <p role="alert">Could not load bookings. <button className="underline" onClick={() => query.refetch()}>Try again</button></p>
      : !query.data ? <p role="status">Loading bookings…</p>
      : !query.data.length ? <p className="text-sm text-telivity-slate">No bookings for this room in these dates.</p>
      : <ul className="divide-y divide-gray-100">{query.data.map(booking => <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><Link className={link} to={`/reservations/${booking.id}?propertyId=${propertyId}`}>{booking.confirmationNumber}</Link><span className="text-sm">{booking.arrivalDate} → {booking.departureDate}</span><StatusBadge status={booking.status} /></li>)}</ul>}
  </div>;
}
