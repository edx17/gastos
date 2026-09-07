import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthLayout } from './auth-layout';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Te mandamos un enlace para elegir una nueva."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
          Si existe una cuenta con <strong>{email}</strong>, vas a recibir un correo con el enlace para restablecer la
          contraseña. Revisá también la carpeta de spam.
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            try {
              await requestPasswordReset(email);
              setSent(true);
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
