'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import {
  BedDouble,
  CalendarCheck,
  DollarSign,
  LogOut,
  Plug,
  ArrowRight,
  ListChecks,
  TrendingUp,
  Activity,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useCan } from '@/lib/use-permissions';
import { Sparkline } from '@/components/Sparkline';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { useUI } from '@/lib/ui-store';
import { Modal } from '@/components/ui/Modal';

interface ReservationSummary {
  id: string;
  code: string;
  channel: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  rooms: string[];
  totalAmount: string;
}

interface DashboardSummary {
  occupancy: { occupied: number; total: number; percent: number };
  todayCheckIns: ReservationSummary[];
  todayCheckOuts: ReservationSummary[];
  upcomingArrivals: ReservationSummary[];
  monthRevenue: { value: number; reservationCount: number } | null;
  adr: number | null;
  revPar: number | null;
  occupancySeries: Array<{ date: string; occupied: number; total: number; percent: number }>;
  channels: Array<{
    id: string;
    channel: string;
    status: string;
    lastSyncAt: string | null;
    errorCount: number;
    syncError: string | null;
  }>;
}

const CHANNEL_COLOR: Record<string, string> = {
  direct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  airbnb: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  booking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  expedia: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  walk_in: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  internal: 'bg-sand-200 text-sand-800 dark:bg-sand-800/40 dark:text-sand-300',
};

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function DashboardPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const openReservation = useUI((s) => s.openReservation);
  const can = useCan();
  const canFinance = can('expense:read');

  // Aviso de "você já tem o sistema": acionado quando um usuário JÁ logado
  // clica em "Assinar" na landing e é mandado pra cá com ?ja-assinante=1.
  const [showAlreadyMember, setShowAlreadyMember] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ja-assinante') === '1') {
      setShowAlreadyMember(true);
      // Limpa a query da URL sem recarregar, pra não reabrir ao atualizar a página.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary', propertyId],
    queryFn: () =>
      api<DashboardSummary>(
        `/dashboard/summary${propertyId ? `?propertyId=${propertyId}` : ''}`,
      ),
    refetchInterval: 60_000,
  });

  const todayLabel = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR });
  const occSeries = data?.occupancySeries ?? [];
  const avg30 =
    occSeries.length > 0
      ? Math.round(occSeries.reduce((s, d) => s + d.percent, 0) / occSeries.length)
      : 0;
  const trend = occSeries.length >= 2
    ? Math.round(occSeries[occSeries.length - 1].percent - occSeries[0].percent)
    : 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1600px]">
      <Modal
        open={showAlreadyMember}
        onClose={() => setShowAlreadyMember(false)}
        title="Você já faz parte da Adelina ✨"
        description="Sua conta já está ativa e pronta pra usar"
        size="md"
      >
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-sunken/40 p-4">
            <div className="shrink-0 mt-0.5 rounded-lg bg-brand-500/10 p-2 text-brand-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">
              Notamos que você já está logado — ou seja,{' '}
              <strong className="text-ink">você já tem o sistema</strong> e acesso completo a todos
              os recursos. Não precisa assinar de novo. 🎉
            </p>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            Por aqui você gerencia reservas, calendário, canais (Airbnb e Booking), hóspedes e o
            financeiro da sua pousada. Se quiser revisar sua assinatura ou a forma de pagamento, é só
            ir em <strong className="text-ink-soft">Configurações</strong>.
          </p>
          <div className="flex justify-end pt-1">
            <button
              onClick={() => setShowAlreadyMember(false)}
              className="btn-primary px-5 py-2 text-sm"
            >
              Continuar no painel
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Header ornamentado */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-end justify-between flex-wrap gap-3 pb-2"
      >
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Hoje</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">
            {todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="status-dot bg-emerald-500 pulse-dot" />
          Sistema online
        </div>
      </motion.header>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-xl p-4">
          Erro ao carregar resumo: {(error as Error).message}
        </div>
      )}

      {/* Cards de métricas */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <MetricCard
          label="Ocupação"
          value={data?.occupancy.percent ?? 0}
          format={(n) => `${Math.round(n)}%`}
          sub={
            isLoading
              ? '…'
              : `${data?.occupancy.occupied ?? 0} de ${data?.occupancy.total ?? 0} quartos`
          }
          icon={BedDouble}
          accent
          loading={isLoading}
        />
        {canFinance && (
          <>
            <MetricCard
              label="Receita do mês"
              value={data?.monthRevenue?.value ?? 0}
              format={BRL}
              sub={`${data?.monthRevenue?.reservationCount ?? 0} reservas`}
              icon={DollarSign}
              loading={isLoading}
            />
            <MetricCard
              label="ADR"
              value={data?.adr ?? 0}
              format={BRL}
              sub="Receita média por diária"
              icon={TrendingUp}
              loading={isLoading}
            />
            <MetricCard
              label="RevPAR"
              value={data?.revPar ?? 0}
              format={BRL}
              sub="Receita por quarto disponível"
              icon={Activity}
              loading={isLoading}
            />
          </>
        )}
      </section>

      {/* Sparkline + chegadas/saídas */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ocupação 30 dias */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="lg:col-span-1 relative surface-card p-6 shadow-soft overflow-hidden glow-border"
        >
          <div
            aria-hidden
            className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gradient-to-br from-brand-100/60 to-transparent dark:from-brand-900/30 blur-2xl"
          />
          <div className="flex items-start justify-between relative">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-ink-muted font-semibold">
                Ocupação 30 dias
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-serif text-4xl tracking-serif text-ink num-tabular">
                  <AnimatedNumber value={avg30} format={(n) => `${Math.round(n)}%`} />
                </span>
                {trend !== 0 && (
                  <span
                    className={cn(
                      'text-xs font-medium px-1.5 py-0.5 rounded',
                      trend > 0
                        ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30'
                        : 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30',
                    )}
                  >
                    {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}pp
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-muted mt-1">média do período</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-brand-600 dark:text-brand-300" />
            </div>
          </div>
          {!isLoading && occSeries.length > 0 && (
            <div className="mt-4 -mx-2 overflow-hidden">
              <Sparkline data={occSeries.map((d) => d.percent)} width={300} height={80} />
            </div>
          )}
        </motion.div>

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReservationList
            title="Chegadas hoje"
            icon={CalendarCheck}
            empty="Nenhuma chegada programada."
            reservations={data?.todayCheckIns}
            loading={isLoading}
            onOpen={openReservation}
            showNights
            accent="emerald"
          />
          <ReservationList
            title="Saídas hoje"
            icon={LogOut}
            empty="Nenhuma saída programada."
            reservations={data?.todayCheckOuts}
            loading={isLoading}
            onOpen={openReservation}
            showCheckOut
            accent="sky"
          />
        </div>
      </section>

      {/* Próximas chegadas + canais */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ReservationList
            title="Próximas chegadas"
            subtitle="Próximos 7 dias"
            icon={ListChecks}
            empty="Nenhuma chegada nos próximos 7 dias."
            reservations={data?.upcomingArrivals}
            loading={isLoading}
            onOpen={openReservation}
            showDate
            showNights
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="surface-card p-5 space-y-3 shadow-soft"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg tracking-serif text-ink flex items-center gap-2">
              <Plug className="w-4 h-4 text-brand-500" />
              Canais
            </h2>
            <Link
              href="/canais"
              className="text-xs text-ink-muted hover:text-brand-600 flex items-center gap-0.5 transition-colors group"
            >
              gerenciar
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-6 skeleton rounded-md" />
              ))}
            </div>
          ) : data?.channels.length === 0 ? (
            <div className="text-sm text-ink-muted italic py-3">
              Nenhum canal conectado.{' '}
              <Link href="/canais" className="text-brand-600 hover:text-brand-700 underline-offset-2 hover:underline">
                Conectar
              </Link>
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {data?.channels.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded-md hover:bg-surface-sunken/50 transition-colors"
                >
                  <span className="flex items-center gap-2 capitalize text-ink">
                    <span
                      className={cn(
                        'status-dot',
                        c.status === 'active' ? 'bg-emerald-500 pulse-dot' : 'bg-red-500',
                      )}
                    />
                    <span className="font-medium">{c.channel}</span>
                  </span>
                  <span className="text-[11px] text-ink-muted num-tabular">
                    {c.lastSyncAt ? format(new Date(c.lastSyncAt), 'dd/MM HH:mm') : 'nunca'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Promo: hospitalidade */}
          <div className="pt-4 mt-3 border-t border-line-soft">
            <div className="flex items-start gap-2 text-xs text-ink-muted">
              <Sparkles className="w-3.5 h-3.5 text-gold-500 flex-shrink-0 mt-0.5" />
              <p className="italic font-serif leading-relaxed">
                "Cada hóspede é tratado como se fosse o primeiro."
              </p>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  format,
  sub,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  sub: string;
  icon: LucideIcon;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border p-5 card-hover overflow-hidden group',
        accent
          ? 'bg-gradient-to-br from-brand-50 via-surface-elevated to-surface-elevated border-brand-200/60 dark:from-brand-900/30 dark:via-surface-elevated dark:to-surface-elevated dark:border-brand-700/30'
          : 'surface-card',
      )}
    >
      {accent && (
        <div
          aria-hidden
          className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-gradient-to-br from-gold-200/40 to-transparent dark:from-gold-700/20 blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-500"
        />
      )}
      <div className="flex items-center justify-between mb-3 relative">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
          {label}
        </span>
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110',
            accent
              ? 'bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md shadow-brand-500/30'
              : 'bg-surface-sunken text-ink-soft',
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="relative">
        {loading ? (
          <div className="h-9 w-24 skeleton rounded-md" />
        ) : (
          <div className="font-serif text-[2rem] leading-none tracking-serif text-ink num-tabular">
            <AnimatedNumber value={value} format={format} />
          </div>
        )}
        <div className="text-xs text-ink-muted mt-2 truncate">{sub}</div>
      </div>
    </div>
  );
}

const ACCENT_DOT: Record<string, string> = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  brand: 'bg-brand-500',
};

function ReservationList({
  title,
  subtitle,
  icon: Icon,
  reservations,
  empty,
  loading,
  showNights,
  showCheckOut,
  showDate,
  onOpen,
  accent = 'brand',
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  reservations?: ReservationSummary[];
  empty: string;
  loading: boolean;
  showNights?: boolean;
  showCheckOut?: boolean;
  showDate?: boolean;
  onOpen: (id: string) => void;
  accent?: 'emerald' | 'sky' | 'brand';
}) {
  return (
    <div className="surface-card p-5 shadow-soft h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={cn('w-1.5 h-6 rounded-full', ACCENT_DOT[accent])} />
          <div>
            <h2 className="font-serif text-lg tracking-serif text-ink flex items-center gap-1.5">
              {title}
            </h2>
            {subtitle && <p className="text-[11px] text-ink-muted uppercase tracking-wider">{subtitle}</p>}
          </div>
        </div>
        <Link
          href="/reservas"
          className="text-xs text-ink-muted hover:text-brand-600 flex items-center gap-0.5 transition-colors group"
        >
          <Icon className="w-3.5 h-3.5" />
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2 flex-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 skeleton rounded-md" />
          ))}
        </div>
      ) : reservations?.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-ink-muted italic py-6">
          {empty}
        </div>
      ) : (
        <ul className="text-sm divide-y divide-line-soft flex-1">
          {reservations?.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onOpen(r.id)}
                className="w-full py-2.5 flex items-center justify-between gap-2 hover:bg-surface-sunken/40 -mx-2 px-2 rounded-lg transition-colors text-left group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate text-ink">{r.guestName}</span>
                    <span
                      className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider',
                        CHANNEL_COLOR[r.channel] ?? 'bg-sand-200 text-sand-800',
                      )}
                    >
                      {r.channel}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted truncate mt-0.5">
                    {r.rooms.join(', ')} · <span className="font-mono">{r.code}</span>
                  </div>
                </div>
                <div className="text-xs text-ink-muted text-right whitespace-nowrap num-tabular">
                  {showDate && format(new Date(r.checkIn), 'dd/MM')}
                  {showNights &&
                    (showDate ? ' · ' : '') + `${r.nights}n`}
                  {showCheckOut && format(new Date(r.checkOut), 'dd/MM')}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-ink-muted/0 group-hover:text-brand-500 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
