/**
 * Datos del responsable del servicio.
 *
 * En Argentina, quien vende online tiene que identificarse de forma clara y
 * accesible (Ley 24.240 y Resolución 424/2020). Estos campos aparecen en los
 * términos, en la política de privacidad y en el pie de página.
 *
 * ⚠️ COMPLETAR ANTES DE COBRARLE A ALGUIEN: mientras digan «(completar)», la
 * app muestra un aviso en las páginas legales.
 */
export const legal = {
  /** Razón social o nombre completo de la persona que presta el servicio. */
  companyName: 'Eduardo Javier Theunynck',
  /** CUIT o CUIL. */
  taxId: '20-34154188-4',
  /** Domicilio comercial. */
  address: 'Av. Rivadavia 5871, CABA',
  city: 'Argentina',
  /** Correo de contacto para consultas, bajas y datos personales. */
  contactEmail: 'virtualfutsal@gmail.com',
  /** Dominio donde vive el servicio. */
  site: 'crocante.app',
  /** Fecha de la última actualización de los textos legales. */
  updatedAt: '2026-09-08',
  /** Días para arrepentirse de una compra online (Ley 24.240, art. 34). */
  regretDays: 10,
} as const;

/** Los textos legales avisan si todavía faltan datos del responsable. */
export const legalDataMissing = () =>
  [legal.companyName, legal.taxId, legal.address].some((value) => value.includes('completar'));
