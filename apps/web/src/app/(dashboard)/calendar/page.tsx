'use client';

import { useState } from 'react';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Timeline } from '@/components/calendar/Timeline';

export default function CalendarPage() {
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const days = 14;
  const from = format(anchor, 'yyyy-MM-dd');
  const to = format(addDays(anchor, days), 'yyyy-MM-dd');

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendário operacional</h1>
          <p className="text-stone-500 text-sm">
            {format(anchor, 'dd MMM')} → {format(addDays(anchor, days - 1), 'dd MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-2 border border-stone-300 rounded-md hover:bg-stone-100"
            onClick={() => setAnchor(subDays(anchor, 7))}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            className="px-3 py-1.5 text-sm border border-stone-300 rounded-md hover:bg-stone-100"
            onClick={() => setAnchor(startOfDay(new Date()))}
          >
            Hoje
          </button>
          <button
            className="p-2 border border-stone-300 rounded-md hover:bg-stone-100"
            onClick={() => setAnchor(addDays(anchor, 7))}
            aria-label="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="ml-2 inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-md">
            <Plus className="w-4 h-4" /> Nova reserva
          </button>
        </div>
      </header>

      <Timeline from={from} to={to} days={days} startDate={anchor} />
    </div>
  );
}
