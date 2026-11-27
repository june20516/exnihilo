import { describe, expect, it } from 'vitest'
import type { BurstAction, EmotionDef, HabitDef } from '@/content/types'
import type { Reason } from './emotion'
import type { PhenomenonEvent } from './phenomena'
import {
  KIND_NOUNS,
  burstLine,
  fillTemplate,
  habitLine,
  reasonNoun,
  stageLine,
  subjectPhrase,
} from './narration'

const NAMES: Record<string, string> = { priya: '프리야', okafor: '오카포', rex: '렉스' }
const nameOf = (id: string): string => NAMES[id] ?? id

const NOSE_PICK: HabitDef = {
  id: 'nosePick',
  line: '코를 판다',
  recall: '코를 파던',
  noun: '코 파기',
  emote: '🙂',
  pose: 'idle',
  weight: 1,
}
const SNICKER: HabitDef = {
  id: 'snicker',
  line: '킥킥댄다',
  targetLine: '{target:을} 보며 킥킥댄다',
  recall: '킥킥대던',
  noun: '킥킥거림',
  emote: '🙂',
  pose: 'laugh',
  weight: 1,
}
const THROAT: HabitDef = {
  id: 'throat',
  line: '헛기침을 한다',
  recall: '헛기침하던',
  noun: '헛기침',
  emote: '🙂',
  pose: 'idle',
  weight: 1,
}
const ANNOYANCE: EmotionDef = {
  id: 'annoyance',
  name: '짜증',
  stageNames: ['짜증', '분노'],
  stageLines: ['카메라를 힐끔거린다', '폭발 직전이다'],
  accumulate: '{reasons:을} 참던',
}
const GRUDGE: EmotionDef = { ...ANNOYANCE, accumulate: '{reasons:에} 시달리던' }
const DASH: BurstAction = {
  action: { pose: 'angry', emits: [] },
  line: '카메라로 돌진한다',
}
const RAGE: BurstAction = {
  action: { pose: 'angry', emits: [] },
  line: '버럭 화를 낸다',
  targetLine: '{target:에게} 버럭 화를 낸다',
  intenseLine: '폭발한다',
}

function eventReason(sourceId: string, label: string | undefined, kind: PhenomenonEvent['kind'] = 'laughter'): Reason {
  return {
    emotion: 'annoyance',
    amount: 10,
    source: {
      type: 'event',
      event: {
        id: 1, kind, intensity: 0, sourceId, targetId: 'rex',
        x: 0, y: 0, z: 0, step: 0, causeId: null, depth: 0, label,
      },
    },
  }
}
const situationReason: Reason = {
  emotion: 'annoyance',
  amount: 5,
  source: { type: 'situation', key: 'offScreen', label: { noun: '무시', clause: '한참 화면에 안 잡힌' } },
}
const directiveReason: Reason = {
  emotion: 'annoyance',
  amount: 5,
  source: { type: 'directive', label: '반박하세요' },
}

describe('fillTemplate', () => {
  it('받침 없는 대상은 를/와, 받침 있는 대상은 을/과', () => {
    expect(fillTemplate('{target:을} 본다', { target: '모' })).toBe('모를 본다')
    expect(fillTemplate('{target:와} 논다', { target: '렉스' })).toBe('렉스와 논다')
    expect(fillTemplate('{target:을} 본다', { target: '오카포' })).toBe('오카포를 본다')
    expect(fillTemplate('{reasons:을} 참던', { reasons: '정적' })).toBe('정적을 참던')
  })
  it('받침 있는 대상은 을/과', () => {
    expect(fillTemplate('{target:을} 본다', { target: '준' })).toBe('준을 본다')
    expect(fillTemplate('{target:와} 논다', { target: '준' })).toBe('준과 논다')
  })
  it('끝의 따옴표·괄호 같은 기호는 건너뛰고 마지막 한글 글자로 조사를 고른다', () => {
    expect(fillTemplate('{reasons:을} 참던', { reasons: "PD의 '반박하세요'" })).toBe("PD의 '반박하세요'를 참던")
    expect(fillTemplate('{reasons:을} 참던', { reasons: "PD의 '진정'" })).toBe("PD의 '진정'을 참던")
    expect(fillTemplate('{target:와} 논다', { target: '준(대기)' })).toBe('준(대기)와 논다')
  })
  it('한글이 아닌 끝 글자는 조사를 괄호로 병기한다', () => {
    expect(fillTemplate('{target:을} 본다', { target: 'Rex' })).toBe('Rex을(를) 본다')
    expect(fillTemplate('{target:와} 논다', { target: 'Rex' })).toBe('Rex과(와) 논다')
  })
  it('에게·에는 받침과 무관하게 그대로 붙인다', () => {
    expect(fillTemplate('{target:에게} 화낸다', { target: '렉스' })).toBe('렉스에게 화낸다')
    expect(fillTemplate('{reasons:에} 시달린', { reasons: '정적' })).toBe('정적에 시달린')
    expect(fillTemplate('{target} {reasons}', { target: '모', reasons: '소란' })).toBe('모 소란')
  })
  it('값이 없는 토큰은 프로그래밍 오류로 throw한다', () => {
    expect(() => fillTemplate('{target:을} 본다', {})).toThrow(Error)
    expect(() => fillTemplate('{reasons:에} 시달린', { target: '모' })).toThrow(Error)
  })
})

describe('KIND_NOUNS', () => {
  it('종류별 명사를 고정한다', () => {
    expect(KIND_NOUNS).toEqual({
      noise: '소란',
      laughter: '웃음',
      anger: '화',
      impact: '충돌',
      darkness: '어둠',
      exposure: '민망한 모습',
    })
  })
})

describe('reasonNoun', () => {
  it('사건 이유는 "<출처>의 <label>"이다', () => {
    expect(reasonNoun(eventReason('priya', '킥킥거림'), nameOf)).toBe('프리야의 킥킥거림')
  })
  it('label이 없으면 종류 명사를 쓴다', () => {
    expect(reasonNoun(eventReason('priya', undefined, 'noise'), nameOf)).toBe('프리야의 소란')
  })
  it('상황 이유는 label.noun이다', () => {
    expect(reasonNoun(situationReason, nameOf)).toBe('무시')
  })
  it("지시 이유는 PD의 '<지시 이름>'이다", () => {
    expect(reasonNoun(directiveReason, nameOf)).toBe("PD의 '반박하세요'")
  })
  it('relief는 명사가 없으므로 throw한다', () => {
    expect(() => reasonNoun({ emotion: 'annoyance', source: { type: 'relief' }, amount: 1 }, nameOf)).toThrow(Error)
  })
})

describe('subjectPhrase', () => {
  it('회상이 있으면 "아까 <recall> <이름>이/가"', () => {
    expect(subjectPhrase('렉스', NOSE_PICK)).toBe('아까 코를 파던 렉스가')
  })
  it('회상이 없으면 이름만', () => {
    expect(subjectPhrase('렉스', null)).toBe('렉스가')
    expect(subjectPhrase('오카포', null)).toBe('오카포가')
  })
})

describe('habitLine', () => {
  it('대상이 없으면 line', () => {
    expect(habitLine('렉스', NOSE_PICK, null, null)).toBe('렉스가 코를 판다')
  })
  it('대상이 있고 targetLine이 있으면 채운다', () => {
    expect(habitLine('프리야', SNICKER, '오카포', null)).toBe('프리야가 오카포를 보며 킥킥댄다')
  })
  it('대상이 있어도 targetLine이 없으면 line', () => {
    expect(habitLine('렉스', NOSE_PICK, '모', null)).toBe('렉스가 코를 판다')
  })
  it('대상이 없으면 targetLine이 있어도 line을 쓴다', () => {
    expect(habitLine('프리야', SNICKER, null, null)).toBe('프리야가 킥킥댄다')
  })
  it('원인을 받았으면 앞에 붙인다', () => {
    expect(habitLine('오카포', THROAT, null, { sourceName: '프리야', noun: '킥킥거림' })).toBe(
      '프리야의 킥킥거림에 오카포가 헛기침을 한다',
    )
  })
})

describe('stageLine', () => {
  it('회상 + 단계 술어', () => {
    expect(stageLine('렉스', NOSE_PICK, ANNOYANCE, 1)).toBe('아까 코를 파던 렉스가 카메라를 힐끔거린다')
    expect(stageLine('렉스', null, ANNOYANCE, 2)).toBe('렉스가 폭발 직전이다')
  })
})

describe('burstLine', () => {
  it('top이 비면 회상 주어', () => {
    expect(burstLine('렉스', NOSE_PICK, ANNOYANCE, DASH, null, false, [], nameOf)).toBe(
      '아까 코를 파던 렉스가 카메라로 돌진한다',
    )
  })
  it('상황 이유는 clause가 앞선다(회상은 쓰지 않는다)', () => {
    expect(burstLine('렉스', NOSE_PICK, ANNOYANCE, DASH, null, false, [situationReason], nameOf)).toBe(
      '한참 화면에 안 잡힌 렉스가 카메라로 돌진한다',
    )
  })
  it('지시 이유', () => {
    expect(burstLine('오카포', null, ANNOYANCE, RAGE, null, false, [directiveReason], nameOf)).toBe(
      "PD의 '반박하세요'에 오카포가 버럭 화를 낸다",
    )
  })
  it('사건 이유는 상위 2개를 와/과로 잇는다', () => {
    const top = [eventReason('priya', '킥킥거림'), situationReason]
    expect(burstLine('오카포', null, ANNOYANCE, { ...RAGE, intenseLine: undefined }, null, false, top, nameOf)).toBe(
      '프리야의 킥킥거림과 무시를 참던 오카포가 버럭 화를 낸다',
    )
  })
  it('사건 이유가 1개면 그것만, 3개 이상이어도 2개까지', () => {
    expect(burstLine('오카포', null, GRUDGE, DASH, null, false, [eventReason('priya', '킥킥거림')], nameOf)).toBe(
      '프리야의 킥킥거림에 시달리던 오카포가 카메라로 돌진한다',
    )
    const top = [eventReason('priya', '킥킥거림'), situationReason, directiveReason]
    expect(burstLine('오카포', null, ANNOYANCE, DASH, null, false, top, nameOf)).toBe(
      '프리야의 킥킥거림과 무시를 참던 오카포가 카메라로 돌진한다',
    )
  })
  it('격한 터짐은 intenseLine, 아니면 대상 규칙', () => {
    expect(burstLine('오카포', null, ANNOYANCE, RAGE, '렉스', true, [], nameOf)).toBe('오카포가 폭발한다')
    expect(burstLine('오카포', null, ANNOYANCE, RAGE, '렉스', false, [], nameOf)).toBe(
      '오카포가 렉스에게 버럭 화를 낸다',
    )
    expect(burstLine('오카포', null, ANNOYANCE, RAGE, null, false, [], nameOf)).toBe('오카포가 버럭 화를 낸다')
  })
  it('intense여도 쌓임 접두는 유지되고 술어만 intenseLine이 된다', () => {
    const top = [eventReason('priya', '킥킥거림'), situationReason]
    expect(burstLine('오카포', null, ANNOYANCE, RAGE, null, true, top, nameOf)).toBe(
      '프리야의 킥킥거림과 무시를 참던 오카포가 폭발한다',
    )
  })
  it('같은 출처 사건이 두 번 쌓여도 쌓임 줄에는 이름이 한 번만 나온다', () => {
    const twice = [eventReason('priya', undefined), eventReason('priya', undefined)]
    expect(burstLine('오카포', null, ANNOYANCE, DASH, null, false, twice, nameOf)).toBe(
      '프리야의 웃음을 참던 오카포가 카메라로 돌진한다',
    )
    // 중복을 뺀 뒤 앞의 2개를 쓴다
    expect(burstLine('오카포', null, ANNOYANCE, DASH, null, false, [...twice, situationReason], nameOf)).toBe(
      '프리야의 웃음과 무시를 참던 오카포가 카메라로 돌진한다',
    )
  })
  it('따옴표로 끝나는 지시 이유에도 받침에 맞는 조사가 붙는다', () => {
    const top = [eventReason('priya', '킥킥거림'), directiveReason]
    expect(burstLine('오카포', null, ANNOYANCE, DASH, null, false, top, nameOf)).toBe(
      "프리야의 킥킥거림과 PD의 '반박하세요'를 참던 오카포가 카메라로 돌진한다",
    )
  })
  it('intenseLine의 {target} 토큰은 대상으로 채우고, 대상이 없으면 일반 술어 규칙으로 돌아간다', () => {
    const rageAt: BurstAction = { ...RAGE, intenseLine: '{target:에게} 폭발한다' }
    expect(burstLine('오카포', null, ANNOYANCE, rageAt, '렉스', true, [], nameOf)).toBe('오카포가 렉스에게 폭발한다')
    expect(burstLine('오카포', null, ANNOYANCE, rageAt, null, true, [], nameOf)).toBe('오카포가 버럭 화를 낸다')
    expect(burstLine('오카포', null, ANNOYANCE, { ...rageAt, targetLine: undefined }, null, true, [], nameOf)).toBe(
      '오카포가 버럭 화를 낸다',
    )
    expect(burstLine('오카포', null, ANNOYANCE, rageAt, '렉스', false, [], nameOf)).toBe(
      '오카포가 렉스에게 버럭 화를 낸다',
    )
  })
  it('relief가 섞인 top은 throw한다', () => {
    const relief: Reason = { emotion: 'annoyance', source: { type: 'relief' }, amount: 1 }
    expect(() => burstLine('오카포', null, ANNOYANCE, DASH, null, false, [relief], nameOf)).toThrow(Error)
    expect(() =>
      burstLine('오카포', null, ANNOYANCE, DASH, null, false, [eventReason('priya', '킥킥거림'), relief], nameOf),
    ).toThrow(Error)
  })
})
