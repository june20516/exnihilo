import type { ClauseSpec } from '@/game/content/enemies'

/** 보드·렌더·해석기 테스트용 고정 문장: "[독을 뿜는] 거미가 당신을 물어뜯는다". 테스트 파일에서만 import한다. */
export const SPIDER_SENTENCE: readonly ClauseSpec[] = [
  {
    frameId: 'transitive',
    slots: [
      { role: 'subject', head: 'spider', modifiers: ['venomous'] },
      { role: 'object', head: 'you' },
      { role: 'verb', head: 'bite' },
    ],
  },
]
