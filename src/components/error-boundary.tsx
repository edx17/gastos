import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

/** Last line of defence: a readable message instead of a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Never log financial data — only the technical failure.
    console.error('[crocante] error de interfaz:', error.message);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-warning" />
        <div>
          <p className="text-xl font-semibold">Algo se rompió en esta pantalla</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            No perdiste ningún dato. Recargá la página y, si vuelve a pasar, contanos qué estabas haciendo en{' '}
            {brand.supportEmail}.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Detalle técnico: {this.state.error.message}</p>
        </div>
        <Button onClick={() => window.location.reload()}>Recargar</Button>
      </div>
    );
  }
}
