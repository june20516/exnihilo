import type { EmotionDef } from './types'

/** 모든 출연자가 갖는 공용 감정 4개. mind.emotions에 펼쳐 넣는다. */
export const COMMON_EMOTION_DEFS: readonly EmotionDef[] = [
  {
    id: 'irritation',
    name: '짜증',
    stageNames: ['짜증 남', '폭발 직전'],
    stageLines: ['슬슬 짜증이 난다', '폭발 직전이다'],
    accumulate: '{reasons:을} 참던',
  },
  {
    id: 'excitement',
    name: '흥분',
    stageNames: ['들뜸', '주체 못 함'],
    stageLines: ['들썩이기 시작한다', '주체를 못 한다'],
    accumulate: '{reasons:에} 들뜬',
  },
  {
    id: 'anxiety',
    name: '불안',
    stageNames: ['불안함', '패닉 직전'],
    stageLines: ['불안한 눈치다', '패닉 직전이다'],
    accumulate: '{reasons:에} 겁먹은',
  },
  {
    id: 'boredom',
    name: '지루함',
    stageNames: ['지루함', '딴짓 직전'],
    stageLines: ['지루한 기색이다', '딴짓 직전이다'],
    accumulate: '{reasons:에} 지친',
  },
]
