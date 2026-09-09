import { Coins } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { currencyNoun } from '@/services/nlp/exchange';
import type { CurrencyCode } from '@/types/currency';
import type { CurrencyHolding } from '@/types/report';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Lo que la persona tiene en moneda extranjera.
 *
 * Muestra tres cosas y ninguna más: cuánto tiene, cuánto puso para juntarlo y
 * cuánto vale hoy. La diferencia entre lo segundo y lo tercero es la única
 * pregunta que importa: ¿ganó o perdió comprando?
 */
export function HoldingsCard({
  holdings,
  rates,
  baseCurrency,
}: {
  holdings: CurrencyHolding[];
  rates: Record<string, number>;
  baseCurrency: CurrencyCode;
}) {
  if (!holdings.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          Lo que tenés en otra moneda
        </CardTitle>
        <CardDescription>Comprar no es gastar: esto no entra en tus gastos del mes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {holdings.map((holding) => {
          const rate = rates[holding.currency] ?? null;
          const worth = rate === null ? null : holding.amount * rate;
          // Sin cotización cargada no hay con qué comparar, y no se inventa.
          const delta = worth === null ? null : worth - holding.invested;

          return (
            <div key={holding.currency} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="num text-2xl font-semibold tracking-tight">
                  {formatMoney(holding.amount, { currency: holding.currency })}
                </span>
                {worth !== null ? (
                  <span className="num text-sm text-muted-foreground">
                    hoy valen {formatMoney(worth, { currency: baseCurrency })}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Pusiste {formatMoney(holding.invested, { currency: baseCurrency })} en {currencyNoun(holding.currency)}
                {holding.avg_rate ? ` · compraste a ${formatMoney(holding.avg_rate, { currency: baseCurrency })} en promedio` : ''}
              </p>

              {delta !== null && Math.abs(delta) >= 1 ? (
                <p className={delta >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>
                  {delta >= 0 ? 'Ganaste ' : 'Perdiste '}
                  {formatMoney(Math.abs(delta), { currency: baseCurrency })} contra lo que pusiste.
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
