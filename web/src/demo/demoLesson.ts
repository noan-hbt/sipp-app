import type { Block } from '../lib/blocks'

export const DEMO_LESSON: {
  id: 'demo'
  title: string
  objective: string
  sip_title: string
  blocks: Block[]
} = {
  id: 'demo',
  title: 'Pourquoi le café nous réveille',
  objective: 'Comprendre comment la caféine atténue le signal de somnolence et pourquoi son effet peut durer plusieurs heures.',
  sip_title: 'Le café, côté cerveau',
  blocks: [
    {
      type: 'text',
      content: 'Tu bâilles devant ton écran. Un café plus tard, tu te sens plus alerte. Que se passe-t-il dans ton cerveau ? En cinq minutes, tu vas découvrir comment la caféine agit sur un signal lié au besoin de dormir.',
    },
    {
      type: 'concept',
      name: 'L’adénosine : un signal de somnolence',
      definition: 'L’adénosine est une molécule qui contribue à augmenter ton envie de dormir.',
      explanation: 'Pendant l’éveil, son niveau augmente dans certaines régions du cerveau. Elle agit en se fixant sur des récepteurs : des zones d’accueil sur les cellules. Ce signal participe à la pression de sommeil, cette envie de dormir qui grandit quand tu restes éveillé.',
    },
    {
      type: 'concept',
      name: 'La caféine : un bloqueur de récepteurs',
      definition: 'La caféine est un stimulant qui bloque certains récepteurs de l’adénosine.',
      explanation: 'La caféine du café atteint ton cerveau et occupe ces récepteurs sans les activer comme l’adénosine. Le signal de somnolence agit moins : tu te sens plus alerte, même si ton besoin de sommeil reste là.',
    },
    {
      type: 'analogy',
      source: 'Des serrures et deux clés',
      target: 'Les récepteurs de l’adénosine',
      explanation: 'Imagine que l’adénosine est une clé qui ouvre la porte au signal de somnolence. La caféine occupe certaines serrures sans ouvrir cette porte : l’adénosine y accède moins facilement.',
      mappings: [
        { source: 'Serrure', target: 'Récepteur de l’adénosine' },
        { source: 'Clé qui ouvre la porte', target: 'Adénosine' },
        { source: 'Clé qui occupe la serrure sans ouvrir', target: 'Caféine' },
      ],
      limits: 'C’est une image simplifiée : ton sommeil dépend aussi de ton horloge biologique et d’autres mécanismes.',
    },
    {
      type: 'question',
      kind: 'single_choice',
      prompt: 'Tu te sens plus alerte après un café. Quelle explication correspond au mécanisme que tu viens de découvrir ?',
      options: [
        { id: 'a', text: 'La caféine détruit l’adénosine.' },
        { id: 'b', text: 'La caféine bloque certains récepteurs de l’adénosine.' },
        { id: 'c', text: 'La caféine remplace les heures de sommeil manquantes.' },
      ],
      correct_option_ids: ['b'],
      explanation: 'La caféine gêne l’action de l’adénosine sur ses récepteurs. Elle ne détruit pas cette molécule et ne rembourse pas ta dette de sommeil.',
    },
    {
      type: 'misconception',
      statement: 'Si un café fait disparaître ma somnolence, mon besoin de sommeil a disparu aussi.',
      is_true: false,
      correction: 'Tu peux te sentir plus éveillé tout en ayant encore besoin de dormir. La caféine atténue un signal ; elle ne remplace pas le repos. Quand son effet diminue, la somnolence peut redevenir plus perceptible.',
    },
    {
      type: 'estimate',
      prompt: 'Chez l’adulte, quel est l’ordre de grandeur du temps nécessaire pour éliminer la moitié de la caféine présente dans le corps ? Fais une estimation.',
      min: 0,
      max: 12,
      step: 1,
      answer: 5,
      tolerance: 1,
      unit: 'h',
      explanation: 'Environ 5 heures : c’est un repère de demi-vie, variable selon les personnes. Après ce délai, il reste encore la moitié de la caféine. Cela ne veut pas dire que son effet ressenti est exactement divisé par deux.',
    },
    {
      type: 'example',
      title: 'Le café de 16 h peut encore compter à 21 h',
      content: 'Imaginons que ton café de 16 h contient 100 mg de caféine. Avec une demi-vie de 5 h, il en reste environ 50 mg à 21 h, puis 25 mg à 2 h du matin. Ce calcul simplifié montre pourquoi un café tardif peut gêner ton sommeil, même sans sensation de coup de fouet.',
    },
    {
      type: 'fill_blanks',
      text: 'L’{1} participe au signal de somnolence. La {2} bloque certains de ses récepteurs, sans supprimer le besoin de sommeil.',
      blanks: [
        { answer: 'adénosine' },
        { answer: 'caféine' },
      ],
      distractors: ['adrénaline', 'mélatonine'],
      explanation: 'L’adénosine contribue à la somnolence ; la caféine gêne son action sur certains récepteurs. Le besoin de dormir demeure.',
    },
    {
      type: 'match',
      prompt: 'Relie chaque notion à son rôle. Prends ton temps : elles racontent toute l’histoire du café.',
      pairs: [
        { left: 'Adénosine', right: 'Molécule qui contribue au signal de somnolence' },
        { left: 'Récepteur', right: 'Zone d’accueil d’une molécule sur une cellule' },
        { left: 'Caféine', right: 'Stimulant qui bloque certains récepteurs de l’adénosine' },
        { left: 'Demi-vie', right: 'Temps nécessaire pour éliminer la moitié d’une substance' },
      ],
      explanation: 'L’adénosine agit via ses récepteurs. La caféine peut les occuper ; sa quantité diminue ensuite progressivement dans ton corps.',
    },
    {
      type: 'application',
      prompt: 'Si tu en as envie, pense à l’heure de ton dernier café et ajoute 5 heures. À quel moment pourrait-il en rester environ la moitié ?',
      guidance: 'Exemple : 15 h → 20 h. Garde ce repère en tête pour observer le lien avec ton sommeil. C’est une approximation, pas une prédiction personnelle.',
      optional: true,
    },
    {
      type: 'recap',
      points: [
        'Pendant l’éveil, l’adénosine augmente dans certaines régions du cerveau et contribue à la somnolence.',
        'La caféine bloque certains de ses récepteurs : tu peux te sentir plus alerte.',
        'Se sentir réveillé ne signifie pas avoir récupéré : le café ne remplace pas le sommeil.',
        'Une demi-vie d’environ 5 h est un repère variable : un café tardif peut encore compter au coucher.',
      ],
      concepts: ['Adénosine', 'Récepteur', 'Caféine', 'Pression de sommeil', 'Demi-vie'],
    },
  ],
}
