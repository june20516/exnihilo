import { COMMON_BURSTS, COMMON_HABITS, COMMON_SENSITIVITIES, SILENCE_BOREDOM_LABEL, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'

/** 프리야: 웃음과 소음에 쉽게 들뜨고 정적을 못 견딘다 */
export const PRIYA_MIND: MindDef = {
  emotions: [...COMMON_EMOTION_DEFS],
  sensitivities: withSensitivities(COMMON_SENSITIVITIES, [
    { emotion: 'excitement', on: 'event', kind: 'laughter', scope: 'perceived', amount: 12 },
    { emotion: 'excitement', on: 'event', kind: 'noise', scope: 'perceived', amount: 8 },
    { emotion: 'irritation', on: 'event', kind: 'anger', scope: 'targetsSelf', amount: 8 },
    {
      emotion: 'boredom',
      on: 'situation',
      situation: { kind: 'silence' },
      // 정적을 못 견뎌 공용(4.5)보다 빠르다. 8이면 방송당 큰 터짐이 두 번 나는 일이 잦았다(Task 10)
      perShowMinute: 6,
      label: SILENCE_BOREDOM_LABEL,
    },
  ]),
  bursts: { ...COMMON_BURSTS },
  habits: [
    ...COMMON_HABITS,
    {
      id: 'giggle',
      line: '킥킥댄다',
      targetLine: '{target:을} 보며 킥킥댄다',
      recall: '킥킥대던',
      noun: '킥킥거림',
      pose: 'laugh',
      stir: { kind: 'laughter', target: { tag: 'guest' } },
      weight: 3,
    },
    {
      id: 'hold',
      line: '웃음을 참느라 어깨를 들썩인다',
      recall: '웃음을 참던',
      noun: '웃음 참기',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'none' },
      weight: 2,
      boost: { emotion: 'excitement', factor: 2 },
    },
    {
      id: 'phone',
      line: '휴대폰을 몰래 확인한다',
      recall: '휴대폰을 보던',
      noun: '휴대폰 보기',
      pose: 'idle',
      weight: 2,
      when: [{ kind: 'offScreen' }],
    },
    {
      id: 'whisper',
      line: '귓속말을 한다',
      targetLine: '{target:에게} 귓속말을 한다',
      recall: '귓속말하던',
      noun: '귓속말',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'nearestPerformer' },
      weight: 2,
    },
    {
      id: 'kidding',
      line: '"농담이에요~" 하며 손을 내젓는다',
      recall: '손을 내젓던',
      noun: '너스레',
      pose: 'laugh',
      stir: { kind: 'laughter', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['anger'], chance: 0.6 },
    },
  ],
}
