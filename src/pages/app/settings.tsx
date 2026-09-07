import * as React from 'react';
import { Bell, Bot, Coins, CreditCard, Database, Shield, Trash2, User } from 'lucide-react';
import { brand } from '@/config/brand';
import { env } from '@/config/env';
import { SUPPORTED_CURRENCIES, formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { isDemoBackend } from '@/services/data';
import { OCR_PROVIDER_LABELS } from '@/services/ocr';
import { useWorkspace } from '@/providers/workspace-provider';
import { useAsync } from '@/hooks/use-async';
import { useToast } from '@/components/ui/toast';
import { useTheme } from '@/providers/theme-provider';
import type { AiProviderId } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select, Switch } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { CurrencySelector } from '@/components/finance/currency-selector';

export default function SettingsPage() {
  const {
    client,
    userId,
    profile,
    paymentMethods,
    rules,
    rates,
    refreshProfile,
    refreshRules,
    refreshRates,
    refreshPaymentMethods,
    revision,
    bumpRevision,
  } = useWorkspace();
  const toast = useToast();
  const { theme, setTheme } = useTheme();

  const notifications = useAsync(() => client.listNotifications(userId), [userId, revision]);
  const traces = useAsync(() => client.listAiInteractions(userId, 10), [userId, revision]);

  const [displayName, setDisplayName] = React.useState(profile.display_name);
  const [newMethod, setNewMethod] = React.useState('');
  const [resetting, setResetting] = React.useState(false);
  const [rateDrafts, setRateDrafts] = React.useState<Record<string, string>>({});

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Tu perfil, tus reglas y cómo se comporta la IA.</p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nombre</Label>
            <div className="flex gap-2">
              <Input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              <Button
                variant="outline"
                onClick={async () => {
                  await client.updateProfile(userId, { display_name: displayName.trim() });
                  await refreshProfile();
                  toast.success('Perfil actualizado');
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-currency">Moneda principal</Label>
            <CurrencySelector
              id="profile-currency"
              value={profile.base_currency}
              onChange={async (value) => {
                await client.updateProfile(userId, { base_currency: value });
                await refreshProfile();
                await refreshRates();
                bumpRevision();
                toast.info('Moneda principal actualizada', 'Los movimientos guardan su importe original sin cambios.');
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-theme">Tema</Label>
            <Select id="profile-theme" value={theme} onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'system')}>
              <option value="system">Automático</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-locale">Idioma</Label>
            <Select id="profile-locale" value={profile.locale} disabled>
              <option value="es-AR">Español (Argentina)</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle>Inteligencia artificial</CardTitle>
            <CardDescription>
              Proveedor configurado: <strong>{env.aiProvider === 'mock' ? 'modo demo (reglas locales)' : env.aiProvider}</strong> ·
              OCR: <strong>{OCR_PROVIDER_LABELS[env.ocrProvider]}</strong>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            title="Aprender de mis correcciones"
            description="Cuando cambiás una categoría, puedo recordarlo para movimientos parecidos."
            checked={profile.ai.learn_from_corrections}
            onChange={async (value) => {
              await client.updateProfile(userId, { ai: { ...profile.ai, learn_from_corrections: value } });
              await refreshProfile();
            }}
          />
          <ToggleRow
            title="Consultar al modelo de IA"
            description="Si lo desactivás, todo se interpreta localmente con reglas. Nada sale de tu dispositivo."
            checked={profile.ai.share_data_with_ai}
            onChange={async (value) => {
              await client.updateProfile(userId, { ai: { ...profile.ai, share_data_with_ai: value } });
              await refreshProfile();
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-autosave">Guardar sin confirmar desde</Label>
              <Input
                id="ai-autosave"
                type="number"
                min={0.5}
                max={1}
                step={0.05}
                value={profile.ai.autosave_threshold}
                onChange={async (event) => {
                  await client.updateProfile(userId, {
                    ai: { ...profile.ai, autosave_threshold: Number(event.target.value) },
                  });
                  await refreshProfile();
                }}
              />
              <p className="text-xs text-muted-foreground">Confianza mínima para sugerir guardado directo.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-ask">Pedir datos por debajo de</Label>
              <Input
                id="ai-ask"
                type="number"
                min={0.3}
                max={0.9}
                step={0.05}
                value={profile.ai.ask_threshold}
                onChange={async (event) => {
                  await client.updateProfile(userId, {
                    ai: { ...profile.ai, ask_threshold: Number(event.target.value) },
                  });
                  await refreshProfile();
                }}
              />
              <p className="text-xs text-muted-foreground">Por debajo de este valor te pregunto en vez de adivinar.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ai-provider">Proveedor para esta cuenta</Label>
              <Select
                id="ai-provider"
                value={profile.ai.provider_override ?? ''}
                onChange={async (event) => {
                  await client.updateProfile(userId, {
                    ai: { ...profile.ai, provider_override: (event.target.value || undefined) as AiProviderId | undefined },
                  });
                  await refreshProfile();
                }}
              >
                <option value="">Usar el configurado en el servidor ({env.aiProvider})</option>
                <option value="mock">Solo reglas locales</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle>Monedas y cotizaciones</CardTitle>
            <CardDescription>
              Cada movimiento guarda su importe original y la conversión a {profile.base_currency}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {SUPPORTED_CURRENCIES.filter((code) => code !== profile.base_currency).map((code) => (
            <div key={code} className="space-y-1.5">
              <Label htmlFor={`rate-${code}`}>
                1 {code} = ? {profile.base_currency}
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`rate-${code}`}
                  inputMode="decimal"
                  value={rateDrafts[code] ?? String(rates[code] ?? '')}
                  onChange={(event) => setRateDrafts({ ...rateDrafts, [code]: event.target.value })}
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    const value = Number((rateDrafts[code] ?? '').replace(',', '.'));
                    if (!Number.isFinite(value) || value <= 0) {
                      toast.error('La cotización tiene que ser un número mayor a cero.');
                      return;
                    }
                    await client.upsertExchangeRate(userId, code, value);
                    await refreshRates();
                    toast.success(`Cotización de ${code} actualizada`);
                  }}
                >
                  Guardar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ejemplo: {formatMoney(100, { currency: code })} ={' '}
                {formatMoney(100 * (rates[code] ?? 1), { currency: profile.base_currency })}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle>Medios de pago</CardTitle>
            <CardDescription>No guardamos números completos de tarjeta, solo un alias y los últimos 4 dígitos.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {paymentMethods.map((method) => (
              <Badge key={method.id} variant="secondary">
                {method.name}
                {method.last4 ? ` ····${method.last4}` : ''}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newMethod}
              onChange={(event) => setNewMethod(event.target.value)}
              placeholder="Ej: Visa Santander"
              aria-label="Nuevo medio de pago"
            />
            <Button
              variant="outline"
              onClick={async () => {
                if (!newMethod.trim()) return;
                await client.createPaymentMethod(userId, { name: newMethod.trim(), kind: 'other' });
                await refreshPaymentMethods();
                setNewMethod('');
                toast.success('Medio de pago agregado');
              }}
            >
              Agregar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle>Reglas de categorización</CardTitle>
            <CardDescription>Lo que aprendí de tus correcciones. Podés borrar cualquiera.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length ? (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">«{rule.pattern}»</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.strategy === 'always' ? 'Aplica siempre' : 'Solo sugiere'} · usada {rule.hits} veces
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Eliminar regla"
                  onClick={async () => {
                    await client.deleteRule(rule.id);
                    await refreshRules();
                    toast.success('Regla eliminada');
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay reglas. Se crean cuando corregís una categoría y elegís «Siempre».
            </p>
          )}
        </CardContent>
      </Card>

      <Card id="notificaciones">
        <CardHeader className="flex-row items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {notifications.data?.length ? (
            notifications.data.map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  await client.markNotificationRead(item.id);
                  notifications.reload();
                }}
                className={`w-full rounded-lg border p-3 text-left ${item.read_at ? 'border-border opacity-60' : 'border-primary/40 bg-primary/5'}`}
              >
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.body}</p>
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No hay avisos pendientes.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle>Datos y privacidad</CardTitle>
            <CardDescription>
              {isDemoBackend()
                ? 'Estás en modo demo: los datos viven en este navegador y no salen de tu dispositivo.'
                : 'Tus datos están protegidos por Row Level Security: solo vos podés leerlos y modificarlos.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Últimas interpretaciones de IA</p>
            {traces.data?.length ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {traces.data.map((trace) => (
                  <li key={trace.id} className="flex flex-wrap justify-between gap-2">
                    <span className="truncate">«{trace.input}»</span>
                    <span>
                      {trace.provider}/{trace.model} · {trace.latency_ms} ms ·{' '}
                      {trace.success ? 'ok' : `error: ${trace.error ?? ''}`} · {formatDate(trace.created_at.slice(0, 10))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Todavía no se consultó ningún modelo externo desde esta cuenta.
              </p>
            )}
          </div>

          {client.seedDemoData ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await client.seedDemoData?.(userId);
                  bumpRevision();
                  window.location.reload();
                }}
              >
                Cargar datos de ejemplo
              </Button>
              <Button variant="outline" onClick={() => setResetting(true)}>
                <Trash2 className="h-4 w-4" />
                Borrar todos mis datos
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        {brand.name} · {brand.tagline}
      </p>

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Borrar todos los datos"
        message="Se eliminan movimientos, tickets, presupuestos y metas de esta cuenta. No se puede deshacer."
        confirmLabel="Borrar todo"
        destructive
        onConfirm={async () => {
          await client.resetData?.(userId);
          window.location.reload();
        }}
      />
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
