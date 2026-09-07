import {
  addDays,
  addMonths,
  differenceInCalendarMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { ISODate } from '@/types/common';

export const ISO = 'yyyy-MM-dd';

export function today(): ISODate {
  return format(new Date(), ISO);
}

export function toISO(date: Date): ISODate {
  return format(date, ISO);
}

export function fromISO(date: ISODate): Date {
  return parseISO(date);
}

export function formatDate(date: ISODate | Date, pattern = "d 'de' MMMM"): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: es });
}

export function formatDateShort(date: ISODate | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd/MM/yy');
}

export function formatMonthLabel(month: string): string {
  return format(parseISO(`${month}-01`), 'MMM yy', { locale: es }).replace('.', '');
}

/** "Hoy" / "Ayer" / "12 de agosto" — dates read better than timestamps. */
export function humanDate(date: ISODate): string {
  const t = today();
  if (date === t) return 'Hoy';
  if (date === toISO(subDays(new Date(), 1))) return 'Ayer';
  if (date === toISO(addDays(new Date(), 1))) return 'Mañana';
  return formatDate(date);
}

export interface DateRange {
  from: ISODate;
  to: ISODate;
  label: string;
}

export function monthRange(reference: Date = new Date(), offset = 0): DateRange {
  const base = addMonths(reference, offset);
  return {
    from: toISO(startOfMonth(base)),
    to: toISO(endOfMonth(base)),
    label: format(base, 'MMMM yyyy', { locale: es }),
  };
}

export function weekRange(reference: Date = new Date(), offset = 0): DateRange {
  const base = addDays(reference, offset * 7);
  return {
    from: toISO(startOfWeek(base, { weekStartsOn: 1 })),
    to: toISO(endOfWeek(base, { weekStartsOn: 1 })),
    label: 'Semana',
  };
}

export function lastNMonths(n: number, reference: Date = new Date()): DateRange {
  return {
    from: toISO(startOfMonth(subMonths(reference, n - 1))),
    to: toISO(endOfMonth(reference)),
    label: `Últimos ${n} meses`,
  };
}

export function previousRange(range: DateRange): DateRange {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const lengthDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  // Month-shaped ranges compare against the previous calendar month, not "30 days back".
  if (toISO(startOfMonth(from)) === range.from && toISO(endOfMonth(to)) === range.to) {
    const prev = subMonths(from, 1);
    return {
      from: toISO(startOfMonth(prev)),
      to: toISO(endOfMonth(prev)),
      label: format(prev, 'MMMM yyyy', { locale: es }),
    };
  }
  return {
    from: toISO(subDays(from, lengthDays)),
    to: toISO(subDays(to, lengthDays)),
    label: 'Período anterior',
  };
}

export function monthsBetween(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let cursor = startOfMonth(parseISO(from));
  const end = startOfMonth(parseISO(to));
  while (cursor <= end) {
    out.push(format(cursor, 'yyyy-MM'));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export function daysBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cursor = parseISO(from);
  const end = parseISO(to);
  while (cursor <= end) {
    out.push(toISO(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function monthsUntil(target: ISODate): number {
  return Math.max(0, differenceInCalendarMonths(parseISO(target), new Date()));
}

export function isWeekend(date: ISODate): boolean {
  const d = parseISO(date).getDay();
  return d === 0 || d === 6;
}

export { addDays, addMonths, subDays, subMonths, startOfMonth, endOfMonth };
