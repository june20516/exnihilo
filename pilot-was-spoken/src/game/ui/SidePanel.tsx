import type { EntityChange } from '@/game/rally/summary'
import { PreviewList } from './PreviewList'

interface SidePanelProps {
  mine: readonly EntityChange[]
  enemy: readonly EntityChange[]
  /** 동사가 없어 낭독할 수 없으면 false: 첫 목록에 안내를 보여 준다. */
  canCast: boolean
  /** 이 낭독으로 전투에서 이긴다(적의 차례가 오지 않는다). */
  winsNow: boolean
}

/** 오른쪽 서랍: 이번 라운드에 일어날 일(실제 엔진으로 미리 계산). 개체 카드의 예상 HP를 구간·칩으로 풀어 보인다. */
export function SidePanel({ mine, enemy, canCast, winsNow }: SidePanelProps) {
  return (
    <aside className="flex flex-col gap-2">
      <PreviewList testId="preview-mine" title="낭독하면" changes={mine} empty={canCast ? '변화 없음' : '동사가 없어 낭독할 수 없다'} />
      <PreviewList
        testId="preview-enemy"
        title="이어서 적의 차례"
        changes={enemy}
        empty={winsNow ? '적이 모두 쓰러져 적의 차례가 없다' : '변화 없음'}
      />
    </aside>
  )
}
