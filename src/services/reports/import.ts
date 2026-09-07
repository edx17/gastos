import { parseAmountInput } from '@/lib/money';
import { parseUserDate } from '@/services/nlp/dates';
import { normalizeText } from '@/lib/utils';
import type { CategoryTree } from '@/types/category';
import type { PaymentMethod, Transaction, TransactionInput } from '@/types/transaction';

export type CsvColumn = 'date' | 'description' | 'amount' | 'currency' | 'category' | 'payment_method' | 'merchant' | 'ignore';

export interface CsvPreviewRow {
  raw: string[];
  input: TransactionInput | null;
  problems: string[];
  duplicateOf?: string;
}

/** Splits a CSV honouring quotes and both `,` and `;` separators. */
export function parseCsv(text: string): string[][] {
  const separator = (text.split('\n')[0]?.match(/;/g)?.length ?? 0) > (text.split('\n')[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** Guesses what each column is from its header, so mapping usually needs no edits. */
export function guessColumns(header: string[]): CsvColumn[] {
  return header.map((raw) => {
    const name = normalizeText(raw);
    if (/fecha|date/.test(name)) return 'date';
    if (/descripcion|concepto|detalle|description/.test(name)) return 'description';
    if (/importe|monto|amount|valor/.test(name)) return 'amount';
    if (/moneda|currency/.test(name)) return 'currency';
    if (/categoria|category|rubro/.test(name)) return 'category';
    if (/medio|pago|payment|metodo/.test(name)) return 'payment_method';
    if (/comercio|merchant|negocio/.test(name)) return 'merchant';
    return 'ignore';
  });
}

export function buildPreview(
  rows: string[][],
  mapping: CsvColumn[],
  ctx: {
    categories: CategoryTree[];
    paymentMethods: PaymentMethod[];
    baseCurrency: string;
    existing: Transaction[];
  },
): CsvPreviewRow[] {
  return rows.map((raw) => {
    const problems: string[] = [];
    const get = (column: CsvColumn) => {
      const index = mapping.indexOf(column);
      return index === -1 ? '' : (raw[index] ?? '').trim();
    };

    const amount = parseAmountInput(get('amount'));
    const rawDate = get('date');
    const description = get('description') || get('merchant') || 'Movimiento importado';

    if (amount === null || amount === 0) problems.push('No pude leer el importe.');
    if (!rawDate) problems.push('Falta la fecha.');

    const date = rawDate ? parseUserDate(rawDate) : '';
    const categoryName = normalizeText(get('category'));
    const category = ctx.categories.find((c) => normalizeText(c.name) === categoryName);
    const subcategory = category
      ? undefined
      : ctx.categories.flatMap((c) => c.subcategories.map((s) => ({ c, s }))).find((entry) => normalizeText(entry.s.name) === categoryName);
    const methodName = normalizeText(get('payment_method'));
    const method = ctx.paymentMethods.find((m) => normalizeText(m.name) === methodName);

    const input: TransactionInput | null =
      amount === null || !date
        ? null
        : {
            type: amount < 0 ? 'expense' : 'income',
            amount: Math.abs(amount),
            currency: get('currency') || ctx.baseCurrency,
            description,
            transaction_date: date,
            merchant_name: get('merchant') || null,
            category_id: category?.id ?? subcategory?.c.id ?? null,
            subcategory_id: subcategory?.s.id ?? null,
            payment_method_id: method?.id ?? null,
            source: 'import',
          };

    const duplicate = input
      ? ctx.existing.find(
          (row) =>
            row.transaction_date === input.transaction_date &&
            Math.abs(row.amount - input.amount) < 0.01 &&
            normalizeText(row.description) === normalizeText(input.description),
        )
      : undefined;

    return { raw, input, problems, duplicateOf: duplicate?.id };
  });
}
