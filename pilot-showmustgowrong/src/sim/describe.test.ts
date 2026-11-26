import { describe, expect, it } from 'vitest'
import { describeEvent, describeRootEvent, withObject, withPartner, withSubject } from './describe'
import type { PhenomenonEvent } from './phenomena'

const NAMES: Record<string, string> = {
  rex: '렉스',
  mo: '모',
  june: '준',
  priya: '프리야',
  light: '과열된 조명',
  wide: '무대 와이드',
}

const event = (overrides: Partial<PhenomenonEvent>): PhenomenonEvent => ({
  id: 1,
  kind: 'impact',
  intensity: 1,
  sourceId: 'rex',
  targetId: null,
  x: 0,
  y: 0,
  z: 0,
  step: 0,
  causeId: null,
  depth: 1,
  ...overrides,
})

describe('describeEvent', () => {
  it('impact는 받침에 맞는 이/가, 와/과를 고른다', () => {
    expect(describeEvent(event({ sourceId: 'rex', targetId: 'mo' }), NAMES)).toBe(
      '렉스가 모와 부딪혔다!',
    )
    expect(describeEvent(event({ sourceId: 'june', targetId: 'rex' }), NAMES)).toBe(
      '준이 렉스와 부딪혔다!',
    )
    expect(describeEvent(event({ sourceId: 'rex', targetId: 'june' }), NAMES)).toBe(
      '렉스가 준과 부딪혔다!',
    )
  })

  it('laughter, anger 3, silence 예시 문장', () => {
    expect(
      describeEvent(event({ kind: 'laughter', sourceId: 'priya', targetId: 'rex' }), NAMES),
    ).toBe('프리야가 렉스를 보고 웃는다')
    expect(
      describeEvent(event({ kind: 'laughter', sourceId: 'priya', targetId: 'june' }), NAMES),
    ).toBe('프리야가 준을 보고 웃는다')
    expect(describeEvent(event({ kind: 'anger', intensity: 3 }), NAMES)).toBe(
      '렉스가 욕설을 했다! (삐—)',
    )
    expect(
      describeEvent(event({ kind: 'silence', sourceId: 'broadcast', intensity: 1 }), NAMES),
    ).toBe('방송에 정적이 흐른다…')
  })

  it('나머지 종류도 이름과 조사를 넣은 문장을 만든다', () => {
    expect(describeEvent(event({ kind: 'anger', intensity: 2, targetId: 'mo' }), NAMES)).toBe(
      '렉스가 모에게 버럭 화를 낸다',
    )
    expect(describeEvent(event({ kind: 'noise', intensity: 3, sourceId: 'light' }), NAMES)).toBe(
      '과열된 조명 쪽에서 굉음이 울린다!',
    )
    expect(describeEvent(event({ kind: 'darkness', intensity: 2, sourceId: 'light' }), NAMES)).toBe(
      '과열된 조명이 꺼지고 주위가 어두워졌다!',
    )
    expect(describeEvent(event({ kind: 'exposure', targetId: 'june' }), NAMES)).toBe(
      '준이 민망한 모습을 드러냈다!',
    )
    expect(describeEvent(event({ kind: 'gaze', sourceId: 'wide', targetId: 'rex' }), NAMES)).toBe(
      '무대 와이드가 렉스를 잡았다',
    )
    expect(
      describeEvent(event({ kind: 'gaze', sourceId: 'broadcast', targetId: 'june' }), NAMES),
    ).toBe('준이 한동안 화면에 잡히지 않았다')
  })

  it('audience는 관객, 모르는 id는 id 그대로 쓴다', () => {
    expect(describeEvent(event({ kind: 'laughter', sourceId: 'audience' }), NAMES)).toBe(
      '관객이 웃음을 터뜨린다',
    )
    expect(describeEvent(event({ sourceId: 'ghost', targetId: null }), NAMES)).toBe(
      'ghost이(가) 쾅 하고 부딪혔다!',
    )
  })
})

describe('withSubject', () => {
  it('한글이 아닌 끝 글자는 이(가)로 둔다', () => {
    expect(withSubject('렉스')).toBe('렉스가')
    expect(withSubject('준')).toBe('준이')
    expect(withSubject('R2')).toBe('R2이(가)')
  })

  it('끝의 따옴표·괄호는 건너뛰고 마지막 한글 글자로 받침을 판단한다', () => {
    expect(withObject("PD의 '반박하세요'")).toBe("PD의 '반박하세요'를")
    expect(withObject("PD의 '진정'")).toBe("PD의 '진정'을")
    expect(withPartner('"모"')).toBe('"모"와')
    expect(withSubject('준)')).toBe('준)이')
    expect(withSubject("'R2'")).toBe("'R2'이(가)")
  })
})

describe('기척(강도 0)의 문구', () => {
  it('describeEvent는 기척에 문장이 없어 throw한다', () => {
    expect(() => describeEvent(event({ kind: 'laughter', intensity: 0 }), NAMES)).toThrow()
  })

  it('describeRootEvent는 기척이면 "<출처>의 <label 또는 종류 명사>"를, 강도 1 이상이면 describeEvent 문장을 쓴다', () => {
    expect(describeRootEvent(event({ kind: 'laughter', intensity: 0, label: '킥킥거림' }), NAMES)).toBe(
      '렉스의 킥킥거림',
    )
    expect(describeRootEvent(event({ kind: 'noise', intensity: 0 }), NAMES)).toBe('렉스의 기척 소리')
    expect(describeRootEvent(event({ kind: 'noise', intensity: 0, sourceId: 'audience' }), NAMES)).toBe(
      '관객의 기척 소리',
    )
    expect(describeRootEvent(event({ kind: 'laughter', intensity: 2 }), NAMES)).toBe('렉스가 웃음을 터뜨린다')
  })

  it('describeRootEvent는 출처 이름을 알 수 없으면 명사만 쓴다', () => {
    expect(describeRootEvent(event({ kind: 'laughter', intensity: 0, label: '킥킥거림' }), {})).toBe('킥킥거림')
    expect(describeRootEvent(event({ kind: 'anger', intensity: 0, sourceId: 'ghost' }), NAMES)).toBe('짜증 기척')
  })
})
