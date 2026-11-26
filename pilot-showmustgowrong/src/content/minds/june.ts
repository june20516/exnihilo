import { COMMON_BURSTS, COMMON_HABITS, COMMON_SENSITIVITIES, SILENCE_BOREDOM_LABEL, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'

/** 준: 정적이면 수다 욕구가 쌓여 옛날이야기를 늘어놓는다. 소음엔 쉽게 놀란다 */
export const JUNE_MIND: MindDef = {
  emotions: [
    ...COMMON_EMOTION_DEFS,
    {
      id: 'chatter',
      name: '수다 욕구',
      stageNames: ['입이 근질', '수다 폭발 직전'],
      stageLines: ['입이 근질거린다', '말을 참지 못할 것 같다'],
      accumulate: '{reasons:에} 입이 근질거리던',
    },
  ],
  sensitivities: withSensitivities(COMMON_SENSITIVITIES, [
    {
      emotion: 'chatter',
      on: 'situation',
      situation: { kind: 'silence' },
      perShowMinute: 9,
      fadePerShowMinute: 20,
      label: { noun: '정적', clause: '한참 조용한' },
    },
    { emotion: 'anxiety', on: 'event', kind: 'noise', scope: 'perceived', amount: 12 },
    {
      emotion: 'anxiety',
      on: 'situation',
      situation: { kind: 'nearTag', tag: 'athlete', present: true },
      perShowMinute: 2,
      label: { noun: '덩치 큰 옆자리', clause: '덩치 큰 옆자리에 앉은' },
    },
    {
      emotion: 'boredom',
      on: 'situation',
      situation: { kind: 'silence' },
      perShowMinute: 3,
      label: SILENCE_BOREDOM_LABEL,
    },
  ]),
  bursts: {
    ...COMMON_BURSTS,
    chatter: {
      small: {
        action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] },
        line: '옛날 얘기를 한 토막 꺼낸다',
      },
      big: {
        action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 2, target: 'none' }] },
        line: '"우리 때는 말이야" 하고 옛날이야기를 늘어놓는다',
      },
    },
  },
  habits: [
    ...COMMON_HABITS,
    {
      id: 'doze',
      line: '꾸벅 존다',
      recall: '졸던',
      noun: '졸음',
      pose: 'idle',
      weight: 2,
      boost: { emotion: 'boredom', factor: 2 },
    },
    {
      id: 'candyBag',
      line: '사탕 봉지를 바스락거린다',
      recall: '사탕 봉지를 만지던',
      noun: '바스락 소리',
      pose: 'idle',
      stir: { kind: 'noise', target: 'none' },
      weight: 2,
    },
    {
      id: 'candy',
      line: '사탕을 권한다',
      targetLine: '{target:에게} 사탕을 권한다',
      recall: '사탕을 권하던',
      noun: '사탕 권하기',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'nearestPerformer' },
      weight: 2,
    },
    {
      id: 'story',
      line: '"우리 때는 말이야…" 하고 운을 뗀다',
      recall: '운을 떼던',
      noun: '옛날 얘기',
      pose: 'laugh',
      stir: { kind: 'noise', target: 'none' },
      weight: 2,
      boost: { emotion: 'chatter', factor: 2 },
    },
    {
      id: 'laughAlong',
      line: '따라 웃는다',
      targetLine: '{target:와} 함께 웃는다',
      recall: '따라 웃던',
      noun: '맞장구 웃음',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['laughter'], chance: 0.6 },
    },
  ],
}
