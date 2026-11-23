import { createRng, nextInt, type RngState } from '@/kit/core/rng'
import { BALANCE } from '@/game/content/balance'
import { ENCOUNTERS, STARTER_DECK } from '@/game/content/encounters'
import { PRESETS } from '@/game/content/rules'
import { combatGame } from '@/game/sim/combatGame'
import { type CombatAction, type CombatState, reduceCombat } from './combat'
import type { CombatEvent } from './events'
import { linesFromEvents, previewEnemyCast, previewExecution } from './preview'

const EXECUTION_END: readonly CombatEvent['type'][] = ['dried', 'poisonTick', 'intentRevealed', 'resourceGained', 'combatEnded', 'intervention']

/** 실제 이벤트에서 "문장 실행" 구간만 잘라 미리보기와 같은 문장으로 바꾼다. by가 주어지면 그 낭독 구간만. */
function executedLines(events: readonly CombatEvent[], after: CombatState, by?: 'player' | 'enemy') {
  let start = events.findIndex((e) => (by ? e.type === 'cast' && e.by === by : e.type === 'clauseExecuted'))
  if (start < 0) return []
  if (by) start += 1
  const rest = events.slice(start)
  const end = rest.findIndex((e) => EXECUTION_END.includes(e.type) || (e.type === 'cast' && e.by !== by))
  return linesFromEvents(end < 0 ? rest : rest.slice(0, end), after.entities).map((l) => l.text)
}

/** 무작위로 몇 수 둔 상태들을 만든다(합법 행동만). */
function randomStates(presetId: 'A' | 'B' | 'C', encounterId: string, seed: number): CombatState[] {
  const game = combatGame(encounterId, PRESETS[presetId], BALANCE, STARTER_DECK)
  const states: CombatState[] = []
  let state = game.start(seed)
  let rng: RngState = createRng(seed)
  for (let step = 0; step < 40 && state.phase === 'player'; step++) {
    states.push(state)
    const legal = game.legalActions(state)
    const [index, next] = nextInt(rng, 0, legal.length - 1)
    rng = next
    state = game.apply(state, legal[index])
  }
  return states
}

const act = (s: CombatState, a: CombatAction) => reduceCombat(s, a, BALANCE)

describe.each(['A', 'B', 'C'] as const)('미리보기는 실제 결과와 같다: 프리셋 %s', (presetId) => {
  test.each(Object.keys(ENCOUNTERS).filter((id) => !id.startsWith('test-')))('%s', (encounterId) => {
    let checked = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const state of randomStates(presetId, encounterId, seed)) {
        if (PRESETS[presetId].execution === 'auto') {
          const r = act(state, { type: 'endTurn' })
          expect(previewExecution(state).map((l) => l.text)).toEqual(executedLines(r.events, r.state))
        } else {
          const cast = act(state, { type: 'cast' })
          const enemyAfterCast = cast.events.some((e) => e.type === 'cast' && e.by === 'enemy')
          const expected = [
            ...executedLines(cast.events, cast.state, 'player'),
            ...(enemyAfterCast ? ['— 이어서 적이 낭독 —', ...executedLines(cast.events, cast.state, 'enemy')] : []),
          ]
          expect(previewExecution(state).map((l) => l.text)).toEqual(expected)
          const end = act(state, { type: 'endTurn' })
          const enemy = previewEnemyCast(state)
          const enemyCasts = end.events.some((e) => e.type === 'cast' && e.by === 'enemy')
          expect(enemy !== null).toBe(enemyCasts)
          if (enemy) expect(enemy.map((l) => l.text)).toEqual(executedLines(end.events, end.state, 'enemy'))
          // 플레이어가 낭독해도 적의 낭독 주기면 적도 낭독한다
          // 플레이어 낭독으로 전투가 끝나지 않았다면, 적의 낭독 주기에는 적도 이어서 낭독한다
          const endedByPlayerCast = cast.state.phase !== 'player' && !enemyAfterCast
          if (!endedByPlayerCast) expect(enemyAfterCast).toBe(enemyCasts)
        }
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10)
  })
})
