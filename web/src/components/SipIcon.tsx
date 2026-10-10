/** Flat topic illustrations (public/illustrations/topic-*.webp): the theme the AI chose for the Sip, else picked from its words. */

type Tone = 'coral' | 'sun' | 'mint' | 'lilac' | 'sky' | 'peach'

const TONES: Record<Tone, { bg: string; ink: string; bar: string }> = {
  coral: { bg: 'var(--coral-soft)', ink: 'var(--peach-ink)', bar: 'var(--primary)' },
  sun: { bg: 'var(--butter)', ink: 'var(--butter-ink)', bar: 'var(--primary)' },
  mint: { bg: 'var(--mint)', ink: 'var(--mint-ink)', bar: 'var(--primary)' },
  lilac: { bg: 'var(--lavender)', ink: 'var(--lavender-ink)', bar: 'var(--primary)' },
  sky: { bg: 'var(--sky)', ink: 'var(--sky-ink)', bar: 'var(--primary)' },
  peach: { bg: 'var(--peach-soft)', ink: 'var(--peach-ink)', bar: 'var(--primary)' },
}

// key, tone, word prefixes (accent-free, lowercase). Order matters: first match wins.
const TOPICS: [string, Tone, string[]][] = [
  ['public-speaking', 'coral', ['prise de parole', 'parler en public', 'eloquence', 'pitch', 'oral', 'discours']],
  ['marketing', 'coral', ['marketing', 'pub', 'communication digitale', 'reseaux sociaux', 'seo', 'marque', 'branding', 'vendre', 'vente']],
  ['law', 'lilac', ['droit', 'juridique', 'loi', 'contrat', 'avocat', 'justice', 'rgpd']],
  ['finance', 'mint', ['finance', 'bilan', 'compta', 'budget', 'bourse', 'investir', 'epargne', 'impot', 'banque', 'argent', 'credit', 'pret', 'emprunt', 'immobilier']],
  ['business', 'coral', ['entreprise', 'business', 'startup', 'tpe', 'pme', 'sasu', 'micro entreprise', 'freelance', 'entrepreneur', 'boutique', 'commerce']],
  ['leadership', 'coral', ['leadership', 'manager', 'management', 'diriger', 'equipe', 'leader']],
  ['economy', 'mint', ['economie', 'inflation', 'croissance', 'macro', 'micro economie']],
  ['productivity', 'sun', ['productivite', 'organisation', 'focus', 'habitude', 'temps', 'procrastin']],
  ['career', 'coral', ['carriere', 'emploi', 'entretien', 'cv', 'recrutement', 'job', 'reconversion']],
  ['psychology', 'lilac', ['psycho', 'emotion', 'cerveau', 'stress', 'anxiete', 'confiance', 'motivation', 'biais']],
  ['meditation', 'lilac', ['meditation', 'pleine conscience', 'respiration', 'yoga', 'calme']],
  ['sleep', 'lilac', ['sommeil', 'dormir', 'reve', 'insomnie', 'fatigue']],
  ['health', 'coral', ['sante', 'medecine', 'maladie', 'corps humain', 'coeur', 'premiers secours']],
  ['cooking', 'peach', ['cuisine', 'recette', 'cuisiner', 'patisserie', 'nutrition', 'manger', 'alimentation']],
  ['drinks', 'peach', ['vin', 'cafe', 'the ', 'biere', 'cocktail', 'oenologie', 'whisky']],
  ['fitness', 'mint', ['sport', 'muscu', 'fitness', 'course', 'running', 'velo', 'football', 'tennis', 'natation']],
  ['music', 'lilac', ['musique', 'guitare', 'piano', 'solfege', 'chanson', 'rap', 'jazz', 'compositeur']],
  ['cinema', 'sky', ['cinema', 'film', 'serie', 'realisateur', 'acteur']],
  ['photography', 'sky', ['photo', 'appareil', 'objectif']],
  ['design', 'peach', ['design', 'ui', 'ux', 'graphisme', 'couleur', 'typographie', 'dessin']],
  ['art', 'sun', ['art', 'peinture', 'musee', 'roman', 'gothique', 'sculpture', 'architecture', 'impressionn']],
  ['writing', 'sun', ['ecrire', 'ecriture', 'redaction', 'roman ', 'poesie', 'storytelling']],
  ['books', 'sun', ['livre', 'litterature', 'lecture', 'auteur', 'lire ']],
  ['language', 'peach', ['anglais', 'espagnol', 'italien', 'allemand', 'japonais', 'chinois', 'langue', 'vocabulaire', 'grammaire', 'portugais', 'arabe']],
  ['history', 'sun', ['histoire', 'guerre', 'revolution', 'moyen age', 'antiquite', 'empire', 'siecle', 'antique', 'rome', 'egypte', 'grece antique']],
  ['mythology', 'sun', ['mythologie', 'dieux', 'legende', 'zeus']],
  ['philosophy', 'lilac', ['philo', 'ethique', 'morale', 'stoic', 'socrate', 'nietzsche']],
  ['society', 'sky', ['politique', 'societe', 'election', 'democratie', 'geopolitique', 'institution']],
  ['travel', 'sky', ['voyage', 'geographie', 'pays', 'ville', 'tourisme', 'capitale']],
  ['space', 'lilac', ['espace', 'astronomie', 'planete', 'etoile', 'univers', 'trou noir', 'galaxie', 'nasa']],
  ['physics', 'sky', ['physique', 'quantique', 'relativite', 'energie', 'electricite', 'atome']],
  ['chemistry', 'mint', ['chimie', 'molecule', 'reaction']],
  ['biology', 'mint', ['biologie', 'adn', 'cellule', 'evolution', 'genetique', 'vivant']],
  ['ecology', 'mint', ['ecologie', 'climat', 'environnement', 'recyclage', 'biodiversite']],
  ['gardening', 'mint', ['jardin', 'plante', 'potager', 'botanique']],
  ['pets', 'peach', ['chien', 'chat', 'animal', 'animaux']],
  ['math', 'sky', ['math', 'algebre', 'geometrie', 'statistique', 'probabilite', 'calcul']],
  ['ai', 'sky', ['intelligence artificielle', 'ia ', 'machine learning', 'llm', 'chatgpt', 'robot']],
  ['tech', 'sky', ['code', 'programmation', 'python', 'javascript', 'informatique', 'web', 'blockchain', 'crypto', 'logiciel', 'tech']],
  ['parenting', 'peach', ['parent', 'bebe', 'enfant', 'education']],
  ['communication', 'coral', ['communication', 'negociation', 'relation', 'conflit', 'couple', 'amitie']],
  ['diy', 'sun', ['bricolage', 'renovation', 'maison', 'outil']],
  ['cars', 'sky', ['voiture', 'auto', 'moteur', 'permis', 'mecanique']],
  ['fashion', 'coral', ['mode', 'vetement', 'style', 'couture']],
  ['games', 'lilac', ['echecs', 'jeu', 'poker', 'strategie']],
]


const norm = (s: string) => ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')} `

export function topicOf(text: string | null | undefined, theme?: string | null): { key: string; tone: Tone } {
  if (theme === 'general') return { key: 'general', tone: 'sun' }
  const chosen = theme ? TOPICS.find(([key]) => key === theme) : undefined
  if (chosen) return { key: chosen[0], tone: chosen[1] }
  const t = norm(text ?? '')
  for (const [key, tone, words] of TOPICS) {
    if (words.some((w) => t.includes(' ' + w))) return { key, tone }
  }
  return { key: 'general', tone: 'sun' }
}

export function sipPalette(text: string | null | undefined, theme?: string | null) {
  return TONES[topicOf(text, theme).tone]
}

export function illustration(name: string) {
  return `/illustrations/${name}.webp`
}

/** The topic's illustration, for art that sits outside a tile. */
export function topicArt(text: string | null | undefined, theme?: string | null) {
  return illustration('topic-' + topicOf(text, theme).key)
}

/** Pastel tile with the topic illustration. */
export function SipIcon({ text, theme, size = 48, radius }: { text: string | null | undefined; theme?: string | null; size?: number; radius?: number }) {
  const { key, tone } = topicOf(text, theme)
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size * 0.3,
        background: TONES[tone].bg,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <img src={illustration('topic-' + key)} alt="" width={size * 0.8} height={size * 0.8} style={{ objectFit: 'contain' }} draggable={false} />
    </span>
  )
}
