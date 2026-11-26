import { COMMON_BURSTS, COMMON_HABITS, COMMON_SENSITIVITIES, SILENCE_BOREDOM_LABEL, withSensitivities } from '../commonMind'
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
    {
      emotion: 'boredom',
      on: 'situation',
      situation: { kind: 'silence' },
      // 공용(4.5)과 프리야(6) 사이로 두어 정적 지루함이 출연자마다 다른 때 차오르게 한다(Task 10)
      perShowMinute: 5.5,
      label: SILENCE_BOREDOM_LABEL,
    },
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
      line: '"학술적으로는 틀린 말입니다" 하고 정색한다',
      recall: '정색하던',
      noun: '정색',
      pose: 'idle',
      stir: { kind: 'anger', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['laughter', 'anger'], chance: 0.7 },
    },
  ],
}
