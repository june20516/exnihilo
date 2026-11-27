/**
 * 테스트 픽스처 출연자용 색. id마다 다른 #RRGGBB를 돌려준다.
 * 해시가 24비트라 서로 다른 id가 같은 색이 될 수 있다(충돌하면 엉뚱한 테스트에서 "색 중복" 오류가 난다).
 * 출연자 색은 형식과 중복을 검사받으므로(validate.ts) 임의 id의 픽스처가 서로 다른 유효한 색을 갖게 한다.
 */
export function fixtureColor(id: string): string {
  const hash = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 0x1000000, 7)
  return `#${hash.toString(16).padStart(6, '0').toUpperCase()}`
}
