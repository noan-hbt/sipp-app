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

// key, tone, word prefixes in French and English (accent-free, lowercase). Order matters: first match wins.
const TOPICS: [string, Tone, string[]][] = [
  ['public-speaking', 'coral', ['prise de parole', 'parler en public', 'eloquence', 'pitch', 'oral', 'discours', 'public speaking', 'speech', 'presentation', 'speaking']],
  ['marketing', 'coral', ['marketing', 'pub', 'communication digitale', 'reseaux sociaux', 'seo', 'marque', 'branding', 'vendre', 'vente', 'advertising', 'social media', 'brand', 'sales', 'selling']],
  ['law', 'lilac', ['droit', 'juridique', 'loi', 'contrat', 'avocat', 'justice', 'rgpd', 'law', 'legal', 'contract', 'lawyer', 'gdpr']],
  ['finance', 'mint', ['finance', 'bilan', 'compta', 'budget', 'bourse', 'investir', 'epargne', 'impot', 'banque', 'argent', 'credit', 'pret', 'emprunt', 'immobilier', 'balance sheet', 'accounting', 'bookkeeping', 'stock', 'invest', 'saving', 'tax', 'bank', 'money', 'loan', 'mortgage', 'real estate']],
  ['business', 'coral', ['entreprise', 'business', 'startup', 'tpe', 'pme', 'sasu', 'micro entreprise', 'freelance', 'entrepreneur', 'boutique', 'commerce', 'company', 'small business', 'freelanc', 'shop']],
  ['leadership', 'coral', ['leadership', 'manager', 'management', 'diriger', 'equipe', 'leader', 'manag', 'team']],
  ['economy', 'mint', ['economie', 'inflation', 'croissance', 'macro', 'micro economie', 'econom', 'growth']],
  ['productivity', 'sun', ['productivite', 'organisation', 'focus', 'habitude', 'temps', 'procrastin', 'productivity', 'organiz', 'habit', 'time management']],
  ['career', 'coral', ['carriere', 'emploi', 'entretien', 'cv', 'recrutement', 'job', 'reconversion', 'career', 'interview', 'resume', 'hiring']],
  ['psychology', 'lilac', ['psycho', 'emotion', 'cerveau', 'stress', 'anxiete', 'confiance', 'motivation', 'biais', 'psycholog', 'brain', 'anxiety', 'confidence', 'bias']],
  ['meditation', 'lilac', ['meditation', 'pleine conscience', 'respiration', 'yoga', 'calme', 'meditat', 'mindful', 'breath']],
  ['sleep', 'lilac', ['sommeil', 'dormir', 'reve', 'insomnie', 'fatigue', 'sleep', 'dream', 'insomnia', 'tired']],
  ['health', 'coral', ['sante', 'medecine', 'maladie', 'corps humain', 'coeur', 'premiers secours', 'health', 'medic', 'disease', 'human body', 'heart', 'first aid']],
  ['cooking', 'peach', ['cuisine', 'recette', 'cuisiner', 'patisserie', 'nutrition', 'manger', 'alimentation', 'cook', 'recipe', 'baking', 'food']],
  ['drinks', 'peach', ['vin', 'cafe', 'the vert', 'the noir', 'theiere', 'biere', 'cocktail', 'oenologie', 'whisky', 'wine', 'coffee', 'tea ', 'beer', 'whisk']],
  ['fitness', 'mint', ['sport', 'muscu', 'fitness', 'course', 'running', 'velo', 'football', 'tennis', 'natation', 'workout', 'cycling', 'soccer', 'swimming']],
  ['music', 'lilac', ['musique', 'guitare', 'piano', 'solfege', 'chanson', 'rap', 'jazz', 'compositeur', 'music', 'guitar', 'song', 'compos']],
  ['cinema', 'sky', ['cinema', 'film', 'serie', 'realisateur', 'acteur', 'movie', 'tv series', 'director', 'actor']],
  ['photography', 'sky', ['photo', 'appareil', 'objectif', 'camera', 'lens']],
  ['design', 'peach', ['design', 'ui', 'ux', 'graphisme', 'couleur', 'typographie', 'dessin', 'graphic', 'typograph', 'drawing', 'colour', 'color']],
  ['art', 'sun', ['art ', 'arts', 'artist', 'peinture', 'musee', 'roman', 'gothique', 'sculpture', 'architecture', 'impressionn', 'painting', 'museum', 'impressionis']],
  ['writing', 'sun', ['ecrire', 'ecriture', 'redaction', 'roman ', 'poesie', 'storytelling', 'writing', 'write', 'poetry']],
  ['books', 'sun', ['livre', 'litterature', 'lecture', 'auteur', 'lire ', 'book', 'literature', 'reading', 'novel', 'author']],
  ['language', 'peach', ['anglais', 'espagnol', 'italien', 'allemand', 'japonais', 'chinois', 'langue', 'vocabulaire', 'grammaire', 'portugais', 'arabe', 'english', 'spanish', 'italian', 'german', 'japanese', 'chinese', 'language', 'vocabulary', 'grammar', 'portuguese', 'arabic', 'french']],
  ['history', 'sun', ['histoire', 'guerre', 'revolution', 'moyen age', 'antiquite', 'empire', 'siecle', 'antique', 'rome', 'egypte', 'grece antique', 'history', 'war ', 'wars', 'middle ages', 'antiquity', 'century', 'ancient', 'egypt']],
  ['mythology', 'sun', ['mythologie', 'dieux', 'legende', 'zeus', 'myth', 'gods', 'legend']],
  ['philosophy', 'lilac', ['philo', 'ethique', 'morale', 'stoic', 'socrate', 'nietzsche', 'philosoph', 'ethic', 'moral']],
  ['society', 'sky', ['politique', 'societe', 'election', 'democratie', 'geopolitique', 'institution', 'politic', 'society', 'democra', 'geopolitic']],
  ['travel', 'sky', ['voyage', 'geographie', 'pays', 'ville', 'tourisme', 'capitale', 'travel', 'geograph', 'country', 'countries', 'city', 'tourism']],
  ['space', 'lilac', ['espace', 'astronomie', 'planete', 'etoile', 'univers', 'trou noir', 'galaxie', 'nasa', 'space', 'astronom', 'planet', 'stars', 'universe', 'black hole', 'galax']],
  ['physics', 'sky', ['physique', 'quantique', 'relativite', 'energie', 'electricite', 'atome', 'physic', 'quantum', 'relativity', 'energy', 'electric', 'atom']],
  ['chemistry', 'mint', ['chimie', 'molecule', 'reaction', 'chemi']],
  ['biology', 'mint', ['biologie', 'adn', 'cellule', 'evolution', 'genetique', 'vivant', 'biolog', 'dna', 'cell', 'genetic']],
  ['ecology', 'mint', ['ecologie', 'climat', 'environnement', 'recyclage', 'biodiversite', 'ecolog', 'climate', 'environment', 'recycl', 'biodiversity']],
  ['gardening', 'mint', ['jardin', 'plante', 'potager', 'botanique', 'garden', 'plant', 'botan']],
  ['pets', 'peach', ['chien', 'chat', 'animal', 'animaux', 'dog', 'cat ', 'cats', 'pet ', 'pets']],
  ['math', 'sky', ['math', 'algebre', 'geometrie', 'statistique', 'probabilite', 'calcul', 'algebra', 'geometr', 'statistic', 'probabilit', 'calculus']],
  ['ai', 'sky', ['intelligence artificielle', 'ia ', 'machine learning', 'llm', 'chatgpt', 'robot', 'artificial intelligence', 'ai ']],
  ['tech', 'sky', ['code', 'programmation', 'python', 'javascript', 'informatique', 'web', 'blockchain', 'crypto', 'logiciel', 'tech', 'coding', 'programming', 'computer', 'software']],
  ['parenting', 'peach', ['parent', 'bebe', 'enfant', 'education', 'baby', 'child', 'kids']],
  ['communication', 'coral', ['communication', 'negociation', 'relation', 'conflit', 'couple', 'amitie', 'communicat', 'negotiat', 'relationship', 'conflict', 'friendship']],
  ['diy', 'sun', ['bricolage', 'renovation', 'maison', 'outil', 'diy', 'renovat', 'home improvement', 'tools']],
  ['cars', 'sky', ['voiture', 'auto', 'moteur', 'permis', 'mecanique', 'car ', 'cars', 'engine ', 'driving', 'mechanic']],
  ['fashion', 'coral', ['mode', 'vetement', 'style', 'couture', 'fashion', 'clothes', 'clothing', 'sewing']],
  ['games', 'lilac', ['echecs', 'jeu', 'poker', 'strategie', 'chess', 'game', 'strategy']],
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
