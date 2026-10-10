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
      type: 'hook',
      question: 'Un café te réveille en 20 minutes. Mais **qu’est-ce qu’il fait vraiment** dans ton cerveau ?',
      teaser: 'En cinq minutes, tu sauras pourquoi le café de 16 h compte encore au coucher.',
      answer: 'Il **bloque un signal de somnolence** sans effacer ton besoin de dormir, et il en reste encore la moitié **5 heures plus tard**.',
    },
    {
      type: 'predict',
      kind: 'number',
      prompt: 'À ton avis, combien d’heures faut-il à ton corps pour éliminer **la moitié** de la caféine d’un café ?',
      min: 0,
      max: 12,
      step: 0.5,
      answer: 5,
      unit: 'h',
      reveal: 'Environ **5 heures** chez l’adulte, avec de grosses différences d’une personne à l’autre. C’est ce qu’on appelle la **demi-vie**.',
    },
    {
      type: 'concept',
      name: 'L’adénosine : un signal de somnolence',
      definition: 'L’adénosine est une molécule qui fait monter ton envie de dormir.',
      explanation: 'Plus tu restes éveillé, plus elle s’accumule. Elle se fixe sur des **récepteurs**, des zones d’accueil sur les cellules, et ce signal pousse vers le sommeil.',
    },
    {
      type: 'concept',
      name: 'La caféine : un bloqueur',
      definition: 'La caféine occupe les récepteurs de l’adénosine sans les activer.',
      explanation: 'Le signal de somnolence passe moins : tu te sens plus alerte. Mais l’adénosine est toujours là, et ton besoin de sommeil aussi.',
    },
    {
      type: 'analogy',
      source: 'Des serrures et deux clés',
      target: 'Les récepteurs de l’adénosine',
      explanation: 'L’adénosine est la clé qui ouvre la porte du sommeil. La caféine est une fausse clé : elle entre dans la serrure, ne tourne pas, et bloque la vraie.',
      mappings: [
        { source: 'Serrure', target: 'Récepteur' },
        { source: 'Vraie clé', target: 'Adénosine' },
        { source: 'Fausse clé coincée', target: 'Caféine' },
      ],
      limits: 'Image simplifiée : ton sommeil dépend aussi de ton horloge biologique.',
    },
    {
      type: 'question',
      kind: 'single_choice',
      prompt: 'Tu te sens plus alerte après un café. Pourquoi ?',
      options: [
        { id: 'a', text: 'La caféine détruit l’adénosine.' },
        { id: 'b', text: 'La caféine bloque les récepteurs de l’adénosine.' },
        { id: 'c', text: 'La caféine rembourse tes heures de sommeil.' },
      ],
      correct_option_ids: ['b'],
      explanation: 'La caféine gêne l’adénosine sur ses récepteurs. Elle ne la détruit pas et ne remplace pas le sommeil.',
    },
    {
      type: 'simulate',
      prompt: 'Ton café de 16 h contient 100 mg de caféine. **Combien en reste-t-il** au fil de la soirée ?',
      parameter: 'Heures après le café',
      parameter_unit: 'h',
      output: 'Caféine restante',
      output_unit: 'mg',
      points: [
        { x: 0, y: 100 },
        { x: 2.5, y: 71 },
        { x: 5, y: 50 },
        { x: 7.5, y: 35 },
        { x: 10, y: 25 },
      ],
      start: 0,
      takeaway: 'À 21 h, il reste encore **50 mg**, la moitié d’un café. À 2 h du matin, encore 25 mg.',
    },
    {
      type: 'swipe',
      prompt: 'Vrai ou faux ?',
      cards: [
        { statement: 'Si je ne me sens plus fatigué, c’est que j’ai récupéré.', is_true: false, why: 'La caféine masque le signal, le besoin de sommeil reste.' },
        { statement: 'L’adénosine s’accumule pendant que tu es éveillé.', is_true: true, why: 'C’est elle qui fait monter la pression de sommeil.' },
        { statement: 'Un café à 17 h ne peut plus rien changer à 23 h.', is_true: false, why: 'Avec une demi-vie de 5 h, il en reste encore près de la moitié.' },
        { statement: 'La demi-vie de la caféine varie selon les personnes.', is_true: true, why: 'Âge, génétique, grossesse ou tabac la font beaucoup varier.' },
      ],
    },
    {
      type: 'fill_blanks',
      text: 'L’{1} pousse vers le sommeil. La {2} bloque ses récepteurs, sans supprimer le besoin de dormir.',
      blanks: [{ answer: 'adénosine' }, { answer: 'caféine' }],
      distractors: ['adrénaline', 'mélatonine'],
      explanation: 'L’adénosine fait la somnolence ; la caféine gêne son action. Le besoin de dormir, lui, reste.',
    },
    {
      type: 'recap',
      points: [
        'L’adénosine s’accumule quand tu es éveillé et pousse vers le sommeil.',
        'La caféine bloque ses récepteurs : tu te sens alerte, sans avoir récupéré.',
        'Il en reste la moitié environ 5 h plus tard : le café de 16 h compte encore au coucher.',
      ],
      concepts: ['Adénosine', 'Récepteur', 'Caféine', 'Demi-vie'],
    },
  ],
}
