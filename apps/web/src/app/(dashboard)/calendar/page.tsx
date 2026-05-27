'use client';

import { useState } from 'react';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { Timeline } from '@/components/calendar/Timeline';

export default function CalendarPage() {
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const from = format(anchor, 'yyyy-MM-dd');
  const to = format(addDays(anchor, days), 'yyyy-MM-dd');

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1600px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Período</span>
          </div>
          <h2 className="font-serif text-3xl tracking-serif text-ink capitalize">
            {format(anchor, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
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
            <button
              className="px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-sunken rounded-md transition-colors flex items-center gap-1.5"
              onClick={() => setAnchor(startOfDay(new Date()))}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Hoje
            </button>
            <button
              className="p-1.5 rounded-md hover:bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
              onClick={() => setAnchor(addDays(anchor, days === 30 ? 14 : 7))}
              aria-label="Próximo período"
              data-tip="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button className="btn-primary">
            <Plus className="w-4 h-4" /> Nova reserva
          </button>
        </div>
      </header>

      <Timeline from={from} to={to} days={days} startDate={anchor} />
    </div>
  );
}
