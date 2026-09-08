import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  Coins,
  PiggyBank,
  Receipt,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react';
import { brand } from '@/config/brand';
import { PLANS } from '@/constants/plans';
import { parseIntent } from '@/services/nlp/parser';
import { formatMoney } from '@/lib/money';
import { humanDate } from '@/lib/date';
import { Logo } from '@/components/layout/logo';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const FEATURES = [
  { icon: Sparkles, title: 'Escribí como hablás', body: '«super 45 lucas» ya es un gasto categorizado, con fecha y comercio.' },
  { icon: Camera, title: 'Foto del ticket', body: 'Lee comercio, fecha, productos e impuestos, y reparte por categoría.' },
  { icon: BarChart3, title: 'Reportes que se entienden', body: 'Evolución, comparativas, top comercios y gastos hormiga.' },
  { icon: PiggyBank, title: 'Límites de gasto', body: 'Alertas al 80%, 90% y 100%, por categoría o generales.' },
  { icon: Target, title: 'Metas de ahorro', body: 'Cuánto falta, cuánto poner por mes y cuándo llegás.' },
  { icon: Coins, title: 'Pesos, dólares y euros', body: 'Guarda el importe original y su conversión, sin pisar nada.' },
];

const DEMOS = ['super 45 lucas', 'ayer cargué nafta 35 mil', 'Netflix 9.500', 'cobré 1.200.000', 'gasté 100 dólares en una cena'];

export default function LandingPage() {
  const [text, setText] = React.useState(DEMOS[0]);
  const intent = React.useMemo(() => parseIntent(text), [text]);

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <a href="#precios" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Precios
            </a>
            <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Entrar
            </Link>
            <Link to="/register" className={buttonVariants({ size: 'sm' })}>
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <Badge variant="secondary">Finanzas personales con IA</Badge>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Contale a {brand.name} qué hiciste con tu plata.
                <span className="block text-primary">Del orden se encarga sola.</span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground">{brand.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/register" className={buttonVariants({ size: 'lg' })}>
                  Empezar gratis <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/login" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
                  Ver la demo con datos
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Sin tarjeta. Tus datos financieros no se usan para entrenar modelos.
              </p>
            </div>

            <Card className="p-5">
              <p className="text-sm font-medium">Probalo acá mismo</p>
              <p className="text-xs text-muted-foreground">Escribí un gasto como se lo contarías a alguien.</p>
              <Input
                className="mt-3"
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label="Frase de ejemplo"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEMOS.map((demo) => (
                  <button
                    key={demo}
                    onClick={() => setText(demo)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {demo}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                {intent.amount ? (
                  <>
                    <p className="num text-2xl font-semibold">
                      {formatMoney(intent.amount, { currency: intent.currency })}
                    </p>
                    <p className="text-sm font-medium">{intent.description || 'Sin descripción'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {intent.type === 'income' ? 'Ingreso' : intent.type === 'refund' ? 'Reintegro' : 'Gasto'} ·{' '}
                      {humanDate(intent.date)}
                      {intent.merchant ? ` · ${intent.merchant}` : ''} · {Math.round(intent.confidence * 100)}% de
                      confianza
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{intent.question}</p>
                )}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Esta interpretación corre en tu navegador, sin enviar nada a ningún servidor.
              </p>
            </Card>
          </div>
        </section>

        <section className="border-y border-border bg-card/60 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight">Todo lo que necesitás, sin planillas</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-medium">{feature.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="precios" className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Precios</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Empezá gratis. Cambiás de plan cuando la app se haya ganado el lugar, no antes.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((plan) => (
              <Card key={plan.code} className={plan.featured ? 'p-5 ring-2 ring-primary/40' : 'p-5'}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{plan.name}</p>
                  {plan.featured ? <Badge>Más elegido</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                <p className="num mt-4 text-2xl font-semibold">
                  {plan.price === 0 ? 'Gratis' : formatMoney(plan.price, { currency: plan.currency })}
                  {plan.price > 0 ? (
                    <span className="text-sm font-normal text-muted-foreground"> /mes</span>
                  ) : null}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {plan.highlights.slice(0, 5).map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={buttonVariants({
                    variant: plan.featured ? 'default' : 'secondary',
                    className: 'mt-5 w-full',
                  })}
                >
                  {plan.price === 0 ? 'Empezar gratis' : `Probar ${plan.name}`}
                </Link>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Precios en pesos argentinos, por mes. Se puede cancelar cuando quieras y seguís teniendo
            acceso hasta el final del período pago.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-6 lg:grid-cols-3">
            <Step icon={Wallet} step="1" title="Registrá" body="Escribí, dictá o cargá a mano. La IA completa el resto." />
            <Step icon={Receipt} step="2" title="Sacá la foto" body="El ticket se convierte en productos, importes y categorías." />
            <Step icon={BarChart3} step="3" title="Entendé" body="Dashboard, reportes y análisis con los números a la vista." />
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <Logo />
            <p>{brand.name} · {new Date().getFullYear()} · Hecho para ordenar la plata, no para complicarla.</p>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 sm:justify-start">
            <Link className="hover:text-foreground" to="/terminos">
              Términos y condiciones
            </Link>
            <Link className="hover:text-foreground" to="/privacidad">
              Política de privacidad
            </Link>
            {/* Resolución 424/2020: tiene que verse desde la portada. */}
            <Link className="font-medium text-primary hover:underline" to="/arrepentimiento">
              Botón de arrepentimiento
            </Link>
            <a
              className="hover:text-foreground"
              href="https://autogestion.produccion.gob.ar/consumidores"
              target="_blank"
              rel="noreferrer"
            >
              Defensa del consumidor
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Step({ icon: Icon, step, title, body }: { icon: typeof Wallet; step: string; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paso {step}</p>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
