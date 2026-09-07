import * as React from 'react';
import { Receipt as ReceiptIcon, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { env } from '@/config/env';
import { OCR_PROVIDER_LABELS } from '@/services/ocr';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import type { Receipt } from '@/types/receipt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { ReceiptUploader } from '@/components/finance/receipt-uploader';
import { ErrorNote } from '@/components/finance/error-note';

export default function ReceiptsPage() {
  const { client, userId, revision, bumpRevision } = useWorkspace();
  const toast = useToast();
  const receipts = useAsync(() => client.listReceipts(userId), [userId, revision]);
  const [preview, setPreview] = React.useState<{ receipt: Receipt; url: string | null } | null>(null);
  const [deleting, setDeleting] = React.useState<Receipt | null>(null);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
        <p className="text-sm text-muted-foreground">
          Sacá la foto y {env.ocrProvider === 'mock' ? 'el modo demo' : OCR_PROVIDER_LABELS[env.ocrProvider]} extrae comercio,
          fecha, productos e importes.
        </p>
      </header>

      <ReceiptUploader
        onSaved={() => {
          bumpRevision();
          receipts.reload();
          toast.success('Ticket registrado');
        }}
      />

      {receipts.error ? <ErrorNote error={receipts.error} onRetry={receipts.reload} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Tickets guardados</CardTitle>
        </CardHeader>
        <CardContent>
          {receipts.data?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {receipts.data.map((receipt) => (
                <div key={receipt.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{receipt.merchant_name ?? 'Ticket'}</p>
                      <p className="text-xs text-muted-foreground">
                        {receipt.receipt_date ? formatDate(receipt.receipt_date) : 'Sin fecha'}
                        {receipt.receipt_number ? ` · ${receipt.receipt_number}` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="Eliminar ticket" onClick={() => setDeleting(receipt)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="num mt-2 text-lg font-semibold">
                    {receipt.total !== null ? formatMoney(receipt.total, { currency: receipt.currency }) : '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {receipt.transaction_id ? (
                      <Badge variant="success">Asociado a un gasto</Badge>
                    ) : (
                      <Badge variant="outline">Sin asociar</Badge>
                    )}
                    {receipt.ocr_provider === 'mock' ? <Badge variant="warning">OCR demo</Badge> : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={async () => {
                      const url = receipt.storage_path ? await client.getReceiptImageUrl(receipt.storage_path) : null;
                      setPreview({ receipt, url });
                    }}
                  >
                    Ver detalle
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ReceiptIcon}
              title="Todavía no subiste tickets"
              description="Con una foto alcanza: detecto comercio, fecha, productos y total."
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.receipt.merchant_name ?? 'Ticket'}
        size="lg"
      >
        {preview ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {preview.url ? (
              <img src={preview.url} alt="Ticket" className="max-h-[60vh] w-full rounded-lg border border-border object-contain" />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                La imagen ya no está disponible.
              </div>
            )}
            <div className="space-y-2 text-sm">
              <Row label="Fecha" value={preview.receipt.receipt_date ?? '—'} />
              <Row label="CUIT" value={preview.receipt.merchant_tax_id ?? '—'} />
              <Row label="Número" value={preview.receipt.receipt_number ?? '—'} />
              <Row
                label="Subtotal"
                value={preview.receipt.subtotal !== null ? formatMoney(preview.receipt.subtotal, { currency: preview.receipt.currency }) : '—'}
              />
              <Row
                label="Descuento"
                value={preview.receipt.discount ? formatMoney(preview.receipt.discount, { currency: preview.receipt.currency }) : '—'}
              />
              <Row
                label="Impuestos"
                value={preview.receipt.tax ? formatMoney(preview.receipt.tax, { currency: preview.receipt.currency }) : '—'}
              />
              <Row
                label="Total"
                value={preview.receipt.total !== null ? formatMoney(preview.receipt.total, { currency: preview.receipt.currency }) : '—'}
              />
              <Row label="Proveedor OCR" value={preview.receipt.ocr_provider} />
              {preview.receipt.parsed_data?.items.length ? (
                <div className="pt-2">
                  <p className="mb-1 font-medium">Productos</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {preview.receipt.parsed_data.items.map((item, index) => (
                      <li key={index} className="flex justify-between gap-2">
                        <span className="truncate">
                          {item.quantity > 1 ? `${item.quantity} × ` : ''}
                          {item.description}
                        </span>
                        <span className="num">{formatMoney(item.total, { currency: preview.receipt.currency })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Eliminar ticket"
        message="Se borra la imagen y los datos extraídos. El movimiento asociado no se elimina."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await client.deleteReceipt(deleting.id);
          toast.success('Ticket eliminado');
          bumpRevision();
          receipts.reload();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}
