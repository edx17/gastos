import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { brand } from '@/config/brand';
import { legal, legalDataMissing } from '@/config/legal';
import { formatDate } from '@/lib/date';
import { Logo } from '@/components/layout/logo';
import { buttonVariants } from '@/components/ui/button';

/** Marco común de las páginas legales: se leen sin estar registrado. */
export function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/">
            <Logo />
          </Link>
          <Link to="/" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última actualización: {formatDate(legal.updatedAt)} · {brand.name}
        </p>

        {legalDataMissing() ? (
          <p className="mt-6 flex items-start gap-2 rounded-lg bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <span>
              Faltan completar los datos del responsable del servicio en{' '}
              <code className="rounded bg-muted px-1">src/config/legal.ts</code>. Hasta entonces, este
              texto no está listo para publicarse.
            </span>
          </p>
        ) : null}

        <div className="legal-prose mt-8 space-y-6 text-sm leading-relaxed">{children}</div>

        <footer className="mt-12 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <p>
            ¿Dudas? Escribinos a{' '}
            <a className="text-primary hover:underline" href={`mailto:${legal.contactEmail}`}>
              {legal.contactEmail}
            </a>
            .
          </p>
          <nav className="mt-3 flex flex-wrap gap-4">
            <Link className="hover:text-foreground" to="/terminos">
              Términos y condiciones
            </Link>
            <Link className="hover:text-foreground" to="/privacidad">
              Privacidad
            </Link>
            <Link className="hover:text-foreground" to="/arrepentimiento">
              Botón de arrepentimiento
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

/** Título de sección dentro de un texto legal. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
