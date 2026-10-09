import { useState } from 'react'
import { BlockView, type Answer } from '../blocks/Blocks'
import type * as B from '../lib/blocks'

// Dev only (/dev/blocks): every block type with long, awkward content, to check layouts at phone width.
const BLOCKS: B.Block[] = [
  {
    type: 'comparison',
    title: 'Taux fixe ou taux variable ?',
    dimensions: ['Mensualité', 'Si les taux montent', 'Pour qui'],
    items: [
      { name: 'Taux fixe', values: ['Identique pendant toute la durée du prêt, quel que soit le marché', 'Rien ne change pour toi', 'Ceux qui veulent un budget prévisible'] },
      { name: 'Taux variable capé', values: ['Évolue chaque année selon l’Euribor, dans la limite du cap', 'Elle augmente, jusqu’au plafond prévu au contrat (souvent +1 ou +2 points)', 'Ceux qui peuvent absorber une hausse'] },
    ],
    takeaway: 'Le fixe achète de la tranquillité, le variable parie sur la baisse.',
  },
  {
    type: 'comparison',
    title: 'Livret A ou assurance-vie ?',
    dimensions: ['Plafond', 'Disponibilité', 'Fiscalité'],
    items: [
      { name: 'Livret A', values: ['22 950 €', 'Immédiate', 'Aucun impôt'] },
      { name: 'Assurance-vie', values: ['Aucun', 'Quelques jours', 'Allégée après 8 ans'] },
    ],
  },
  {
    type: 'comparison',
    title: 'Trois façons de conserver la chaleur',
    dimensions: ['Principe', 'Exemple', 'Efficacité'],
    items: [
      { name: 'Conduction', values: ['Contact direct entre deux corps', 'Une casserole sur la plaque', 'Forte dans les métaux'] },
      { name: 'Convection', values: ['Mouvement d’un fluide', 'L’air chaud qui monte au plafond', 'Moyenne'] },
      { name: 'Rayonnement', values: ['Ondes électromagnétiques, sans support', 'Le soleil qui chauffe ta peau', 'Dépend de la surface'] },
      { name: 'Évapotranspiration', values: ['Changement d’état', 'La sueur qui sèche', 'Très forte'] },
    ],
  },
  {
    type: 'analogy',
    source: 'Une banque centrale',
    target: 'Le thermostat de l’économie',
    explanation: 'Elle monte ou baisse les taux pour garder une température stable.',
    mappings: [
      { source: 'Monter le chauffage', target: 'Baisser les taux directeurs pour relancer le crédit' },
      { source: 'Ouvrir la fenêtre', target: 'Remonter les taux pour freiner l’inflation' },
    ],
    limits: 'Un thermostat réagit en minutes, une banque centrale en trimestres.',
  },
  {
    type: 'code',
    language: 'python',
    caption: 'Calcul d’intérêts composés',
    code: 'def capital_final(capital_initial: float, taux_annuel: float, annees: int, versement_mensuel: float = 0.0) -> float:\n    capital = capital_initial\n    for _ in range(annees * 12):\n        capital = capital * (1 + taux_annuel / 12) + versement_mensuel  # intérêts puis versement du mois\n    return round(capital, 2)',
    explanation: 'Chaque mois, les intérêts s’ajoutent au capital, puis le versement.',
  },
  {
    type: 'math',
    latex: 'C_n = C_0 \\left(1 + \\frac{r}{12}\\right)^{12n} + V \\cdot \\frac{\\left(1 + \\frac{r}{12}\\right)^{12n} - 1}{\\frac{r}{12}}',
    explanation: 'Le capital final cumule la croissance du capital de départ et celle de chaque versement.',
    variables: [{ symbol: 'C_0', meaning: 'capital de départ' }, { symbol: 'r', meaning: 'taux annuel' }],
  },
  {
    type: 'sequence',
    title: 'De la demande au prêt',
    steps: [
      { title: 'Tu montes ton dossier', description: 'Revenus, apport, relevés.' },
      { title: 'La banque étudie ton taux d’endettement', description: 'Il doit rester sous 35 %.' },
    ],
  },
  {
    type: 'match',
    prompt: 'Relie chaque notion à sa définition',
    pairs: [
      { left: 'Inflation', right: 'Hausse générale et durable des prix' },
      { left: 'Taux directeur', right: 'Taux auquel les banques se refinancent auprès de la banque centrale' },
      { left: 'Euribor', right: 'Taux moyen des prêts entre grandes banques européennes' },
    ],
    explanation: 'Ces trois notions sont liées.',
  },
  {
    type: 'fill_blanks',
    text: 'Quand la banque centrale ___ ses taux, le crédit devient plus ___.',
    blanks: [{ answer: 'monte' }, { answer: 'cher' }],
    distractors: ['baisse', 'facile'],
    explanation: 'Monter les taux renchérit le crédit.',
  },
  {
    type: 'estimate',
    prompt: 'À combien était l’inflation en France en 2023 ?',
    min: 0,
    max: 10,
    step: 0.1,
    answer: 4.9,
    tolerance: 0.5,
    unit: '%',
    explanation: 'Environ 4,9 % en moyenne annuelle.',
  },
  {
    type: 'question',
    kind: 'single_choice',
    prompt: 'Que se passe-t-il quand les taux montent ?',
    options: [
      { id: 'a', text: 'Le crédit coûte plus cher, la demande ralentit' },
      { id: 'b', text: 'Les prix montent immédiatement' },
    ],
    correct_option_ids: ['a'],
    explanation: 'Le crédit plus cher freine la demande.',
  },
]

export function BlockGallery() {
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  return (
    <div className="scroll" style={{ padding: '20px 20px 120px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {BLOCKS.map((b, i) => (
          <div key={i} data-block={b.type}>
            <BlockView block={b} answer={answers[i]} onAnswer={(a) => setAnswers((s) => ({ ...s, [i]: a }))} />
          </div>
        ))}
      </div>
    </div>
  )
}
