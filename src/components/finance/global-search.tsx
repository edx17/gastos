import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { humanDate } from '@/lib/date';
import { debounce, normalizeText } from '@/lib/utils';
import { useWorkspace } from '@/providers/workspace-provider';
import { answerFinanceQuestion } from '@/services/analytics/query';
import { parseAmountInput } from '@/lib/money';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Transaction } from '@/types/transaction';

/**
 * Global search. Plain text matches descriptions and merchants; phrases like
 * "más de 50 mil" or "gastos de agosto" are answered with real numbers.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { client, userId, history, categories, profile } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');
  const [rows, setRows] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(false);

  const search = React.useMemo(
    () =>
      debounce(async (value: string) => {
        if (value.trim().length < 2) {
          setRows([]);
          setLoading(false);
          return;
        }
        try {
          const found = await client.searchTransactions(userId, value.trim(), 12);
          setRows(found);
        } finally {
          setLoading(false);
        }
      }, 220),
    [client, userId],
  );

  React.useEffect(() => {
    setLoading(query.trim().length >= 2);
    search(query);
  }, [query, search]);

  const interpretation = React.useMemo(() => {
    const value = query.trim();
    if (value.length < 6) return null;
    const normalized = normalizeText(value);

    const overMatch = /(mas|más) de ([\d.,]+ ?(mil|lucas|k|palo)?)/.exec(normalized);
    if (overMatch) {
      const threshold = parseThreshold(overMatch[2]);
      if (threshold) {
        const matches = history.filter((t) => t.base_amount >= threshold && t.type === 'expense');
        const total = matches.reduce((acc, t) => acc + t.base_amount, 0);
        return {
          title: `${matches.length} gastos de más de ${formatMoney(threshold, { currency: profile.base_currency })}`,
          detail: `Suman ${formatMoney(total, { currency: profile.base_currency })}`,
          rows: matches.slice(0, 8),
        };
      }
    }

    if (/^(cuanto|donde|cuantos|que)/.test(normalized) || /gastos? de /.test(normalized)) {
      const answer = answerFinanceQuestion(value, {
        transactions: history,
        categories,
        currency: profile.base_currency,
      });
      return { title: answer.answer, detail: answer.used.filters.join(' · '), rows: [] };
    }
    return null;
  }, [query, history, categories, profile.base_currency]);

  return (
    <Dialog open={open} onClose={onClose} title="Buscar" size="md">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Probá con «YPF», «más de 50 mil» o «gastos de agosto»'
          className="pl-9"
        />
      </div>

      <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto scrollbar-thin">
        {interpretation ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium">{interpretation.title}</p>
            <p className="text-xs text-muted-foreground">{interpretation.detail}</p>
          </div>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
          </p>
        ) : null}

        {(interpretation?.rows.length ? interpretation.rows : rows).map((row) => (
          <button
            key={row.id}
            onClick={() => {
              onClose();
              navigate(`/app/transactions?focus=${row.id}`);
            }}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.description}</p>
              <p className="text-xs text-muted-foreground">
                {humanDate(row.transaction_date)}
                {row.merchant_name ? ` · ${row.merchant_name}` : ''}
              </p>
            </div>
            <span className="num shrink-0 text-sm font-semibold">
              {formatMoney(row.amount, { currency: row.currency })}
            </span>
          </button>
        ))}

        {!loading && !rows.length && !interpretation && query.trim().length >= 2 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No encontré movimientos con «{query}».
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function parseThreshold(raw: string): number | null {
  const normalized = raw.trim();
  const multiplier = /mil|lucas|k/.test(normalized) ? 1000 : /palo/.test(normalized) ? 1_000_000 : 1;
  const value = parseAmountInput(normalized.replace(/[a-z]/gi, ''));
  return value ? value * multiplier : null;
}
