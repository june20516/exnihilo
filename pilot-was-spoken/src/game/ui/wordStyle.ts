import type { WordKind } from '@/game/grammar/frames'

export const KIND_LABELS: Record<WordKind, string> = {
  target: '명사',
  verbTransitive: '타동사',
  verbIntransitive: '자동사',
  adjective: '형용사',
  adverb: '부사',
  junk: '오염',
  connective: '연결어',
}

/** 품사별 글자색과 태그 배경 (Stitch 시안의 품사 색). */
export const KIND_STYLES: Record<WordKind, { text: string; tag: string }> = {
  target: { text: 'text-on-surface', tag: 'bg-surface-container-highest text-on-surface' },
  verbTransitive: { text: 'text-primary', tag: 'bg-primary-container/60 text-on-primary-container' },
  verbIntransitive: { text: 'text-primary', tag: 'bg-primary-container/60 text-on-primary-container' },
  adjective: { text: 'text-tertiary', tag: 'bg-tertiary-container/40 text-tertiary' },
  adverb: { text: 'text-secondary', tag: 'bg-secondary-container/40 text-secondary' },
  junk: { text: 'text-outline', tag: 'bg-surface-container-highest text-outline' },
  connective: { text: 'text-primary', tag: 'bg-primary/20 text-primary' },
}
