import { EMPTY_BUILD } from '@/game/build/build'
import { offerDetail, offerName, upgradeSummary } from './labels'

test('보상 이름: 강화는 아직 사지 않았을 때만 단계 화살표를 붙인다', () => {
  expect(offerName({ kind: 'upgrade', wordId: 'fiercely' }, EMPTY_BUILD, true)).toBe('[강화] 격렬하게 0→1단계')
  expect(offerName({ kind: 'upgrade', wordId: 'fiercely' }, EMPTY_BUILD)).toBe('[강화] 격렬하게')
  expect(offerName({ kind: 'relic', id: 'stress' }, EMPTY_BUILD)).toBe('[유물] 강세')
  expect(offerName({ kind: 'structure', id: 'handSize' }, EMPTY_BUILD)).toBe('[구조] 손패 상한 +1')
})

test('보상 설명: 강화는 지금 값과 다음 값을 함께 보인다', () => {
  const detail = offerDetail({ kind: 'upgrade', wordId: 'fiercely' }, EMPTY_BUILD)
  expect(detail).toContain('×1.5')
  expect(detail).toContain('×2')
})

test('강화 요약: 단어와 지금 단계', () => {
  expect(upgradeSummary({ ...EMPTY_BUILD, upgrades: { fiercely: 2 } })).toEqual(['격렬하게 2단계'])
})
