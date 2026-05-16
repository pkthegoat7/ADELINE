/**
 * Gera feed iCal exportável para canais consumirem nosso calendário.
 * URL pública assinada: /api/ical/{property_id}/{room_id}.ics?token=xxx
 */
import ical, { ICalCalendarMethod, ICalEventBusyStatus } from 'ical-generator';
import { addDays } from 'date-fns';

export interface AvailabilityEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
}

export function buildICal(opts: {
  name: string;
  events: AvailabilityEvent[];
  prodId?: string;
}): string {
  const cal = ical({
    name: opts.name,
    prodId: opts.prodId ?? '//Adelina PMS//Channel Manager//PT',
    method: ICalCalendarMethod.PUBLISH,
    timezone: 'UTC',
  });

  for (const ev of opts.events) {
    cal.createEvent({
      id: ev.uid,
      start: ev.start,
      end: ev.end,
      summary: ev.summary,
      description: ev.description,
      busystatus: ICalEventBusyStatus.BUSY,
      allDay: true,
    });
  }

  return cal.toString();
}

/**
 * Agrupa intervalos contíguos de availability em eventos VEVENT.
 * Ex: dias 10,11,12 reservados pela mesma reserva → 1 evento [10..13).
 */
export function compactAvailabilityIntoEvents(
  rows: Array<{ date: Date; status: string; reservationId: string | null; sourceRef: string | null }>,
): AvailabilityEvent[] {
  const sorted = [...rows]
    .filter((r) => r.status !== 'available')
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const events: AvailabilityEvent[] = [];
  let current: { start: Date; end: Date; key: string; ref: string | null } | null = null;

  for (const row of sorted) {
    const key = `${row.status}|${row.reservationId ?? ''}|${row.sourceRef ?? ''}`;
    const dayAfter = addDays(row.date, 1);
    if (current && current.key === key && current.end.getTime() === row.date.getTime()) {
      current.end = dayAfter;
    } else {
      if (current) {
        events.push({
          uid: `${current.ref ?? `block-${current.start.getTime()}`}@adelina-pms`,
          start: current.start,
          end: current.end,
          summary: current.key.startsWith('reserved') ? 'Reserved' : 'Blocked',
        });
      }
      current = { start: row.date, end: dayAfter, key, ref: row.reservationId ?? row.sourceRef };
    }
  }
  if (current) {
    events.push({
      uid: `${current.ref ?? `block-${current.start.getTime()}`}@adelina-pms`,
      start: current.start,
      end: current.end,
      summary: current.key.startsWith('reserved') ? 'Reserved' : 'Blocked',
    });
  }

  return events;
}
