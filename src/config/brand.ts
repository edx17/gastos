/**
 * Single source of truth for the product identity.
 * Renaming the app = editing this file (plus `index.html`'s <title>).
 */
export const brand = {
  name: 'Crocante',
  shortName: 'Crocante',
  tagline: 'Contale qué hiciste con tu plata. Del orden me encargo yo.',
  description:
    'Registrá gastos hablando normal, sacá una foto del ticket y mirá tus finanzas ordenadas sin llenar formularios.',
  supportEmail: 'hola@crocante.app',
  /** Used by the mark in the sidebar / auth screens. */
  initial: 'C',
} as const;

export type Brand = typeof brand;
