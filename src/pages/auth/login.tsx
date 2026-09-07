import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDataClient, isDemoBackend } from '@/services/data';
import { useAuth } from '@/providers/auth-provider';
import { toAppError } from '@/hooks/use-async';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ErrorNote } from '@/components/finance/error-note';
import type { AppError } from '@/types/common';
import { AuthLayout } from './auth-layout';

const DEMO_EMAIL = 'demo@crocante.app';
const DEMO_PASSWORD = 'crocante-demo';

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<AppError | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate('/app/dashboard');
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setLoading(false);
    }
  };

  /** One click into a populated account, so the product can be judged on its behaviour. */
  const enterDemo = async () => {
    setLoading(true);
    setError(null);
    const client = getDataClient();
    try {
      let user;
      try {
        user = await client.signIn(DEMO_EMAIL, DEMO_PASSWORD);
      } catch {
        user = await client.signUp(DEMO_EMAIL, DEMO_PASSWORD, 'Demo');
        await client.seedDemoData?.(user.id);
      }
      await client.signIn(DEMO_EMAIL, DEMO_PASSWORD);
      navigate('/app/dashboard');
      window.location.reload();
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Entrá a tu cuenta"
      subtitle="Seguí ordenando tus finanzas donde las dejaste."
      footer={
        <>
          ¿Todavía no tenés cuenta?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Creá una gratis
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <ErrorNote error={error} /> : null}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vos@email.com"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
              ¿La olvidaste?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Entrar
        </Button>

        {!isDemoBackend() ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => void signInWithGoogle()}>
            Continuar con Google
          </Button>
        ) : null}

        <Button type="button" variant="ghost" className="w-full" onClick={enterDemo} disabled={loading}>
          Probar con datos de ejemplo
        </Button>
      </form>
    </AuthLayout>
  );
}
