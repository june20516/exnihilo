import { COMMON_BURSTS, COMMON_HABITS, COMMON_SENSITIVITIES, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'

/** 모: 분노·소음·충돌에 흥분이 쌓여 바디슬램한다. 관객 앞에서 달아오른다 */
export const MO_MIND: MindDef = {
  emotions: [...COMMON_EMOTION_DEFS],
  sensitivities: withSensitivities(COMMON_SENSITIVITIES, [
    { emotion: 'excitement', on: 'event', kind: 'anger', scope: 'perceived', amount: 15 },
    { emotion: 'excitement', on: 'event', kind: 'noise', scope: 'perceived', amount: 10 },
    { emotion: 'excitement', on: 'event', kind: 'impact', scope: 'targetsSelf', amount: 25 },
    { emotion: 'irritation', on: 'event', kind: 'laughter', scope: 'targetsSelf', amount: 5 },
    {
      emotion: 'excitement',
      on: 'situation',
      situation: { kind: 'showTrait', trait: 'studioAudience' },
      perShowMinute: 2,
      label: { noun: '관객의 함성', clause: '관객 앞에서 달아오른' },
    },
  ]),
  bursts: {
    ...COMMON_BURSTS,
    excitement: {
      ...COMMON_BURSTS.excitement,
      big: {
        action: {
          pose: 'angry',
          move: { type: 'leap', toward: 'cause', speed: 8 },
          emits: [],
        },
        line: '허공에 바디슬램을 날린다',
        targetLine: '{target:에게} 바디슬램을 날린다',
      },
    },
  },
  habits: [
    ...COMMON_HABITS,
    {
      id: 'neck',
      line: '목을 좌우로 꺾는다(우두둑)',
      recall: '목을 꺾던',
      noun: '목 꺾는 소리',
      pose: 'idle',
      stir: { kind: 'noise', target: 'none' },
      weight: 2,
    },
    {
      id: 'flex',
      line: '관객석을 향해 이두근을 자랑한다',
      recall: '근육 자랑하던',
      noun: '근육 자랑',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'none' },
      weight: 2,
      boost: { emotion: 'excitement', factor: 2 },
      when: [{ kind: 'showTrait', trait: 'studioAudience' }],
    },
    {
      id: 'pat',
      line: '어깨를 툭 친다',
      targetLine: '{target}의 어깨를 툭 친다',
      recall: '어깨를 치던',
      noun: '어깨 툭',
      pose: 'idle',
      stir: { kind: 'noise', target: 'nearestPerformer' },
      weight: 2,
    },
    {
      id: 'hum',
      line: '링 입장 테마를 흥얼거린다',
      recall: '흥얼거리던',
      noun: '흥얼거림',
      pose: 'idle',
      stir: { kind: 'noise', target: 'none' },
      weight: 2,
    },
    {
      id: 'fist',
      line: '주먹을 쥐었다 편다',
      targetLine: '{target:을} 보며 주먹을 쥐었다 편다',
      recall: '주먹을 쥐던',
      noun: '주먹 쥐기',
      pose: 'angry',
      stir: { kind: 'anger', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['anger'], chance: 0.5 },
    },
  ],
}
