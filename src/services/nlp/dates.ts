import { addDays, format, parse, subDays, subMonths, subWeeks } from 'date-fns';
import type { ISODate } from '@/types/common';

const ISO = 'yyyy-MM-dd';

export interface DateMatch {
  date: ISODate;
  explicit: boolean;
  start: number;
  end: number;
  matched: string;
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
  agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

/**
 * Finds a date reference inside already-normalized (lowercase, accent-free) text.
 * Returns the match position too, so the caller can strip it before reading the amount.
 */
export function findDate(text: string, today = new Date()): DateMatch | null {
  const matchers: ((t: string) => DateMatch | null)[] = [
    // Explicit numeric dates: 12/08, 12-08-2025, 12/8/25
    (t) => {
      const m = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t);
      if (!m) return null;
      const day = Number(m[1]);
      const month = Number(m[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) return null;
      let year = m[3] ? Number(m[3]) : today.getFullYear();
      if (year < 100) year += 2000;
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) return null;
      // A date without a year that lands in the future means last year.
      if (!m[3] && date > today) date.setFullYear(year - 1);
      return hit(date, m, t);
    },
    // "12 de agosto" / "5 de enero de 2024"
    (t) => {
      const m = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${Object.keys(MONTHS).join('|')})(?:\\s+de\\s+(\\d{4}))?\\b`).exec(t);
      if (!m) return null;
      const year = m[3] ? Number(m[3]) : today.getFullYear();
      const date = new Date(year, MONTHS[m[2]], Number(m[1]));
      if (!m[3] && date > today) date.setFullYear(year - 1);
      return hit(date, m, t);
    },
    (t) => {
      const m = /\b(anteayer|antes de ayer|antier)\b/.exec(t);
      return m ? hit(subDays(today, 2), m, t) : null;
    },
    (t) => {
      const m = /\bayer\b/.exec(t);
      return m ? hit(subDays(today, 1), m, t) : null;
    },
    (t) => {
      const m = /\bhoy\b/.exec(t);
      return m ? hit(today, m, t) : null;
    },
    (t) => {
      const m = /\b(hace)\s+(\d{1,3}|un|una|dos|tres)\s+(dias?|semanas?|meses|mes)\b/.exec(t);
      if (!m) return null;
      const words: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3 };
      const n = Number(m[2]) || words[m[2]] || 1;
      const unit = m[3];
      const date = unit.startsWith('dia') ? subDays(today, n) : unit.startsWith('semana') ? subWeeks(today, n) : subMonths(today, n);
      return hit(date, m, t);
    },
    (t) => {
      const m = /\b(la\s+)?semana\s+pasada\b/.exec(t);
      return m ? hit(subWeeks(today, 1), m, t) : null;
    },
    (t) => {
      const m = /\b(el\s+)?mes\s+pasado\b/.exec(t);
      return m ? hit(subMonths(today, 1), m, t) : null;
    },
    // "el viernes pasado" / "el lunes" → most recent past occurrence
    (t) => {
      const m = new RegExp(`\\b(?:el\\s+)?(${Object.keys(WEEKDAYS).join('|')})(\\s+pasado)?\\b`).exec(t);
      if (!m) return null;
      const target = WEEKDAYS[m[1]];
      // "el viernes" and "el viernes pasado" both mean the most recent one.
      let date = new Date(today);
      let guard = 0;
      do {
        date = subDays(date, 1);
        guard += 1;
      } while (date.getDay() !== target && guard < 8);
      return hit(date, m, t);
    },
  ];

  for (const matcher of matchers) {
    const found = matcher(text);
    if (found) return found;
  }
  return null;
}

function hit(date: Date, m: RegExpExecArray, _text: string): DateMatch {
  return {
    date: format(date, ISO),
    explicit: true,
    start: m.index,
    end: m.index + m[0].length,
    matched: m[0],
  };
}

/** Parses user-typed dates from forms: `12/08/2025`, `2025-08-12`. */
export function parseUserDate(input: string, fallback: Date = new Date()): ISODate {
  const patterns = ['yyyy-MM-dd', 'dd/MM/yyyy', 'dd/MM/yy', 'dd-MM-yyyy'];
  for (const pattern of patterns) {
    const parsed = parse(input.trim(), pattern, fallback);
    if (!Number.isNaN(parsed.getTime())) return format(parsed, ISO);
  }
  return format(fallback, ISO);
}

export { addDays, subDays };
