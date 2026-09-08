import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getDataClient } from '@/services/data';
import { useAuth } from '@/providers/auth-provider';
import { toAppError } from '@/hooks/use-async';
import type { AppError } from '@/types/common';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ErrorNote } from '@/components/finance/error-note';
import { AuthLayout } from './auth-layout';

/**
 * Destino del enlace que llega por mail para recuperar la contraseña.
 *
 * Supabase deja la sesión de recuperación abierta al abrir el enlace, así que acá
 * sólo hace falta elegir la contraseña nueva. Si el enlace venció, se dice y se
 * ofrece pedir otro en vez de dejar a la persona mirando un formulario que no anda.
 */
export default function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [error, setError] = React.useState<AppError | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = repeat.length > 0 && password !== repeat;
  const valid = password.length >= 8 && password === repeat;

  if (done) {
    return (
      <AuthLayout title="Contraseña actualizada" subtitle="Ya podés entrar con la nueva.">
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-md bg-success/10 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            Listo. Guardamos tu contraseña nueva.
          </p>
          <Button className="w-full" onClick={() => navigate('/app/dashboard')}>
            Ir a mis finanzas
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (!loading && !user) {
    return (
      <AuthLayout
        title="El enlace ya no sirve"
        subtitle="Los enlaces de recuperación duran poco tiempo por seguridad."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Puede que el enlace haya vencido o que ya lo hayas usado. Pedí uno nuevo y
            revisá el correo más reciente.
          </p>
          <Button className="w-full" onClick={() => navigate('/forgot-password')}>
            Pedir otro enlace
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Elegí una contraseña nueva" subtitle="Con esto volvés a entrar a tu cuenta.">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setSaving(true);
          setError(null);
          try {
            await getDataClient().updatePassword(password);
            setDone(true);
          } catch (caught) {
            setError(toAppError(caught));
          } finally {
            setSaving(false);
          }
        }}
      >
        {error ? <ErrorNote error={error} /> : null}

        <div className="space-y-1.5">
          <Label htmlFor="new-password">Contraseña nueva</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className={`text-xs ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
            Mínimo 8 caracteres.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="repeat-password">Repetila</Label>
          <Input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
          {mismatch ? <p className="text-xs text-destructive">Las dos contraseñas tienen que coincidir.</p> : null}
        </div>

        <Button type="submit" className="w-full" disabled={!valid} loading={saving}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}
