import * as React from 'react';
import { Camera, ImagePlus, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { env } from '@/config/env';
import { useReceiptPipeline } from '@/hooks/use-receipt';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorNote } from './error-note';
import { ReceiptReview } from './receipt-review';
import type { Transaction } from '@/types/transaction';

const STEP_ORDER = ['uploading', 'reading', 'parsing', 'categorizing'] as const;

/** Drag, paste, pick a file or take a photo — all four land in the same pipeline. */
export function ReceiptUploader({ onSaved }: { onSaved?: (transactions: Transaction[]) => void }) {
  const pipeline = useReceiptPipeline();
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const busy = STEP_ORDER.includes(pipeline.step as (typeof STEP_ORDER)[number]);

  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) void pipeline.process(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pipeline]);

  if (pipeline.draft) {
    return (
      <ReceiptReview
        draft={pipeline.draft}
        saving={pipeline.step === 'saving'}
        onChange={pipeline.setDraft}
        onCancel={pipeline.reset}
        onConfirm={async (options) => {
          const created = await pipeline.confirm(options);
          if (created) onSaved?.(created);
        }}
        error={pipeline.error}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void pipeline.process(file);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-3 border-dashed p-8 text-center transition-colors',
          dragging && 'border-primary bg-accent/50',
        )}
      >
        {busy ? (
          <div className="w-full max-w-xs space-y-3">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">{pipeline.stepLabel}</p>
            <ol className="space-y-1 text-left text-xs text-muted-foreground">
              {STEP_ORDER.map((stage, index) => {
                const currentIndex = STEP_ORDER.indexOf(pipeline.step as (typeof STEP_ORDER)[number]);
                const done = currentIndex > index;
                return (
                  <li key={stage} className={cn('flex items-center gap-2', done && 'text-success')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', done ? 'bg-success' : currentIndex === index ? 'bg-primary' : 'bg-border')} />
                    {LABELS[stage]}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <ImagePlus className="h-6 w-6 text-accent-foreground" />
            </span>
            <div>
              <p className="text-sm font-medium">Subí la foto del ticket</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Arrastrala acá, pegala con Ctrl+V o elegí un archivo. JPG, PNG o WEBP de hasta {env.maxReceiptSizeMb} MB.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Elegir archivo
              </Button>
              <Button size="sm" variant="outline" onClick={() => cameraRef.current?.click()}>
                <Camera className="h-4 w-4" />
                Sacar foto
              </Button>
            </div>
            {env.ocrProvider === 'mock' ? (
              <Badge variant="warning">Modo demo · OCR simulado</Badge>
            ) : null}
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pipeline.process(file);
            event.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pipeline.process(file);
            event.target.value = '';
          }}
        />
      </Card>

      {pipeline.error ? <ErrorNote error={pipeline.error} /> : null}
    </div>
  );
}

const LABELS: Record<(typeof STEP_ORDER)[number], string> = {
  uploading: 'Preparando la imagen',
  reading: 'Leyendo el texto',
  parsing: 'Detectando importes y comercio',
  categorizing: 'Clasificando productos',
};
