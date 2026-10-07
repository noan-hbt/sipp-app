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
  | RecapBlock

/** Blocks the learner must answer before continuing. */
export function isInteractive(b: Block) {
  return b.type === 'question' || b.type === 'misconception' || b.type === 'fill_blanks' || b.type === 'match' || b.type === 'estimate'
}

/** Graded blocks count toward the lesson score (open questions are not graded). */
export function isGraded(b: Block) {
  return isInteractive(b) && !(b.type === 'question' && b.kind === 'open')
}
