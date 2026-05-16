/**
 * Parser de feeds iCal de Airbnb e Booking.
 *
 * Diferenças entre canais:
 *  - Airbnb: SUMMARY = "Reserved" (bloqueio) ou "Airbnb (Not available)";
 *            DESCRIPTION contém "Reservation URL" + código (ex: HMABCD1234).
 *  - Booking: SUMMARY = "CLOSED - Not available" (bloqueio) ou contém nome.
 *  - Genérico (.ics export nosso): SUMMARY com código humano, DESCRIPTION estruturada.
 *
 * Retorna eventos NORMALIZADOS para o motor de sync.
 */
import * as ical from 'node-ical';
import { format } from 'date-fns';
import type { ChannelSource } from '@adelina/db';

export interface NormalizedEvent {
  /** UID original do evento — usamos como sourceRef. */
  uid: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD (exclusivo) */
  end: string;
  summary: string;
  description?: string;
  /** ID externo da reserva (extraído da descrição quando possível) */
  externalReservationId?: string;
  /** Se conseguimos identificar o tipo */
  kind: 'reservation' | 'block' | 'unknown';
}

const RES_ID_PATTERNS: Array<[ChannelSource, RegExp]> = [
  ['airbnb', /(HM[A-Z0-9]{8,})/],                     // Airbnb confirmation code
  ['booking', /Reservation:?\s*(\d{8,})/i],
  ['booking', /(\d{10})\s*-\s*\d/],
];

export function parseICal(icsText: string, channel: ChannelSource): NormalizedEvent[] {
  const data = ical.parseICS(icsText);
  const events: NormalizedEvent[] = [];

  for (const key of Object.keys(data)) {
    const item = data[key];
    if (!item || item.type !== 'VEVENT') continue;
    if (!item.start || !item.end) continue;

    const startDate = item.start instanceof Date ? item.start : new Date(item.start as string);
    const endDate = item.end instanceof Date ? item.end : new Date(item.end as string);

    const summary = String(item.summary ?? '').trim();
    const description = item.description ? String(item.description) : undefined;

    let externalReservationId: string | undefined;
    for (const [ch, pattern] of RES_ID_PATTERNS) {
      if (ch !== channel) continue;
      const match = (description ?? '').match(pattern) ?? summary.match(pattern);
      if (match?.[1]) {
        externalReservationId = match[1];
        break;
      }
    }

    let kind: NormalizedEvent['kind'] = 'unknown';
    const lower = summary.toLowerCase();
    if (
      lower.includes('reserved') ||
      lower.includes('reservation') ||
      lower.includes('booked') ||
      externalReservationId
    ) {
      kind = 'reservation';
    } else if (lower.includes('not available') || lower.includes('blocked') || lower.includes('closed')) {
      kind = 'block';
    }

    events.push({
      uid: String(item.uid ?? key),
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd'),
      summary,
      description,
      externalReservationId,
      kind,
    });
  }

  return events;
}
