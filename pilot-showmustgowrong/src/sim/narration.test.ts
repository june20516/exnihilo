import { describe, expect, it } from 'vitest'
import type { BurstAction, EmotionDef, HabitDef } from '@/content/types'
import type { Reason } from './emotion'
import type { PhenomenonEvent } from './phenomena'
import {
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
  pose: 'idle',
  weight: 1,
}
const SNICKER: HabitDef = {
  id: 'snicker',
  line: '킥킥댄다',
  targetLine: '{target:을} 보며 킥킥댄다',
  recall: '킥킥대던',
  noun: '킥킥거림',
  pose: 'laugh',
  weight: 1,
}
const THROAT: HabitDef = {
  id: 'throat',
  line: '헛기침을 한다',
  recall: '헛기침하던',
  noun: '헛기침',
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

describe('reasonNoun', () => {
  it('사건 이유는 "<출처>의 <label>"이다', () => {
    expect(reasonNoun(eventReason('priya', '킥킥거림'), nameOf)).toBe('프리야의 킥킥거림')
  })
  it('label이 없으면 종류 명사를 쓴다', () => {
    expect(reasonNoun(eventReason('priya', undefined, 'noise'), nameOf)).toBe('프리야의 소란')
  })
  it('sourceId가 없으면 종류 명사만 쓴다', () => {
    expect(reasonNoun(eventReason('', undefined, 'noise'), nameOf)).toBe('소란')
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
  it('프리야의 킥킥거림과 무시를 참던 오카포가 폭발한다', () => {
    const top = [eventReason('priya', '킥킥거림'), situationReason]
    expect(burstLine('오카포', null, ANNOYANCE, RAGE, null, true, top, nameOf)).toBe(
      '프리야의 킥킥거림과 무시를 참던 오카포가 폭발한다',
    )
  })
})
