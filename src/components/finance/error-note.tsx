import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { AppError } from '@/types/common';
import { Button } from '@/components/ui/button';

/** Errors are always explained in plain Spanish, with a way forward. */
export function ErrorNote({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{error.message}</p>
        {error.hint ? <p className="mt-1 text-sm text-muted-foreground">{error.hint}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
