'use client';

import { useEffect, useRef, useState } from 'react';
import { addDays, differenceInDays, format, isSameDay, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { Timeline } from '@/components/calendar/Timeline';
import { NewReservationModal, type PrefillReservation } from '@/components/NewReservationModal';
import { cn } from '@/lib/cn';

export default function CalendarPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillReservation | undefined>(undefined);

  const from = format(anchor, 'yyyy-MM-dd');
  const to = format(addDays(anchor, days), 'yyyy-MM-dd');

  const today = startOfDay(new Date());
  const isOnToday = isSameDay(anchor, today);
  const daysFromToday = differenceInDays(anchor, today);
  const farFromToday = Math.abs(daysFromToday) > 30;

  // Fecha o popover de data ao clicar fora
  useEffect(() => {
    if (!datePickerOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!datePickerRef.current?.contains(e.target as Node)) setDatePickerOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [datePickerOpen]);

  function openNewReservation(opts?: PrefillReservation) {
    setPrefill(opts);
    setModalOpen(true);
  }

  function jumpToDate(value: string) {
    if (!value) return;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return;
    setAnchor(startOfDay(new Date(y, m - 1, d)));
    setDatePickerOpen(false);
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1600px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Período</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink capitalize">
              {format(anchor, "MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            {!isOnToday && farFromToday && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full',
                  daysFromToday > 0
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                )}
              >
                {daysFromToday > 0
                  ? `+${daysFromToday}d no futuro`
                  : `${Math.abs(daysFromToday)}d no passado`}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted mt-1 num-tabular">
            {format(anchor, "dd 'de' MMM", { locale: ptBR })} —{' '}
            {format(addDays(anchor, days - 1), "dd 'de' MMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Seletor de período */}
          <div className="inline-flex rounded-lg border border-line bg-surface-elevated p-0.5 text-xs">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  days === d
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink hover:bg-surface-sunken'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Botão Hoje destacado quando longe */}
          {!isOnToday && (
            <button
              onClick={() => setAnchor(today)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-200',
                'border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/50',
              )}
              data-tip="Voltar para hoje"
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              Hoje
            </button>
          )}

          {/* Navegação */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-elevated p-0.5">
            <button
              className="p-1.5 rounded-md hover:bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
              onClick={() => setAnchor(subDays(anchor, days === 30 ? 14 : 7))}
              aria-label="Período anterior"
              data-tip="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div ref={datePickerRef} className="relative">
              <button
                className="px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-sunken rounded-md transition-colors flex items-center gap-1.5"
                onClick={() => setDatePickerOpen((v) => !v)}
                data-tip="Pular para data"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Pular
              </button>
              {datePickerOpen && (
                <div className="absolute right-0 mt-2 z-30 surface-card shadow-lg p-3 w-64 space-y-2 animate-scale-in">
                  <label className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                    Pular para
                  </label>
                  <input
                    type="date"
                    autoFocus
                    defaultValue={format(anchor, 'yyyy-MM-dd')}
                    onChange={(e) => jumpToDate(e.target.value)}
                    className="input-base"
                  />
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => {
                        setAnchor(startOfDay(new Date()));
                        setDatePickerOpen(false);
                      }}
                      className="flex-1 text-xs px-2 py-1.5 rounded-md bg-surface-sunken hover:bg-surface-sunken/80 text-ink-soft hover:text-ink transition-colors"
                    >
                      Hoje
                    </button>
                    <button
                      onClick={() => {
                        setAnchor(startOfDay(addDays(new Date(), 7)));
                        setDatePickerOpen(false);
                      }}
                      className="flex-1 text-xs px-2 py-1.5 rounded-md bg-surface-sunken hover:bg-surface-sunken/80 text-ink-soft hover:text-ink transition-colors"
                    >
                      +7 dias
                    </button>
                    <button
                      onClick={() => {
                        setAnchor(startOfDay(addDays(new Date(), 30)));
                        setDatePickerOpen(false);
                      }}
                      className="flex-1 text-xs px-2 py-1.5 rounded-md bg-surface-sunken hover:bg-surface-sunken/80 text-ink-soft hover:text-ink transition-colors"
                    >
                      +30 dias
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="p-1.5 rounded-md hover:bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
              onClick={() => setAnchor(addDays(anchor, days === 30 ? 14 : 7))}
              aria-label="Próximo período"
              data-tip="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button onClick={() => openNewReservation()} disabled={!propertyId} className="btn-primary">
            <Plus className="w-4 h-4" /> Nova reserva
          </button>
        </div>
      </header>

      <Timeline
        from={from}
        to={to}
        days={days}
        startDate={anchor}
        onCellClick={(roomId, date) =>
          openNewReservation({
            roomId,
            checkIn: format(date, 'yyyy-MM-dd'),
            checkOut: format(addDays(date, 1), 'yyyy-MM-dd'),
          })
        }
      />

      <NewReservationModal
        propertyId={propertyId}
        prefill={prefill}
        open={modalOpen && !!propertyId}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
