import { RELICS } from '@/game/build/relics'
import { getWord, type WordId } from '@/game/content/words'
import type { BuildState } from '@/game/build/build'
import { upgradeSummary } from '@/game/run/labels'

/** 보유 유물·칸·강화와 덱 목록. 상점과 런 결과가 함께 쓴다. */
export function BuildSummary({ build, deck }: { build: BuildState; deck: readonly WordId[] }) {
  const counts = new Map<WordId, number>()
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1)
  const upgrades = upgradeSummary(build)
  return (
    <div className="grid min-h-0 grid-cols-2 gap-3 text-sm">
      <section className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-3">
        <h3 className="font-headline text-base font-bold">빌드</h3>
        <p className="text-on-surface-variant">
          수식어 칸 주어 {build.slots.subject} · 목적어 {build.slots.object} · 동사 {build.slots.verb} · 손패 상한 {build.handMax} · 턴당
          버리기 {build.discardsPerTurn}
        </p>
        <p className="text-on-surface-variant">강화: {upgrades.length > 0 ? upgrades.join(', ') : '없음'}</p>
        <ul className="flex flex-col gap-1">
          {build.relics.length === 0 && <li className="text-on-surface-variant">유물 없음</li>}
          {build.relics.map((id) => (
            <li key={id}>
              <span className="font-bold text-tertiary">{RELICS[id].name}</span>
              <span className="text-on-surface-variant"> — {RELICS[id].text}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-3" data-testid="shop-deck">
        <h3 className="font-headline text-base font-bold">덱 {deck.length}장</h3>
        <p className="leading-relaxed text-on-surface-variant">
          {[...counts]
            .map(([id, n]) => `${getWord(id).text}${build.upgrades[id] ? `+${build.upgrades[id]}` : ''}${n > 1 ? ` ×${n}` : ''}`)
            .join(', ')}
        </p>
      </section>
    </div>
  )
}
