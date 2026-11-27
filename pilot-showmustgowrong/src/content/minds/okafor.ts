import { COMMON_HABITS, COMMON_SENSITIVITIES, SILENCE_BOREDOM_LABEL, withBurstTexts, withSensitivities } from '../commonMind'
import { COMMON_EMOTION_DEFS } from '../emotions'
import type { MindDef } from '../types'
import { tuned } from '../tuning'

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
      // 속도와 근거는 tuning.ts
      perShowMinute: tuned('mind.okafor.boredom.silence.perShowMinute'),
      label: SILENCE_BOREDOM_LABEL,
    },
  ]),
  bursts: withBurstTexts({
    irritation: {
      small: {
        line: '"정확한 표현이 아닙니다" 하고 끼어든다',
        targetLine: '{target:에게} "정확한 표현이 아닙니다" 하고 끼어든다',
      },
      big: {
        line: '학위를 들먹이며 버럭한다',
        targetLine: '{target:에게} 학위를 들먹이며 버럭한다',
        intenseLine: '학위를 들먹이다 욕설을 퍼붓는다! (삐—)',
      },
    },
    excitement: {
      small: { line: '"흥미롭군요!" 하고 무릎을 친다' },
      big: { line: '벌떡 일어나 "유레카!"를 외친다' },
    },
    anxiety: {
      small: { line: '안경을 떨어뜨린다' },
      big: { line: '"이건 제 전공이 아닙니다" 하며 물러난다' },
    },
    boredom: {
      small: { line: '각주 내용을 혼자 중얼거린다' },
      big: {
        line: '불쑥 강의를 시작한다',
        targetLine: '{target:에게} 다가가 강의를 시작한다',
      },
    },
  }),
  habits: [
    ...COMMON_HABITS,
    {
      id: 'glasses',
      line: '안경을 치켜올린다',
      recall: '안경을 치켜올리던',
      noun: '안경 치켜올리기',
      emote: '🤓',
      pose: 'idle',
      weight: 2,
    },
    {
      id: 'mutter',
      line: '논문 얘기를 꺼내려다 만다',
      recall: '중얼거리던',
      noun: '중얼거림',
      emote: '💬',
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
      emote: '😠',
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
      emote: '📇',
      pose: 'idle',
      weight: 2,
    },
    {
      id: 'tie',
      line: '"학술적으로는 틀린 말입니다" 하고 정색한다',
      recall: '정색하던',
      noun: '정색',
      emote: '🧐',
      pose: 'idle',
      stir: { kind: 'anger', target: 'cause' },
      weight: 2,
      respondsTo: { kinds: ['laughter', 'anger'], chance: 0.7 },
    },
  ],
}
