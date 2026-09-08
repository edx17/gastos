import { Link } from 'react-router-dom';
import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { PLANS } from '@/constants/plans';
import { formatMoney } from '@/lib/money';
import { LegalLayout, Section } from './legal-layout';

export default function TermsPage() {
  return (
    <LegalLayout title="Términos y condiciones">
      <Section title="1. Quién presta el servicio">
        <p>
          {brand.name} es un servicio de gestión de finanzas personales prestado por{' '}
          <strong>{legal.companyName}</strong>, CUIT {legal.taxId}, con domicilio en {legal.address},{' '}
          {legal.city}. Para cualquier consulta, reclamo o baja podés escribir a{' '}
          <a className="text-primary hover:underline" href={`mailto:${legal.contactEmail}`}>
            {legal.contactEmail}
          </a>
          .
        </p>
      </Section>

      <Section title="2. Qué hace la aplicación">
        <p>
          {brand.name} te permite registrar ingresos y gastos escribiéndolos en lenguaje corriente o
          sacándole una foto a un ticket, los organiza en categorías y te muestra reportes sobre tus
          movimientos.
        </p>
        <p>
          <strong>No somos una entidad financiera ni un asesor de inversiones.</strong> La aplicación
          describe lo que muestran tus propios datos: no da recomendaciones de inversión, no opera con
          tu dinero y no se conecta a tus cuentas bancarias. Las decisiones sobre tu plata son tuyas.
        </p>
      </Section>

      <Section title="3. Tu cuenta">
        <p>
          Necesitás una cuenta para usar el servicio. Sos responsable de mantener tu contraseña a
          resguardo y de la actividad que ocurra en tu cuenta. Si detectás un uso indebido, avisanos.
        </p>
        <p>
          Podés eliminar tu cuenta cuando quieras desde Ajustes. Al hacerlo se borran tus movimientos,
          tickets, presupuestos y metas de forma definitiva.
        </p>
      </Section>

      <Section title="4. Planes y pagos">
        <p>Los planes vigentes y sus precios son:</p>
        <ul className="ml-5 list-disc space-y-1">
          {PLANS.map((plan) => (
            <li key={plan.code}>
              <strong>{plan.name}</strong>:{' '}
              {plan.price === 0 ? 'sin costo' : `${formatMoney(plan.price, { currency: plan.currency })} por mes`}.
            </li>
          ))}
        </ul>
        <p>
          Los precios están expresados en pesos argentinos e incluyen los impuestos que correspondan.
          La suscripción se renueva automáticamente cada mes hasta que la des de baja. Podemos
          actualizar los precios avisándote con al menos 30 días de anticipación; si no estás de
          acuerdo, podés dar de baja la suscripción antes de que el cambio entre en vigencia.
        </p>
        <p>
          El cobro lo procesa Mercado Pago. No guardamos los datos de tu tarjeta: no llegan a nuestros
          servidores.
        </p>
      </Section>

      <Section title="5. Baja y arrepentimiento">
        <p>
          Podés dar de baja la suscripción en cualquier momento desde <strong>Ajustes → Plan</strong>,
          sin llamar a nadie ni dar explicaciones. La baja se hace efectiva al final del período que ya
          pagaste: hasta ahí seguís teniendo acceso.
        </p>
        <p>
          Además, dentro de los <strong>{legal.regretDays} días corridos</strong> de contratado el
          servicio podés arrepentirte y pedir la devolución de lo pagado, conforme al artículo 34 de la
          Ley 24.240. Para eso está el{' '}
          <Link className="text-primary hover:underline" to="/arrepentimiento">
            botón de arrepentimiento
          </Link>
          .
        </p>
        <p>
          Al dar de baja tu plan no perdés tus datos: seguís pudiendo entrar con el plan gratuito y
          consultar todo lo que cargaste. Lo que dejás de tener son las funciones del plan pago.
        </p>
      </Section>

      <Section title="6. Límites de uso">
        <p>
          Cada plan tiene cupos mensuales (movimientos, tickets, consultas). Están publicados en la
          página de planes y también podés ver cuánto llevás usado en Ajustes. Cuando se agota un cupo,
          la aplicación te lo avisa: no se cobra nada extra ni se suspende tu cuenta.
        </p>
      </Section>

      <Section title="7. Uso responsable">
        <p>Al usar {brand.name} te comprometés a no:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>usar la aplicación para actividades ilegales;</li>
          <li>intentar acceder a datos de otras personas;</li>
          <li>revender el servicio o compartir tu cuenta con terceros de forma masiva;</li>
          <li>saturar la infraestructura con pedidos automatizados.</li>
        </ul>
      </Section>

      <Section title="8. Disponibilidad y responsabilidad">
        <p>
          Hacemos lo razonable para que el servicio esté disponible, pero no podemos garantizar que
          funcione sin interrupciones. Puede haber tareas de mantenimiento o fallas de proveedores.
        </p>
        <p>
          La interpretación automática de gastos y la lectura de tickets pueden equivocarse: por eso la
          aplicación siempre te muestra lo que entendió antes de guardarlo. Revisá los datos antes de
          confirmarlos. No respondemos por decisiones tomadas a partir de información que no hayas
          verificado.
        </p>
        <p>
          Nada de lo anterior limita los derechos que te reconoce la Ley de Defensa del Consumidor.
        </p>
      </Section>

      <Section title="9. Cambios en estos términos">
        <p>
          Si cambiamos estos términos te vamos a avisar por correo o dentro de la aplicación. Si seguís
          usando el servicio después de la fecha de vigencia, se entiende que los aceptás.
        </p>
      </Section>

      <Section title="10. Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República Argentina. Ante cualquier controversia
          son competentes los tribunales ordinarios del domicilio del consumidor.
        </p>
        <p>
          También podés presentar un reclamo ante la autoridad de aplicación en{' '}
          <a
            className="text-primary hover:underline"
            href="https://autogestion.produccion.gob.ar/consumidores"
            target="_blank"
            rel="noreferrer"
          >
            Defensa de las y los Consumidores
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}
