import * as React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { buildPreview, guessColumns, parseCsv, type CsvColumn, type CsvPreviewRow } from '@/services/reports/import';
import { useWorkspace } from '@/providers/workspace-provider';
import { useToast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, Switch } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const COLUMN_LABELS: Record<CsvColumn, string> = {
  date: 'Fecha',
  description: 'Descripción',
  amount: 'Importe',
  currency: 'Moneda',
  category: 'Categoría',
  payment_method: 'Medio de pago',
  merchant: 'Comercio',
  ignore: 'Ignorar',
};

/** CSV import with column mapping, a preview and duplicate detection before writing. */
export function ImportCsvDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const { client, userId, categories, paymentMethods, profile, history } = useWorkspace();
  const toast = useToast();
  const [rows, setRows] = React.useState<string[][]>([]);
  const [header, setHeader] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<CsvColumn[]>([]);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [importing, setImporting] = React.useState(false);

  const preview: CsvPreviewRow[] = React.useMemo(
    () =>
      rows.length
        ? buildPreview(rows, mapping, {
            categories,
            paymentMethods,
            baseCurrency: profile.base_currency,
            existing: history,
          })
        : [],
    [rows, mapping, categories, paymentMethods, profile.base_currency, history],
  );

  const importable = preview.filter((row) => row.input && (!skipDuplicates || !row.duplicateOf));
  const duplicates = preview.filter((row) => row.duplicateOf).length;
  const invalid = preview.filter((row) => !row.input).length;

  const reset = () => {
    setRows([]);
    setHeader([]);
    setMapping([]);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Importar movimientos desde CSV"
      description="Mapeá las columnas, revisá la vista previa y recién ahí se guarda."
      size="lg"
    >
      {!rows.length ? (
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">Elegí un archivo .csv</span>
          <span className="text-xs text-muted-foreground">
            Columnas esperadas: fecha, descripción, importe, moneda, categoría, medio de pago.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const parsed = parseCsv(text);
              if (parsed.length < 2) {
                toast.error('El archivo no tiene filas para importar');
                return;
              }
              setHeader(parsed[0]);
              setRows(parsed.slice(1));
              setMapping(guessColumns(parsed[0]));
            }}
          />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {header.map((name, index) => (
              <div key={`${name}-${index}`} className="space-y-1">
                <p className="truncate text-xs text-muted-foreground">Columna «{name || index + 1}»</p>
                <Select
                  value={mapping[index] ?? 'ignore'}
                  onChange={(event) =>
                    setMapping((current) =>
                      current.map((value, i) => (i === index ? (event.target.value as CsvColumn) : value)),
                    )
                  }
                >
                  {Object.entries(COLUMN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">{importable.length} listos</Badge>
            {duplicates ? <Badge variant="warning">{duplicates} duplicados</Badge> : null}
            {invalid ? <Badge variant="destructive">{invalid} con problemas</Badge> : null}
            <span className="ml-auto flex items-center gap-2">
              Omitir duplicados
              <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
            </span>
          </div>

          <div className="max-h-64 overflow-auto rounded-lg border border-border scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Descripción</th>
                  <th className="p-2 text-right">Importe</th>
                  <th className="p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((row, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="p-2">{row.input?.transaction_date ?? '—'}</td>
                    <td className="max-w-[220px] truncate p-2">{row.input?.description ?? row.raw.join(' ')}</td>
                    <td className="num p-2 text-right">{row.input?.amount ?? '—'}</td>
                    <td className="p-2 text-xs">
                      {row.problems.length ? (
                        <span className="text-destructive">{row.problems.join(' ')}</span>
                      ) : row.duplicateOf ? (
                        <span className="text-warning">Ya existe</span>
                      ) : (
                        <span className="text-success">Listo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              Elegir otro archivo
            </Button>
            <Button
              loading={importing}
              disabled={!importable.length}
              onClick={async () => {
                setImporting(true);
                try {
                  await client.createTransactions(
                    userId,
                    importable.map((row) => row.input!),
                  );
                  toast.success(`Importé ${importable.length} movimientos`);
                  reset();
                  onClose();
                  await onImported();
                } catch (error) {
                  toast.error('No pude importar', error instanceof Error ? error.message : undefined);
                } finally {
                  setImporting(false);
                }
              }}
            >
              Importar {importable.length}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
