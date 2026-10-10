// Mirrors backend/app/pipeline/blocks.py

export interface TextBlock { type: 'text'; content: string }
export interface ConceptBlock { type: 'concept'; name: string; definition: string; explanation: string }
export interface ExampleBlock { type: 'example'; title: string; content: string }
export interface ScenarioBlock { type: 'scenario'; setting: string; narrative: string; prompt?: string }
export interface AnalogyBlock {
  type: 'analogy'
  source: string
  target: string
  explanation: string
  mappings: { source: string; target: string }[]
  limits?: string
}
export interface ComparisonBlock {
  type: 'comparison'
  title: string
  dimensions: string[]
  items: { name: string; values: string[] }[]
  takeaway?: string
}
export interface SequenceBlock { type: 'sequence'; title: string; steps: { title: string; description: string }[] }
export interface CauseEffectBlock { type: 'cause_effect'; title: string; chain: { label: string; explanation?: string }[] }
export interface CodeBlock { type: 'code'; language: string; code: string; explanation: string; caption?: string }
export interface MathBlock {
  type: 'math'
  latex: string
  explanation: string
  variables?: { symbol: string; meaning: string }[]
}
export interface MisconceptionBlock { type: 'misconception'; statement: string; is_true: boolean; correction: string }
export interface QuestionBlock {
  type: 'question'
  kind: 'single_choice' | 'multiple_choice' | 'true_false' | 'open'
  prompt: string
  options?: { id: string; text: string }[]
  correct_option_ids?: string[]
  answer?: boolean
  expected_answer?: string
  explanation: string
}
export interface FillBlanksBlock {
  type: 'fill_blanks'
  text: string
  blanks: { answer: string }[]
  distractors: string[]
  explanation: string
}
export interface MatchBlock { type: 'match'; prompt: string; pairs: { left: string; right: string }[]; explanation: string }
export interface EstimateBlock {
  type: 'estimate'
  prompt: string
  min: number
  max: number
  step: number
  answer: number
  tolerance: number
  unit?: string | null
  explanation: string
}
export interface ApplicationBlock { type: 'application'; prompt: string; guidance?: string; optional?: boolean }
export interface RecapBlock { type: 'recap'; points: string[]; concepts?: string[] }
export interface HookBlock { type: 'hook'; question: string; teaser: string; answer: string }
export interface PredictBlock {
  type: 'predict'
  kind: 'number' | 'choice'
  prompt: string
  min?: number | null
  max?: number | null
  step?: number | null
  answer?: number | null
  unit?: string | null
  options?: { id: string; text: string }[]
  answer_id?: string | null
  reveal: string
}
export interface SwipeBlock { type: 'swipe'; prompt?: string | null; cards: { statement: string; is_true: boolean; why: string }[] }
export interface SimulateBlock {
  type: 'simulate'
  prompt: string
  parameter: string
  parameter_unit?: string | null
  output: string
  output_unit?: string | null
  points: { x: number; y: number }[]
  start?: number
  takeaway: string
}

export type Block =
  | TextBlock
  | ConceptBlock
  | ExampleBlock
  | ScenarioBlock
  | AnalogyBlock
  | ComparisonBlock
  | SequenceBlock
  | CauseEffectBlock
  | CodeBlock
  | MathBlock
  | MisconceptionBlock
  | QuestionBlock
  | FillBlanksBlock
  | MatchBlock
  | EstimateBlock
  | ApplicationBlock
  | HookBlock
  | PredictBlock
  | SwipeBlock
  | SimulateBlock
  | RecapBlock

/** Blocks the learner must answer before continuing. */
export function isInteractive(b: Block) {
  return (
    b.type === 'question' || b.type === 'misconception' || b.type === 'fill_blanks' || b.type === 'match' ||
    b.type === 'estimate' || b.type === 'predict' || b.type === 'swipe'
  )
}

/** Graded blocks count toward the lesson score (open questions and bets are not graded). */
export function isGraded(b: Block) {
  return isInteractive(b) && b.type !== 'predict' && !(b.type === 'question' && b.kind === 'open')
}

/** Blocks that show their own result in place: no feedback sheet after them. */
export function selfFeedback(b: Block) {
  return b.type === 'predict' || b.type === 'swipe'
}

/** Checks inside a block: a swipe holds one per card. */
export function checksIn(b: Block) {
  return b.type === 'swipe' ? b.cards.length : isGraded(b) ? 1 : 0
}

/** LLM markup stripped: **bold**, `code`, $math$ keep their words only. */
export const plain = (s?: string | null) =>
  (s ?? '').replace(/\\$/g, '$').replace(/\*\*|`|\$/g, '').replace(/\s+/g, ' ').trim()

const join = (...parts: (string | null | undefined | false)[]) =>
  parts.map((p) => plain(p || '')).filter(Boolean).map((p) => (/[.!?:…]$/.test(p) ? p : `${p}.`)).join(' ')

/** What a block says, as plain sentences: read aloud, or kept as a note. Answers are never included. */
export function blockText(b: Block): string {
  switch (b.type) {
    case 'text': return join(b.content)
    case 'concept': return join(b.name, b.definition, b.explanation)
    case 'example': return join(b.title, b.content)
    case 'scenario': return join(b.setting, b.narrative, b.prompt)
    case 'analogy': return join(`${b.source} et ${b.target}`, b.explanation, ...b.mappings.map((m) => `${m.source} : ${m.target}`), b.limits)
    case 'comparison': return join(b.title, ...b.items.map((it) => `${it.name} : ${it.values.join(', ')}`), b.takeaway)
    case 'sequence': return join(b.title, ...b.steps.map((s, i) => `${i + 1}. ${s.title} : ${s.description}`))
    case 'cause_effect': return join(b.title, ...b.chain.map((c) => (c.explanation ? `${c.label} : ${c.explanation}` : c.label)))
    case 'code': return join(b.caption, b.explanation)
    case 'math': return join(b.explanation, ...(b.variables ?? []).map((v) => `${v.symbol} : ${v.meaning}`))
    case 'misconception': return join('Vrai ou faux', b.statement)
    case 'question': return join(b.prompt, ...(b.options ?? []).map((o) => o.text))
    case 'fill_blanks': return join(b.text.replace(/\{\d+\}/g, '…'))
    case 'match': return join(b.prompt)
    case 'estimate': return join(b.prompt)
    case 'application': return join(b.prompt, b.guidance)
    case 'hook': return join(b.question, b.teaser)
    case 'predict': return join(b.prompt, ...(b.options ?? []).map((o) => o.text))
    case 'swipe': return join('Vrai ou faux', b.prompt, ...b.cards.map((c) => c.statement))
    case 'simulate': return join(b.prompt, b.takeaway)
    case 'recap': return join('À retenir', ...b.points)
  }
}

/** Content worth keeping as a note: what teaches, not what tests. */
export const isKeepable = (b: Block) => !isInteractive(b) && b.type !== 'application' && b.type !== 'hook' && b.type !== 'simulate'
