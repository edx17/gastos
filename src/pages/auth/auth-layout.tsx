import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';
import { isDemoBackend } from '@/services/data';
import { Logo } from '@/components/layout/logo';
import { Badge } from '@/components/ui/badge';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/">
            <Logo />
          </Link>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {isDemoBackend() ? (
            <Badge variant="warning" className="mt-4">
              Modo demo · los datos quedan en este navegador
            </Badge>
          ) : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-center px-12 text-primary-foreground">
          <p className="text-3xl font-semibold leading-tight">{brand.tagline}</p>
          <div className="mt-8 space-y-3 text-sm text-primary-foreground/85">
            <Example text="super 45 lucas" result="Alimentación › Supermercado · $45.000" />
            <Example text="ayer cargué nafta 35 mil" result="Transporte › Combustible · ayer" />
            <Example text="cobré 1.500.000" result="Ingreso › Sueldo · $1.500.000" />
            <Example text="📷 foto del ticket" result="12 productos · $84.500 · repartido por categoría" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Example({ text, result }: { text: string; result: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
      <p className="font-medium">«{text}»</p>
      <p className="text-primary-foreground/75">→ {result}</p>
    </div>
  );
}
