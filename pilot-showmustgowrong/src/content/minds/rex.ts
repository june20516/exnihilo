import { COMMON_HABITS, COMMON_SENSITIVITIES, SILENCE_BOREDOM_LABEL, withBurstTexts, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'

/** 렉스: 화면에 안 잡히면 주목 욕구가 쌓여 카메라로 돌진한다. 비웃음엔 짜증 */
export const REX_MIND: MindDef = {
  emotions: [
    ...COMMON_EMOTION_DEFS,
    {
      id: 'attention',
      name: '주목 욕구',
      stageNames: ['화면 갈증', '카메라 집착'],
      stageLines: ['카메라를 힐끔거린다', '화면에 목말라 있다'],
      accumulate: '{reasons:에} 애가 탄',
    },
  ],
  sensitivities: withSensitivities(COMMON_SENSITIVITIES, [
    { emotion: 'irritation', on: 'event', kind: 'laughter', scope: 'targetsSelf', amount: 25 },
    {
      emotion: 'attention',
      on: 'situation',
      situation: { kind: 'offScreen' },
      perShowMinute: 7,
      fadePerShowMinute: 40,
      label: { noun: '무시', clause: '한참 화면에 안 잡힌' },
    },
    {
      emotion: 'boredom',
      on: 'situation',
      situation: { kind: 'silence' },
      perShowMinute: 4,
      label: SILENCE_BOREDOM_LABEL,
    },
  ]),
  bursts: {
    ...withBurstTexts({
      irritation: {
        small: {
          line: '방송용 미소를 유지한 채 이를 간다',
          targetLine: '{target:을} 보며 방송용 미소를 유지한 채 이를 간다',
        },
        big: {
          line: '방송용 미소를 벗어던지고 버럭한다',
          targetLine: '{target:에게} 방송용 미소를 벗어던지고 버럭한다',
          intenseLine: '생방송인 걸 잊고 욕설을 퍼붓는다! (삐—)',
        },
      },
      excitement: {
        small: { line: '과장되게 박수를 친다' },
        big: { line: '펄쩍 뛰며 "바로 이거죠!"를 외친다' },
      },
      anxiety: {
        small: { line: '큐카드를 떨어뜨릴 뻔한다' },
        big: { line: '"잠시 광고 보고 오겠습니다!"를 외치며 뒷걸음질한다' },
      },
      boredom: {
        small: { line: '모니터에 비친 자기 얼굴을 확인한다' },
        big: {
          line: '진행을 가로채 자기 얘기를 꺼낸다',
          targetLine: '{target:에게} 다가가 말을 끊고 자기 얘기를 꺼낸다',
        },
      },
    }),
    attention: {
      small: {
        action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
        line: '카메라를 향해 크게 헛기침한다',
      },
      big: {
        action: {
          pose: 'angry',
          move: { type: 'dash', toward: 'onAirCamera', speed: 9 },
          emits: [{ kind: 'anger', intensity: 2, target: 'none' }],
        },
        line: '카메라로 돌진한다',
        intenseLine: '카메라로 돌진하며 욕설을 퍼붓는다! (삐—)',
      },
    },
  },
  habits: [
    ...COMMON_HABITS,
    {
      id: 'tie',
      line: '넥타이를 고쳐 맨다',
      recall: '넥타이를 매만지던',
      noun: '넥타이 매만지기',
      pose: 'idle',
      weight: 2,
    },
    {
      id: 'nose',
      line: '코를 판다',
      recall: '코를 파던',
      noun: '코 파기',
      pose: 'idle',
      stir: { kind: 'exposure', target: 'none' },
      weight: 2,
      when: [{ kind: 'offScreen' }],
    },
    {
      id: 'smile',
      line: '카메라 쪽으로 미소를 연습한다',
      recall: '미소를 연습하던',
      noun: '미소 연습',
      pose: 'idle',
      weight: 2,
      boost: { emotion: 'attention', factor: 2 },
      when: [{ kind: 'offScreen' }],
    },
    {
      id: 'cough',
      line: '헛기침을 한다',
      targetLine: '{target:을} 보며 헛기침을 한다',
      recall: '헛기침하던',
      noun: '헛기침',
      pose: 'idle',
      stir: { kind: 'noise', target: { tag: 'guest' } },
      weight: 2,
    },
    {
      id: 'laughOff',
      line: '"하하, 재밌네요" 하고 웃어넘긴다',
      recall: '웃어넘기던',
      noun: '억지웃음',
      pose: 'idle',
      stir: { kind: 'laughter', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['laughter'], chance: 0.5 },
    },
  ],
}
