import { COMMON_BURSTS, COMMON_HABITS, COMMON_SENSITIVITIES, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'

/** 오카포: 자기를 향한 웃음·분노에 짜증이 쌓여 기여가 큰 사람에게 버럭한다 */
export const OKAFOR_MIND: MindDef = {
  emotions: [...COMMON_EMOTION_DEFS],
  baseline: { irritation: 10 },
  sensitivities: withSensitivities(COMMON_SENSITIVITIES, [
    { emotion: 'irritation', on: 'event', kind: 'laughter', scope: 'targetsSelf', amount: 25 },
    { emotion: 'irritation', on: 'event', kind: 'anger', scope: 'targetsSelf', amount: 20 },
    { emotion: 'anxiety', on: 'event', kind: 'impact', scope: 'targetsSelf', amount: 20 },
  ]),
  bursts: {
    ...COMMON_BURSTS,
    irritation: {
      ...COMMON_BURSTS.irritation,
      big: {
        ...COMMON_BURSTS.irritation.big,
        targetLine: '{target:에게} 학위를 들먹이며 버럭한다',
      },
    },
  },
  habits: [
    ...COMMON_HABITS,
    {
      id: 'glasses',
      line: '안경을 치켜올린다',
      recall: '안경을 치켜올리던',
      noun: '안경 치켜올리기',
      pose: 'idle',
      weight: 2,
    },
    {
      id: 'mutter',
      line: '논문 얘기를 꺼내려다 만다',
      recall: '중얼거리던',
      noun: '중얼거림',
      pose: 'idle',
      stir: { kind: 'noise', target: 'none' },
      weight: 2,
    },
    {
      id: 'glare',
      line: '노려본다',
      targetLine: '{target:을} 노려본다',
      recall: '노려보던',
      noun: '노려보기',
      pose: 'angry',
      stir: { kind: 'anger', target: 'topContributor' },
      weight: 2,
      boost: { emotion: 'irritation', factor: 2 },
      when: [{ kind: 'stage', emotion: 'irritation', atLeast: 1 }],
    },
    {
      id: 'card',
      line: '명함을 만지작거린다',
      recall: '명함을 만지던',
      noun: '명함 만지기',
      pose: 'idle',
      weight: 2,
    },
    {
      id: 'tie',
      line: '헛기침을 하며 넥타이를 고쳐 맨다',
      recall: '넥타이를 고쳐 매던',
      noun: '헛기침',
      pose: 'idle',
      stir: { kind: 'anger', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['laughter', 'anger'], chance: 0.7 },
    },
  ],
}
