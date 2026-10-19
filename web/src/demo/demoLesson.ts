import type { Block } from '../lib/blocks'
import { lang } from '../lib/i18n'

/** The demo is content, not interface: each language has its own hand-written version. */
interface DemoLesson {
  id: 'demo'
  title: string
  objective: string
  sip_title: string
  blocks: Block[]
}

interface DemoPath {
  wish: string
  modules: { title: string; lessons: string[] }[]
  lessons: number
}

const FR_LESSON: DemoLesson = {
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

/** The request this lesson answers and the path Sipp built from it, shown before the demo so the lesson reads as one example, not the app's topic. */
const FR_PATH: DemoPath = {
  wish: 'Je bois trois cafés par jour. Je veux comprendre ce que ça fait à mon cerveau.',
  modules: [
    { title: 'Ce que fait la caféine', lessons: ['Pourquoi le café nous réveille', 'Pourquoi il en faut toujours plus'] },
    { title: 'Café et sommeil', lessons: [] },
    { title: 'Doser sans se priver', lessons: [] },
  ],
  lessons: 8,
}

const EN_LESSON: DemoLesson = {
  id: 'demo',
  title: 'Why coffee wakes us up',
  objective: 'Understand how caffeine dampens the sleepiness signal and why its effect can last for hours.',
  sip_title: 'Coffee and your brain',
  blocks: [
    {
      type: 'hook',
      question: 'A coffee wakes you up in 20 minutes. But **what does it actually do** in your brain?',
      teaser: 'In five minutes, you’ll know why your 4 pm coffee still matters at bedtime.',
      answer: 'It **blocks a sleepiness signal** without erasing your need for sleep, and half of it is still there **5 hours later**.',
    },
    {
      type: 'predict',
      kind: 'number',
      prompt: 'How many hours do you think your body takes to clear **half** the caffeine in a coffee?',
      min: 0,
      max: 12,
      step: 0.5,
      answer: 5,
      unit: 'h',
      reveal: 'About **5 hours** in adults, with big differences from one person to the next. That’s called the **half-life**.',
    },
    {
      type: 'concept',
      name: 'Adenosine: a sleepiness signal',
      definition: 'Adenosine is a molecule that makes you want to sleep.',
      explanation: 'The longer you stay awake, the more it builds up. It binds to **receptors**, docking spots on your cells, and that signal pushes you toward sleep.',
    },
    {
      type: 'concept',
      name: 'Caffeine: a blocker',
      definition: 'Caffeine sits on adenosine’s receptors without switching them on.',
      explanation: 'Less of the sleepiness signal gets through, so you feel more alert. But the adenosine is still there, and so is your need for sleep.',
    },
    {
      type: 'analogy',
      source: 'Locks and two keys',
      target: 'Adenosine receptors',
      explanation: 'Adenosine is the key that opens the door to sleep. Caffeine is a fake key: it slides into the lock, won’t turn, and keeps the real one out.',
      mappings: [
        { source: 'Lock', target: 'Receptor' },
        { source: 'Real key', target: 'Adenosine' },
        { source: 'Stuck fake key', target: 'Caffeine' },
      ],
      limits: 'A simplified picture: your sleep also depends on your body clock.',
    },
    {
      type: 'question',
      kind: 'single_choice',
      prompt: 'You feel more alert after a coffee. Why?',
      options: [
        { id: 'a', text: 'Caffeine destroys adenosine.' },
        { id: 'b', text: 'Caffeine blocks adenosine’s receptors.' },
        { id: 'c', text: 'Caffeine pays back your lost sleep.' },
      ],
      correct_option_ids: ['b'],
      explanation: 'Caffeine gets in adenosine’s way at its receptors. It doesn’t destroy it, and it doesn’t replace sleep.',
    },
    {
      type: 'simulate',
      prompt: 'Your 4 pm coffee has 100 mg of caffeine. **How much is left** as the evening goes on?',
      parameter: 'Hours after the coffee',
      parameter_unit: 'h',
      output: 'Caffeine left',
      output_unit: 'mg',
      points: [
        { x: 0, y: 100 },
        { x: 2.5, y: 71 },
        { x: 5, y: 50 },
        { x: 7.5, y: 35 },
        { x: 10, y: 25 },
      ],
      start: 0,
      takeaway: 'At 9 pm there’s still **50 mg**, half a coffee. At 2 am, still 25 mg.',
    },
    {
      type: 'swipe',
      prompt: 'True or false?',
      cards: [
        { statement: 'If I no longer feel tired, I’ve recovered.', is_true: false, why: 'Caffeine hides the signal; the need for sleep remains.' },
        { statement: 'Adenosine builds up while you’re awake.', is_true: true, why: 'It’s what raises your sleep pressure.' },
        { statement: 'A coffee at 5 pm can’t change anything by 11 pm.', is_true: false, why: 'With a 5-hour half-life, nearly half of it is still there.' },
        { statement: 'Caffeine’s half-life varies from person to person.', is_true: true, why: 'Age, genetics, pregnancy or smoking change it a lot.' },
      ],
    },
    {
      type: 'fill_blanks',
      text: '{1} pushes you toward sleep. {2} blocks its receptors, without removing the need to sleep.',
      blanks: [{ answer: 'Adenosine' }, { answer: 'Caffeine' }],
      distractors: ['Adrenaline', 'Melatonin'],
      explanation: 'Adenosine makes you sleepy; caffeine gets in its way. The need for sleep stays.',
    },
    {
      type: 'recap',
      points: [
        'Adenosine builds up while you’re awake and pushes you toward sleep.',
        'Caffeine blocks its receptors: you feel alert without having recovered.',
        'About half is still there 5 hours later: a 4 pm coffee still matters at bedtime.',
      ],
      concepts: ['Adenosine', 'Receptor', 'Caffeine', 'Half-life'],
    },
  ],
}

const EN_PATH: DemoPath = {
  wish: 'I drink three coffees a day. I want to understand what it does to my brain.',
  modules: [
    { title: 'What caffeine does', lessons: ['Why coffee wakes us up', 'Why you always need more'] },
    { title: 'Coffee and sleep', lessons: [] },
    { title: 'Dosing without giving it up', lessons: [] },
  ],
  lessons: 8,
}

export const DEMO_LESSON = lang === 'fr' ? FR_LESSON : EN_LESSON
export const DEMO_PATH = lang === 'fr' ? FR_PATH : EN_PATH
