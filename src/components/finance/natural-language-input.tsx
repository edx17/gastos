import * as React from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuickEntry } from '@/hooks/use-quick-entry';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DraftCard } from './draft-card';
import { ErrorNote } from './error-note';
import type { Transaction } from '@/types/transaction';

const EXAMPLES = [
  'super 45 lucas',
  'nafta 25k',
  'ayer cené 18.500',
  'Netflix 9.500',
  'cobré 1.200.000',
  'compré zapatillas por 120 dólares',
  'pagué el alquiler 450k',
];

/**
 * "¿Qué gastaste?" — the fastest path into the app. One sentence, one confirmation.
 */
export function NaturalLanguageInput({
  onSaved,
  autoFocus,
  className,
}: {
  onSaved?: (transaction: Transaction) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = React.useState('');
  const { draft, step, stepLabel, analyze, save, reset, saving, error } = useQuickEntry();
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const busy = step !== 'idle' && step !== 'done';

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    await analyze(value);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <Card className="overflow-hidden">
        <form onSubmit={submit} className="flex items-center gap-2 p-2 pl-4">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="¿Qué gastaste? Ej: «hoy gasté 8500 en combustible»"
            aria-label="Registrar un movimiento en lenguaje natural"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!text.trim() || busy} aria-label="Interpretar">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        {busy ? (
          <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {stepLabel}
          </div>
        ) : null}
      </Card>

      {!draft && !busy ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setText(example);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorNote error={error} onRetry={() => void submit()} /> : null}

      {draft ? (
        <DraftCard
          draft={draft}
          saving={saving}
          onCancel={() => {
            reset();
            setText('');
          }}
          onSave={async (input, options) => {
            try {
              const transaction = await save(input, options);
              setText('');
              toast.success('Movimiento guardado', `${input.description} · ${input.transaction_date}`);
              onSaved?.(transaction);
            } catch (caught) {
              toast.error(
                'No pude guardar el movimiento',
                caught instanceof Error ? caught.message : 'Revisá los datos e intentá otra vez.',
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}
