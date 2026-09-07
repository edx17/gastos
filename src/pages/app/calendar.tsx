import * as React from 'react';
import { addMonths, getDay, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { formatDate, monthRange } from '@/lib/date';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TransactionRow } from '@/components/finance/transaction-row';
import { ErrorNote } from '@/components/finance/error-note';

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

export default function CalendarPage() {
  const { client, userId, profile, categories, history, revision } = useWorkspace();
  const currency = profile.base_currency;
  const [offset, setOffset] = React.useState(0);
  const range = React.useMemo(() => monthRange(new Date(), offset), [offset]);

  const days = useAsync(() => client.getCalendar(userId, range), [userId, range.from, range.to, revision]);
  const [selected, setSelected] = React.useState<string | null>(null);

  const max = Math.max(1, ...(days.data ?? []).map((day) => day.expense));
  const monthStart = startOfMonth(addMonths(new Date(), offset));
  // Monday-first grid.
  const leading = (getDay(monthStart) + 6) % 7;
  const total = (days.data ?? []).reduce((acc, day) => acc + day.expense, 0);

  const selectedRows = selected ? history.filter((t) => t.transaction_date === selected) : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">
            Cuanto más intenso el color, más gastaste ese día. Total del mes: {formatMoney(total, { currency })}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setOffset((value) => value - 1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-center text-sm font-medium capitalize">{range.label}</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setOffset((value) => Math.min(0, value + 1))}
            disabled={offset >= 0}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {days.error ? <ErrorNote error={days.error} onRetry={days.reload} /> : null}

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          {days.loading && !days.data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leading }).map((_, index) => (
                <span key={`pad-${index}`} />
              ))}
              {(days.data ?? []).map((day) => {
                const intensity = day.expense / max;
                const dayNumber = Number(day.date.slice(-2));
                return (
                  <button
                    key={day.date}
                    onClick={() => setSelected(day.date === selected ? null : day.date)}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-all',
                      selected === day.date ? 'border-primary ring-2 ring-ring' : 'border-transparent',
                      day.expense === 0 && 'bg-muted/40 text-muted-foreground',
                    )}
                    style={
                      day.expense > 0
                        ? { backgroundColor: `hsl(var(--primary) / ${0.12 + intensity * 0.6})`, color: intensity > 0.55 ? 'white' : undefined }
                        : undefined
                    }
                    title={`${formatDate(day.date)} · ${formatMoney(day.expense, { currency })}`}
                  >
                    <span className="font-medium">{dayNumber}</span>
                    {day.expense > 0 ? (
                      <span className="num text-[10px] opacity-90">
                        {formatMoney(day.expense, { currency, decimals: 0 }).replace(/\s/g, '')}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">{formatDate(selected, "EEEE d 'de' MMMM")}</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            {selectedRows.length ? (
              selectedRows.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} categories={categories} />
              ))
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No hay movimientos ese día.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
