/** A legal page: titled sections of paragraphs. `{name}`, `{email}`... are filled from EDITOR. */
export interface LegalSection { title: string; body: string[] }
export interface LegalPage { title: string; intro?: string; sections: LegalSection[] }
export type LegalPageKey = 'mentions' | 'privacy' | 'terms'
