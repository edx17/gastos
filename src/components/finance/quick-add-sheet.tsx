import * as React from 'react';
import { useWorkspace } from '@/providers/workspace-provider';
import { useToast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';
import { Tabs } from '@/components/ui/tabs';
import { NaturalLanguageInput } from './natural-language-input';
import { TransactionForm } from './transaction-form';
import { ReceiptUploader } from './receipt-uploader';

type Mode = 'natural' | 'manual' | 'receipt';

/** One entry point, three ways in: talk to it, fill a form, or photograph a ticket. */
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = React.useState<Mode>('natural');
  const { client, userId, refreshHistory, bumpRevision } = useWorkspace();
  const toast = useToast();
  const [saving, setSaving] = React.useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Agregar movimiento"
      description="Contalo con tus palabras, cargalo a mano o subí el ticket."
      size="lg"
    >
      <Tabs
        value={mode}
        onChange={setMode}
        className="mb-4"
        items={[
          { value: 'natural', label: 'Escribir' },
          { value: 'manual', label: 'A mano' },
          { value: 'receipt', label: 'Ticket' },
        ]}
      />

      {mode === 'natural' ? <NaturalLanguageInput autoFocus onSaved={onClose} /> : null}

      {mode === 'manual' ? (
        <TransactionForm
          saving={saving}
          onCancel={onClose}
          onSubmit={async (input) => {
            setSaving(true);
            try {
              await client.createTransaction(userId, input);
              await refreshHistory();
              bumpRevision();
              toast.success('Movimiento guardado', input.description);
              onClose();
            } catch (error) {
              toast.error(
                'No pude guardar el movimiento',
                error instanceof Error ? error.message : 'Revisá los datos e intentá de nuevo.',
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      {mode === 'receipt' ? (
        <ReceiptUploader
          onSaved={(created) => {
            toast.success(
              created.length > 1 ? `${created.length} movimientos guardados` : 'Ticket guardado',
              'Ya lo vas a ver reflejado en el dashboard.',
            );
            onClose();
          }}
        />
      ) : null}
    </Dialog>
  );
}
