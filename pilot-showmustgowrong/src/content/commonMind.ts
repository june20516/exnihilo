import type {
  BurstAction,
  BurstDef,
  CommonEmotionId,
  HabitDef,
  SensitivityDef,
} from './types'

/** 공용 정적 이유 이름표. 출연자가 정적 민감도의 양만 바꿀 때 그대로 쓴다. */
export const SILENCE_BOREDOM_LABEL = { noun: '정적', clause: '긴 정적에 지친' } as const

/** 모든 출연자가 갖는 공용 민감도. 출연자 mind는 이것을 펼친 뒤 withSensitivities로 덮어쓰거나 더한다. */
export const COMMON_SENSITIVITIES: SensitivityDef[] = [
  { emotion: 'anxiety', on: 'event', kind: 'anger', scope: 'perceived', amount: 8 },
  { emotion: 'irritation', on: 'event', kind: 'anger', scope: 'targetsSelf', amount: 15 },
  { emotion: 'irritation', on: 'event', kind: 'laughter', scope: 'targetsSelf', amount: 10 },
  { emotion: 'excitement', on: 'event', kind: 'laughter', scope: 'perceived', amount: 6 },
  { emotion: 'anxiety', on: 'event', kind: 'noise', scope: 'perceived', amount: 5 },
  { emotion: 'excitement', on: 'event', kind: 'noise', scope: 'perceived', amount: 4 },
  { emotion: 'anxiety', on: 'event', kind: 'impact', scope: 'targetsSelf', amount: 15 },
  { emotion: 'irritation', on: 'event', kind: 'impact', scope: 'targetsSelf', amount: 10 },
  { emotion: 'anxiety', on: 'event', kind: 'darkness', scope: 'perceived', amount: 20 },
  { emotion: 'excitement', on: 'event', kind: 'exposure', scope: 'perceived', amount: 6 },
  {
    emotion: 'boredom',
    on: 'situation',
    situation: { kind: 'silence' },
    // 기준(6)의 0.75배(실제 초당 0.75). 정적이 이어지면 실제 약 67초에 1단계, 다시 약 40초에 2단계다
    // (living spec 1.1의 1단계 목표 40~60초보다 느림, 사용자 확인 항목). 출연자마다 속도를
    // 다르게 두어(프리야 6, 오카포 5.5, 공용 4.5, 렉스 4) 같은 정적에 모두 함께 2단계에 닿지 않게 한다(Task 10).
    perShowMinute: 4.5,
    label: SILENCE_BOREDOM_LABEL,
  },
]

/** 같은 (종류, 범위, 감정) 또는 같은 (상황, 감정) 항목을 찾는 열쇠 */
function sensitivityKey(sensitivity: SensitivityDef): string {
  return sensitivity.on === 'event'
    ? `event|${sensitivity.kind}|${sensitivity.scope}|${sensitivity.emotion}`
    : `situation|${JSON.stringify(sensitivity.situation)}|${sensitivity.emotion}`
}

/** base에 overrides를 순서대로 처리한다. 같은 열쇠의 항목은 그 자리에서 대체하고 없으면 뒤에 더한다. */
export function withSensitivities(
  base: readonly SensitivityDef[],
  overrides: readonly SensitivityDef[],
): SensitivityDef[] {
  const result = [...base]
  for (const override of overrides) {
    const index = result.findIndex((entry) => sensitivityKey(entry) === sensitivityKey(override))
    if (index >= 0) result[index] = override
    else result.push(override)
  }
  return result
}

/** 모든 출연자가 갖는 공용 터짐(작은 것은 강도 1, 큰 것은 강도 2) */
export const COMMON_BURSTS: Record<CommonEmotionId, BurstDef> = {
  irritation: {
    small: {
      action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 1, target: 'cause' }] },
      line: '투덜댄다',
      targetLine: '{target:에게} 투덜댄다',
    },
    big: {
      action: { pose: 'angry', emits: [{ kind: 'anger', intensity: 2, target: 'cause' }] },
      line: '버럭 화를 낸다',
      targetLine: '{target:에게} 버럭 화를 낸다',
      intenseLine: '욕설을 퍼붓는다! (삐—)',
    },
  },
  excitement: {
    small: {
      action: { pose: 'laugh', emits: [{ kind: 'laughter', intensity: 1, target: 'none' }] },
      line: '웃음을 터뜨린다',
    },
    big: {
      action: {
        pose: 'laugh',
        move: { type: 'leap', toward: 'none', speed: 3 },
        emits: [{ kind: 'noise', intensity: 2, target: 'none' }],
      },
      line: '자리에서 펄쩍 뛰며 환호한다',
    },
  },
  anxiety: {
    small: {
      action: { pose: 'panic', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
      line: '"으악" 하고 움찔한다',
    },
    big: {
      action: {
        pose: 'panic',
        move: { type: 'flee', toward: 'cause', speed: 5 },
        emits: [{ kind: 'noise', intensity: 2, target: 'none' }],
      },
      line: '비명을 지르며 물러난다',
    },
  },
  boredom: {
    small: {
      action: { pose: 'idle', emits: [{ kind: 'noise', intensity: 1, target: 'none' }] },
      line: '혼자 딴소리를 한다',
    },
    big: {
      action: {
        pose: 'idle',
        move: { type: 'walk', toward: 'nearestPerformer', speed: 2 },
        emits: [{ kind: 'noise', intensity: 2, target: 'nearestPerformer' }],
      },
      line: '엉뚱한 얘기로 끼어든다',
      targetLine: '{target:에게} 다가가 엉뚱한 얘기로 끼어든다',
    },
  },
}

/** 터짐 하나의 문장. 주면 공용 문장(line·targetLine·intenseLine)을 통째로 바꾼다 */
export type BurstText = Pick<BurstAction, 'line'> & Partial<Pick<BurstAction, 'targetLine' | 'intenseLine'>>
export type BurstTexts = Partial<Record<CommonEmotionId, { small?: BurstText; big?: BurstText }>>

function withText(base: BurstAction, text: BurstText | undefined): BurstAction {
  if (text === undefined) return base
  return {
    action: base.action,
    line: text.line,
    ...(text.targetLine !== undefined && { targetLine: text.targetLine }),
    ...(text.intenseLine !== undefined && { intenseLine: text.intenseLine }),
  }
}

/**
 * 공용 터짐의 행동(포즈·이동·현상)은 그대로 두고 문장만 출연자 것으로 바꾼다.
 * 다섯 명이 같은 문장을 쓰면 로그만으로 누가 누군지 구별되지 않는다.
 */
export function withBurstTexts(texts: BurstTexts): Record<CommonEmotionId, BurstDef> {
  const result = { ...COMMON_BURSTS }
  for (const emotion of Object.keys(texts) as CommonEmotionId[]) {
    const text = texts[emotion]
    if (text === undefined) continue
    result[emotion] = {
      small: withText(COMMON_BURSTS[emotion].small, text.small),
      big: withText(COMMON_BURSTS[emotion].big, text.big),
    }
  }
  return result
}

/** 모든 출연자가 갖는 공용 버릇(weight 1) */
export const COMMON_HABITS: HabitDef[] = [
  {
    id: 'yawn',
    line: '하품을 꾹 참는다',
    recall: '하품을 참던',
    noun: '하품',
    pose: 'idle',
    weight: 1,
    boost: { emotion: 'boredom', factor: 2 },
  },
  {
    id: 'water',
    line: '물을 한 모금 마신다',
    recall: '물을 마시던',
    noun: '물 마시기',
    pose: 'idle',
    weight: 1,
  },
  {
    id: 'script',
    line: '대본을 뒤적인다',
    recall: '대본을 뒤적이던',
    noun: '대본 넘기는 소리',
    pose: 'idle',
    stir: { kind: 'noise', target: 'none' },
    weight: 1,
  },
  {
    id: 'clock',
    line: '시계를 힐끔 본다',
    recall: '시계를 보던',
    noun: '시계 보기',
    pose: 'idle',
    weight: 1,
    boost: { emotion: 'boredom', factor: 1 },
    when: [{ kind: 'stage', emotion: 'boredom', atLeast: 1 }],
  },
]
