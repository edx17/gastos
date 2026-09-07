import * as React from 'react';
import { Loader2, MessagesSquare, Send, Sparkles } from 'lucide-react';
import { answerFinanceQuestion, suggestedQuestions } from '@/services/analytics/query';
import { getAiProvider } from '@/services/ai';
import { uid } from '@/lib/utils';
import { useWorkspace } from '@/providers/workspace-provider';
import type { AiQueryAnswer } from '@/types/ai';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryPieChart, HorizontalBarChart } from '@/components/finance/charts';

interface Entry extends AiQueryAnswer {
  id: string;
  narration?: string;
}

/**
 * "Preguntale a tus finanzas". The numbers are computed locally from the user's
 * own rows; the model, when configured, only rewrites the sentence around them.
 */
export default function AskPage() {
  const { client, userId, history, categories, profile } = useWorkspace();
  const [question, setQuestion] = React.useState('');
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const ask = async (value: string) => {
    const text = value.trim();
    if (!text) return;
    setLoading(true);
    setQuestion('');

    const answer = answerFinanceQuestion(text, {
      transactions: history,
      categories,
      currency: profile.base_currency,
    });
    const entry: Entry = { ...answer, id: uid() };
    setEntries((current) => [entry, ...current]);

    const provider = getAiProvider(profile.ai.provider_override);
    if (!provider.isMock && profile.ai.share_data_with_ai) {
      const started = performance.now();
      try {
        const narration = await provider.narrate({
          question: text,
          tone: 'answer',
          facts: [
            { label: 'Respuesta calculada', value: answer.answer },
            ...answer.metrics.map((metric) => ({ label: metric.label, value: metric.value })),
          ],
        });
        setEntries((current) => current.map((item) => (item.id === entry.id ? { ...item, narration } : item)));
        void client.logAiInteraction(userId, {
          kind: 'query',
          provider: provider.id,
          model: provider.model,
          input: text,
          output: narration,
          confidence: null,
          latency_ms: Math.round(performance.now() - started),
          success: true,
        });
      } catch {
        // The computed answer already stands on its own.
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Preguntale a tus finanzas</h1>
        <p className="text-sm text-muted-foreground">
          Preguntá en castellano. Las cifras salen de tus movimientos, no de una estimación del modelo.
        </p>
      </header>

      <Card>
        <form
          className="flex items-center gap-2 p-2 pl-4"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <MessagesSquare className="h-4 w-4 shrink-0 text-primary" />
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="¿Cuánto gasté en comida este mes?"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Pregunta sobre tus finanzas"
          />
          <Button type="submit" size="icon" disabled={!question.trim() || loading} aria-label="Preguntar">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {suggestedQuestions().map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => void ask(suggestion)}
            className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">{entry.question}</p>
              <p className="text-base font-medium">{entry.answer}</p>
              {entry.narration ? (
                <p className="flex items-start gap-2 rounded-lg bg-accent/40 p-3 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {entry.narration}
                </p>
              ) : null}

              {entry.metrics.length ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {entry.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">{metric.label}</p>
                      <p className="num text-lg font-semibold">{metric.value}</p>
                      {metric.hint ? <p className="text-xs text-muted-foreground">{metric.hint}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {entry.chart?.data.length ? (
                <div className="pt-2">
                  {entry.chart.kind === 'pie' ? (
                    <CategoryPieChart
                      currency={profile.base_currency}
                      data={entry.chart.data.map((point, index) => ({
                        category_id: null,
                        category_name: point.label,
                        color: `hsl(${(index * 47) % 360} 55% 45%)`,
                        amount: point.value,
                        ratio: 0,
                        transaction_count: 0,
                      }))}
                    />
                  ) : (
                    <HorizontalBarChart data={entry.chart.data} currency={profile.base_currency} height={200} />
                  )}
                </div>
              ) : null}

              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{entry.used.transactions} movimientos</Badge>
                <span>
                  {entry.used.from} → {entry.used.to}
                </span>
                {entry.used.filters.map((filter) => (
                  <Badge key={filter} variant="secondary">
                    {filter}
                  </Badge>
                ))}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
