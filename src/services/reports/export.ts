import type { CategoryTree } from '@/types/category';
import type { Transaction } from '@/types/transaction';

const HEADERS = [
  'fecha',
  'tipo',
  'descripcion',
  'comercio',
  'categoria',
  'subcategoria',
  'importe',
  'moneda',
  'importe_base',
  'moneda_base',
  'tipo_cambio',
  'origen',
];

function escape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function transactionsToCsv(rows: Transaction[], categories: CategoryTree[]): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    const category = categories.find((c) => c.id === row.category_id);
    const subcategory = category?.subcategories.find((s) => s.id === row.subcategory_id);
    lines.push(
      [
        row.transaction_date,
        row.type,
        row.description,
        row.merchant_name ?? '',
        category?.name ?? '',
        subcategory?.name ?? '',
        row.amount,
        row.currency,
        row.base_amount,
        row.base_currency,
        row.exchange_rate,
        row.source,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n');
}

export function exportTransactionsCsv(rows: Transaction[], categories: CategoryTree[], filename = 'movimientos.csv') {
  const csv = transactionsToCsv(rows, categories);
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
