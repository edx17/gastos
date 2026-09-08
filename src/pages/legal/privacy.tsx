import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { LegalLayout, Section } from './legal-layout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad">
      <Section title="Lo importante primero">
        <p>
          Tus movimientos son tuyos. No los vendemos, no los compartimos con anunciantes y no los
          usamos para entrenar modelos de inteligencia artificial. Podés borrar todo cuando quieras.
        </p>
      </Section>

      <Section title="1. Responsable de los datos">
        <p>
          {legal.companyName}, CUIT {legal.taxId}, con domicilio en {legal.address}, {legal.city}, es
          responsable del tratamiento de los datos que cargás en {brand.name}. Contacto:{' '}
          <a className="text-primary hover:underline" href={`mailto:${legal.contactEmail}`}>
            {legal.contactEmail}
          </a>
          .
        </p>
      </Section>

      <Section title="2. Qué datos guardamos">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>De tu cuenta</strong>: correo electrónico y nombre. Si entrás con Google, recibimos
            de Google tu correo y tu nombre, nada más.
          </li>
          <li>
            <strong>Financieros</strong>: los movimientos, categorías, presupuestos, metas y tickets que
            cargás.
          </li>
          <li>
            <strong>Técnicos</strong>: registros mínimos de funcionamiento y errores, sin importes ni
            descripciones de tus gastos.
          </li>
        </ul>
        <p>
          <strong>No guardamos datos de tarjetas ni credenciales bancarias.</strong> El cobro lo procesa
          Mercado Pago y esos datos no pasan por nuestros servidores. De los medios de pago que cargues
          para clasificar tus gastos guardamos sólo un alias y, como mucho, los últimos cuatro dígitos.
        </p>
      </Section>

      <Section title="3. Para qué los usamos">
        <p>
          Para prestarte el servicio: mostrarte tus reportes, categorizar tus gastos, avisarte cuando te
          acercás a un límite y facturarte si tenés un plan pago. Nada más.
        </p>
      </Section>

      <Section title="4. Inteligencia artificial">
        <p>
          La interpretación de frases como «super 45 lucas» ocurre <strong>en tu propio navegador</strong>,
          sin enviar nada a ningún servidor.
        </p>
        <p>
          Cuando una frase es ambigua, o cuando leemos un ticket por foto, podemos consultar a un
          proveedor externo de inteligencia artificial. En ese caso le enviamos únicamente el texto de
          ese movimiento (o la imagen del ticket) y la lista de nombres de tus categorías: nunca tu
          historial completo, tu saldo ni tus datos personales.
        </p>
        <p>
          Podés desactivar por completo esas consultas desde <strong>Ajustes → Inteligencia
          artificial</strong>. Con eso apagado, todo se resuelve localmente.
        </p>
      </Section>

      <Section title="5. Con quién los compartimos">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Supabase</strong>: alojamiento de la base de datos y de las imágenes de tickets.
          </li>
          <li>
            <strong>Mercado Pago</strong>: procesamiento de los pagos de las suscripciones.
          </li>
          <li>
            <strong>Proveedor de inteligencia artificial</strong>: sólo el texto o la imagen puntual
            descriptos arriba, y sólo si no desactivaste la función.
          </li>
        </ul>
        <p>Fuera de eso, no compartimos tus datos con nadie, salvo orden judicial.</p>
      </Section>

      <Section title="6. Cuánto tiempo los guardamos">
        <p>
          Mientras tengas la cuenta abierta. Si la eliminás, borramos tus movimientos, tickets,
          presupuestos y metas de forma definitiva. Podemos conservar los comprobantes de facturación el
          tiempo que exija la normativa impositiva.
        </p>
      </Section>

      <Section title="7. Tus derechos">
        <p>
          Podés acceder, rectificar, actualizar y suprimir tus datos personales. La mayoría lo podés
          hacer vos desde la aplicación: editar cualquier movimiento, exportar todo a CSV o eliminar la
          cuenta entera desde Ajustes. Para lo demás, escribinos a{' '}
          <a className="text-primary hover:underline" href={`mailto:${legal.contactEmail}`}>
            {legal.contactEmail}
          </a>
          .
        </p>
        <p className="text-xs">
          La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las
          denuncias y reclamos de quienes vean afectados sus derechos.
        </p>
      </Section>

      <Section title="8. Seguridad">
        <p>
          Cada cuenta sólo puede leer y modificar sus propios datos: eso se aplica en la base de datos,
          no sólo en la pantalla. Las imágenes de tickets se guardan en un depósito privado y se sirven
          con enlaces temporales. Las conexiones viajan cifradas.
        </p>
      </Section>
    </LegalLayout>
  );
}
