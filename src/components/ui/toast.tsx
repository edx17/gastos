import * as React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn, uid } from '@/lib/utils';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = uid();
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      setTimeout(() => dismiss(id), input.variant === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: 'success' }),
      error: (title, description) => toast({ title, description, variant: 'error' }),
      info: (title, description) => toast({ title, description, variant: 'info' }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
              {toasts.map((item) => (
                <div
                  key={item.id}
                  role="status"
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card p-4 shadow-lg animate-slide-up',
                    item.variant === 'success' && 'border-success/30',
                    item.variant === 'error' && 'border-destructive/30',
                  )}
                >
                  {item.variant === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : item.variant === 'error' ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  ) : (
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    {item.action ? (
                      <button
                        className="mt-2 text-sm font-medium text-primary hover:underline"
                        onClick={() => {
                          item.action?.onClick();
                          dismiss(item.id);
                        }}
                      >
                        {item.action.label}
                      </button>
                    ) : null}
                  </div>
                  <button onClick={() => dismiss(item.id)} aria-label="Cerrar aviso">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast necesita estar dentro de <ToastProvider>.');
  return context;
}
