import * as React from 'react';
import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { LegalLayout, Section } from './legal-layout';

/**
 * Botón de arrepentimiento (Resolución 424/2020 de la Secretaría de Comercio Interior).
 *
 * Tiene que estar accesible desde la portada y permitir pedir la baja de una
 * compra sin trámites. Acá se arma el pedido y se envía por correo, que es el
 * canal declarado en los términos.
 */
export default function RegretPage() {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [reason, setReason] = React.useState('');

  const body = [
    'Solicito el arrepentimiento de mi compra dentro del plazo legal.',
    '',
    `Nombre: ${name || '(completar)'}`,
    `Correo de la cuenta: ${email || '(completar)'}`,
    `Motivo (opcional): ${reason || '-'}`,
    '',
    `Enviado desde ${legal.site}`,
  ].join('\n');

  const mailto = `mailto:${legal.contactEmail}?subject=${encodeURIComponent(
    'Botón de arrepentimiento',
  )}&body=${encodeURIComponent(body)}`;

  return (
    <LegalLayout title="Botón de arrepentimiento">
      <Section title="De qué se trata">
        <p>
          Si contrataste un plan pago de {brand.name} y te arrepentiste, tenés{' '}
          <strong>{legal.regretDays} días corridos</strong> desde la contratación para dejarlo sin
          efecto y recuperar lo pagado, sin costo ni justificación, según el artículo 34 de la Ley
          24.240.
        </p>
        <p>
          Completá estos datos y se abre un correo con el pedido ya redactado. Te respondemos dentro de
          las 48 horas hábiles y hacemos la devolución por el mismo medio de pago.
        </p>
      </Section>

      <form className="space-y-4 rounded-lg bg-muted/60 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="regret-name">Nombre y apellido</Label>
          <Input id="regret-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regret-email">Correo de la cuenta</Label>
          <Input
            id="regret-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="El mismo con el que te registraste"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regret-reason">Motivo (opcional)</Label>
          <Textarea
            id="regret-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="No hace falta explicar nada, pero si querés contarnos nos sirve."
          />
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            window.location.href = mailto;
          }}
        >
          Enviar solicitud de arrepentimiento
        </Button>
        <p className="text-xs text-muted-foreground">
          También podés escribir directamente a {legal.contactEmail} con el asunto «Botón de
          arrepentimiento».
        </p>
      </form>

      <Section title="¿Sólo querés dar de baja la suscripción?">
        <p>
          Si ya pasaron los {legal.regretDays} días y simplemente no querés seguir, no necesitás este
          formulario: entrá a{' '}
          <Link className="text-primary hover:underline" to="/app/settings">
            Ajustes → Plan
          </Link>{' '}
          y das de baja la renovación en un clic. Seguís usando el plan hasta que termine el período que
          ya pagaste.
        </p>
      </Section>
    </LegalLayout>
  );
}
