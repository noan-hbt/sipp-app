/**
 * Who publishes Sipp: the only place to fill in for the legal pages (mentions légales, CGU, confidentialité,
 * remboursement). Any value still starting with "[" shows as-is on the pages, so nothing can go live
 * looking finished while it isn't.
 */
export const COMPANY = {
  /** Raison sociale, or "Prénom Nom, entrepreneur individuel" for a micro-entreprise. */
  name: '[Raison sociale]',
  /** e.g. "SAS au capital de 1 000 €", or "Entrepreneur individuel (EI)". */
  form: '[Forme juridique et capital]',
  /** The domiciliation address. */
  address: '[Adresse de domiciliation]',
  /** e.g. "RCS Paris 123 456 789", or "SIREN 123 456 789" for a micro-entreprise. */
  registration: '[RCS ou SIREN]',
  /** Intra-community VAT number, or "TVA non applicable, art. 293 B du CGI" under the franchise. */
  vat: '[N° de TVA intracommunautaire]',
  /** Directeur·rice de la publication: the legal representative. */
  publisher: '[Nom du directeur ou de la directrice de la publication]',
  email: 'hello@sipp.app',
  website: 'https://sipp.app',
  /** Courts named in the terms (consumers may still use their own). */
  city: '[Ville du siège]',
} as const

/** Where the app runs (Railway). Check against https://railway.com/legal/terms before launch. */
export const HOST = {
  name: 'Railway Corporation',
  address: '548 Market St, PMB 68956, San Francisco, CA 94104, États-Unis',
  website: 'https://railway.com',
} as const

/** Date shown at the top of each legal page: change it whenever a text changes. */
export const LEGAL_UPDATED = '2026-11-02'
