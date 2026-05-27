'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar,
  Phone,
  Mail,
  IdCard,
  Users,
  Bed,
  CreditCard,
  Hash,
  Tag,
  LogIn,
  LogOut,
  XCircle,
  StickyNote,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Drawer } from './ui/Drawer';
import { Spinner } from './ui/Spinner';
import { api } from '@/lib/api';
import { useUI } from '@/lib/ui-store';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';

interface ReservationDetail {
  id: string;
  code: string;
  channel: string;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  totalAmount: string;
  commissionAmount: string | null;
  notes: string | null;
  specialRequests: string | null;
  source: string | null;
  channelReservationId: string | null;
  createdAt: string;
  guest: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    document: string | null;
    documentType: string;
    nationality: string | null;
  };
  rooms: Array<{
    id: string;
    room: { id: string; code: string; floor: number | null };
    roomType: { name: string; capacity: number };
  }>;
  payments?: Array<{ id: string; amount: string; method: string; paidAt: string }>;
}

const STATUS_INFO: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmada', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  checked_in: { label: 'Hospedado', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300', dot: 'bg-sky-500' },
  checked_out: { label: 'Finalizada', color: 'bg-sand-200 text-sand-800 dark:bg-sand-800/40 dark:text-sand-300', dot: 'bg-sand-500' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dot: 'bg-red-500' },
  no_show: { label: 'No-show', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dot: 'bg-red-500' },
};

const CHANNEL_COLOR: Record<string, string> = {
  direct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  airbnb: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  booking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  expedia: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  walk_in: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  internal: 'bg-sand-200 text-sand-800 dark:bg-sand-800/40 dark:text-sand-300',
};

export function ReservationDrawer() {
  const id = useUI((s) => s.reservationDrawerId);
  const close = useUI((s) => s.closeReservation);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => api<ReservationDetail>(`/reservations/${id}`),
    enabled: !!id,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['reservation', id] });
    qc.invalidateQueries({ queryKey: ['reservations'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['day-summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  const checkIn = useMutation({
    mutationFn: () => api(`/reservations/${id}/check-in`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Check-in registrado');
      invalidate();
    },
    onError: (e: Error) => toast.error('Erro', e.message),
  });

  const checkOut = useMutation({
    mutationFn: () => api(`/reservations/${id}/check-out`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Check-out registrado');
      invalidate();
    },
    onError: (e: Error) => toast.error('Erro', e.message),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api(`/reservations/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelado via drawer' }),
      }),
    onSuccess: () => {
      toast.success('Reserva cancelada');
      invalidate();
    },
    onError: (e: Error) => toast.error('Erro', e.message),
  });

  const r = data;
  const status = r ? STATUS_INFO[r.status] : null;
  const nights = r ? Math.max(1, differenceInDays(new Date(r.checkOut), new Date(r.checkIn))) : 0;
  const canCheckIn = r && (r.status === 'pending' || r.status === 'confirmed');
  const canCheckOut = r && r.status === 'checked_in';
  const canCancel = r && r.status !== 'cancelled' && r.status !== 'checked_out';

  return (
    <Drawer
      open={!!id}
      onClose={close}
      width="md"
      title={r ? `Reserva ${r.code}` : 'Carregando…'}
      description={r ? `${r.guest.fullName} · ${nights} noite${nights > 1 ? 's' : ''}` : undefined}
      footer={
        r && (
          <div className="flex flex-wrap gap-2 justify-end">
            {canCheckIn && (
              <button
                onClick={() => checkIn.mutate()}
                disabled={checkIn.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-b from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50 transition-all font-medium"
              >
                {checkIn.isPending ? <Spinner size={14} /> : <LogIn className="w-4 h-4" />}
                Check-in
              </button>
            )}
            {canCheckOut && (
              <button
                onClick={() => checkOut.mutate()}
                disabled={checkOut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-b from-sky-500 to-sky-600 text-white rounded-lg hover:from-sky-600 hover:to-sky-700 shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50 transition-all font-medium"
              >
                {checkOut.isPending ? <Spinner size={14} /> : <LogOut className="w-4 h-4" />}
                Check-out
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => {
                  if (confirm(`Cancelar ${r.code}? O quarto será liberado.`)) cancel.mutate();
                }}
                disabled={cancel.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg active:scale-95 disabled:opacity-50 transition-all"
              >
                {cancel.isPending ? <Spinner size={14} /> : <XCircle className="w-4 h-4" />}
                Cancelar
              </button>
            )}
          </div>
        )
      }
    >
      {isLoading || !r ? (
        <div className="p-16 flex items-center justify-center text-ink-muted">
          <Spinner size={22} />
        </div>
      ) : (
        <div className="p-6 space-y-6 animate-fade-in">
          {/* Status + canal */}
          <div className="flex items-center gap-2 flex-wrap">
            {status && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  status.color,
                )}
              >
                <span className={cn('status-dot pulse-dot', status.dot)} />
                {status.label}
              </span>
            )}
            <span
              className={cn(
                'text-[10px] px-2 py-1 rounded-full uppercase font-semibold tracking-wider',
                CHANNEL_COLOR[r.channel] ?? 'bg-sand-200 text-sand-800',
              )}
            >
              {r.channel}
            </span>
            {r.channelReservationId && (
              <span className="text-[10px] px-2 py-1 rounded-full bg-surface-sunken text-ink-muted font-mono">
                #{r.channelReservationId.slice(0, 12)}
              </span>
            )}
          </div>

          {/* Estadia — hero block */}
          <section className="relative bg-gradient-to-br from-brand-50 via-surface-elevated to-surface-elevated dark:from-brand-900/20 dark:via-surface-elevated dark:to-surface-elevated border border-brand-200/60 dark:border-brand-800/40 rounded-2xl p-5 overflow-hidden">
            <div
              aria-hidden
              className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-gradient-to-br from-gold-200/40 to-transparent dark:from-gold-700/20 blur-2xl"
            />
            <div className="flex items-center justify-between relative">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
                  Check-in
                </div>
                <div className="font-serif text-2xl tracking-serif text-ink mt-1">
                  {format(new Date(r.checkIn), 'dd', { locale: ptBR })}
                  <span className="text-base text-ink-soft ml-1">
                    {format(new Date(r.checkIn), 'MMM', { locale: ptBR })}
                  </span>
                </div>
                <div className="text-xs text-ink-muted mt-0.5 capitalize">
                  {format(new Date(r.checkIn), 'EEEE', { locale: ptBR })}
                </div>
              </div>

              <div className="flex flex-col items-center px-4">
                <div className="divider-ornament w-16 mb-2">
                  <span className="ornament text-base">◆</span>
                </div>
                <div className="text-center">
                  <div className="font-serif text-3xl tracking-serif text-brand-700 dark:text-brand-300 num-tabular">
                    {nights}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
                    {nights > 1 ? 'noites' : 'noite'}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
                  Check-out
                </div>
                <div className="font-serif text-2xl tracking-serif text-ink mt-1">
                  {format(new Date(r.checkOut), 'dd', { locale: ptBR })}
                  <span className="text-base text-ink-soft ml-1">
                    {format(new Date(r.checkOut), 'MMM', { locale: ptBR })}
                  </span>
                </div>
                <div className="text-xs text-ink-muted mt-0.5 capitalize">
                  {format(new Date(r.checkOut), 'EEEE', { locale: ptBR })}
                </div>
              </div>
            </div>
          </section>

          {/* Total + hóspedes */}
          <section className="grid grid-cols-2 gap-3">
            <Info icon={CreditCard} label="Total" big>
              {Number(r.totalAmount).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </Info>
            <Info icon={Users} label="Hóspedes">
              {r.adults} adulto{r.adults > 1 ? 's' : ''}
              {r.children > 0 && ` · ${r.children} criança${r.children > 1 ? 's' : ''}`}
            </Info>
          </section>

          {/* Quartos */}
          <section>
            <h3 className="text-[10px] uppercase text-ink-muted font-semibold tracking-[0.18em] mb-2 flex items-center gap-1.5">
              <span className="ornament">◆</span> Quartos
            </h3>
            <div className="space-y-2">
              {r.rooms.map((rr) => (
                <div
                  key={rr.id}
                  className="surface-card px-3.5 py-3 flex items-center gap-3 hover:border-brand-300/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sand-100 to-sand-200 dark:from-sand-800 dark:to-sand-900 flex items-center justify-center text-ink-soft">
                    <Bed className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-ink">Quarto {rr.room.code}</div>
                    <div className="text-xs text-ink-muted">
                      {rr.roomType.name} · cap. {rr.roomType.capacity}
                      {rr.room.floor !== null && ` · andar ${rr.room.floor}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Hóspede titular */}
          <section className="surface-card p-4 space-y-3">
            <h3 className="text-[10px] uppercase text-ink-muted font-semibold tracking-[0.18em] flex items-center gap-1.5">
              <span className="ornament">◆</span> Hóspede titular
            </h3>
            <div className="font-serif text-lg tracking-serif text-ink">{r.guest.fullName}</div>
            <div className="grid grid-cols-1 gap-2 text-sm text-ink-soft">
              {r.guest.phone && (
                <a
                  href={`tel:${r.guest.phone}`}
                  className="flex items-center gap-2 hover:text-brand-600 transition-colors group"
                >
                  <Phone className="w-3.5 h-3.5 text-ink-muted group-hover:text-brand-500" /> {r.guest.phone}
                </a>
              )}
              {r.guest.email && (
                <a
                  href={`mailto:${r.guest.email}`}
                  className="flex items-center gap-2 hover:text-brand-600 transition-colors group"
                >
                  <Mail className="w-3.5 h-3.5 text-ink-muted group-hover:text-brand-500" /> {r.guest.email}
                </a>
              )}
              {r.guest.document && (
                <div className="flex items-center gap-2">
                  <IdCard className="w-3.5 h-3.5 text-ink-muted" />
                  <span className="font-medium uppercase text-[11px] tracking-wider text-ink-muted">
                    {r.guest.documentType}:
                  </span>{' '}
                  <span className="font-mono">{r.guest.document}</span>
                </div>
              )}
              {r.guest.nationality && (
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-ink-muted" /> {r.guest.nationality}
                </div>
              )}
            </div>
          </section>

          {/* Notes / requests */}
          {(r.notes || r.specialRequests) && (
            <section className="space-y-2">
              {r.specialRequests && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3.5 text-sm text-amber-900 dark:text-amber-200 flex gap-2.5">
                  <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-gold-500" />
                  <div>
                    <div className="font-semibold text-[10px] uppercase tracking-wider mb-1">
                      Pedidos especiais
                    </div>
                    {r.specialRequests}
                  </div>
                </div>
              )}
              {r.notes && (
                <div className="bg-surface-sunken/50 border border-line rounded-xl p-3.5 text-sm text-ink-soft flex gap-2.5">
                  <StickyNote className="w-4 h-4 flex-shrink-0 mt-0.5 text-ink-muted" />
                  <div>
                    <div className="font-semibold text-[10px] uppercase tracking-wider mb-1 text-ink-muted">
                      Notas
                    </div>
                    {r.notes}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Metadata */}
          <section className="text-[11px] text-ink-muted flex items-center gap-2 pt-3 border-t border-line-soft">
            <Hash className="w-3 h-3" />
            <span className="font-mono">{r.id.slice(0, 8)}</span>
            <span>·</span>
            <Calendar className="w-3 h-3" />
            criada em {format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm')}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Info({
  icon: Icon,
  label,
  big,
  children,
}: {
  icon: LucideIcon;
  label: string;
  big?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={cn('mt-1.5 font-serif tracking-serif num-tabular text-ink', big ? 'text-xl' : 'text-base')}>
        {children}
      </div>
    </div>
  );
}
