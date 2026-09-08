import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { getDataClient } from '@/services/data';
import { toAppError } from '@/hooks/use-async';
import { Button } from '@/components/ui/button';
import { Input, Label, Switch } from '@/components/ui/input';
import { ErrorNote } from '@/components/finance/error-note';
import type { AppError } from '@/types/common';
import { AuthLayout } from './auth-layout';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [withSampleData, setWithSampleData] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<AppError | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError({ code: 'auth/weak-password', message: 'La contraseña necesita al menos 8 caracteres.' });
      return;
    }
    if (!accepted) {
      setError({
        code: 'auth/terms-required',
        message: 'Necesitamos que aceptes los términos y la política de privacidad para crear la cuenta.',
      });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signUp(email, password, name);
      if (withSampleData) {
        const client = getDataClient();
        const user = await client.getCurrentUser();
        if (user) await client.seedDemoData?.(user.id);
      }
      navigate('/app/dashboard');
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Creá tu cuenta"
      subtitle="Registrá tu primer gasto en menos de diez segundos."
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Iniciá sesión
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <ErrorNote error={error} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Cómo te llamamos" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Cargar datos de ejemplo</p>
            <p className="text-xs text-muted-foreground">Para ver reportes con contenido desde el primer día.</p>
          </div>
          <Switch checked={withSampleData} onCheckedChange={setWithSampleData} />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span className="text-muted-foreground">
            Leí y acepto los{' '}
            <Link className="text-primary hover:underline" to="/terminos" target="_blank">
              términos y condiciones
            </Link>{' '}
            y la{' '}
            <Link className="text-primary hover:underline" to="/privacidad" target="_blank">
              política de privacidad
            </Link>
            .
          </span>
        </label>

        <Button type="submit" className="w-full" disabled={!accepted} loading={loading}>
          Crear cuenta
        </Button>
      </form>
    </AuthLayout>
  );
}
