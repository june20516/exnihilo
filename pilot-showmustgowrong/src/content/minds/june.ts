import { COMMON_HABITS, COMMON_SENSITIVITIES, SILENCE_BOREDOM_LABEL, withBurstTexts, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'
import { tuned } from '../tuning'

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
      perShowMinute: tuned('mind.june.chatter.silence.perShowMinute'),
      fadePerShowMinute: tuned('mind.june.chatter.silence.fadePerShowMinute'),
      label: { noun: '밋밋한 진행', clause: '한참 끼어들 틈만 보던' },
    },
    { emotion: 'anxiety', on: 'event', kind: 'noise', scope: 'perceived', amount: 12 },
    {
      emotion: 'anxiety',
      on: 'situation',
      situation: { kind: 'nearTag', tag: 'athlete', present: true },
      perShowMinute: tuned('mind.june.anxiety.nearTag.perShowMinute'),
      label: { noun: '덩치 큰 옆자리', clause: '덩치 큰 옆자리에 앉은' },
    },
    {
      emotion: 'boredom',
      on: 'situation',
      situation: { kind: 'silence' },
      perShowMinute: tuned('mind.june.boredom.silence.perShowMinute'),
      label: SILENCE_BOREDOM_LABEL,
    },
  ]),
  bursts: {
    ...withBurstTexts({
      irritation: {
        small: {
          line: '"요즘 젊은 사람들은…" 하고 혀를 찬다',
          targetLine: '{target:을} 보며 "요즘 젊은 사람들은…" 하고 혀를 찬다',
        },
        big: {
          line: '지팡이로 바닥을 쾅 치며 호통친다',
          targetLine: '{target:에게} 지팡이로 바닥을 쾅 치며 호통친다',
          intenseLine: '호통 끝에 욕설을 퍼붓는다! (삐—)',
        },
      },
      excitement: {
        small: { line: '무릎을 치며 껄껄 웃는다' },
        big: { line: '벌떡 일어나 덩실덩실 춤을 춘다' },
      },
      anxiety: {
        small: { line: '"아이고 깜짝이야" 하고 가슴을 쓸어내린다' },
        big: { line: '"아이고 나 죽네" 하며 뒷걸음질한다' },
      },
      boredom: {
        small: { line: '보청기를 툭툭 친다' },
        big: {
          line: '손주 자랑을 늘어놓는다',
          targetLine: '{target:에게} 다가가 손주 사진을 보여 준다',
        },
      },
    }),
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
      emote: '😴',
      pose: 'idle',
      weight: 2,
      boost: { emotion: 'boredom', factor: 2 },
    },
    {
      id: 'candyBag',
      line: '사탕 봉지를 바스락거린다',
      recall: '사탕 봉지를 만지던',
      noun: '바스락 소리',
      emote: '🍬',
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
      emote: '🍭',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'nearestPerformer' },
      weight: 2,
    },
    {
      id: 'story',
      line: '"우리 때는 말이야…" 하고 운을 뗀다',
      recall: '운을 떼던',
      noun: '옛날 얘기',
      emote: '📖',
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
      emote: '😄',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['laughter'], chance: 0.6 },
    },
  ],
}
