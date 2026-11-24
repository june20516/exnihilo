import { RALLY_RULES } from '@/game/content/balance'
import { addStatus, expireBlock, isAlive, tickEndOfTurn } from '@/kit/core/entity'
import { PLAYER_ID } from '@/game/content/characters'
import { RALLY_ENCOUNTERS, type RallyEncounterDef, type RallyIntent } from '@/game/content/enemies'
import type { CombatEvent } from '@/game/combat/events'
import type { SlotRole } from '@/game/grammar/frames'
import type { Board } from '@/game/sentence/board'
import { isAliveEnemy, outcomeOf, runClause } from './clauseRun'
import type { RallyResult as Result, RallyState } from './combat'
import { drawCards } from './deckFlow'
import { enemyBoard, firstAliveEnemy } from './sentence'

/** 턴의 흐름: 적의 예고와 봉인, 적 차례, 내 차례 시작. */

const SEAL_ORDER: readonly SlotRole[] = ['subject', 'object', 'verb']

/** 다음 봉인이 걸릴 내 슬롯(예고에 보여 준다). ahead는 이번 적 차례에 이 봉인보다 먼저 봉인할 적의 수. */
export function nextSealRole(state: RallyState, ahead = 0): SlotRole {
  return SEAL_ORDER[(state.sealCount + ahead) % SEAL_ORDER.length]
}

/** 첫 절의 이 역할 슬롯을 봉인한다. 이미 걸린 봉인은 그대로 둔다(같은 턴에 여럿이 봉인할 수 있다). */
export function addSeal(board: Board, role: SlotRole): Board {
  return {
    clauses: board.clauses.map((clause, index) =>
      index !== 0 ? clause : { ...clause, slots: clause.slots.map((slot) => (slot.role === role ? { ...slot, sealed: true } : slot)) },
    ),
  }
}

export function clearSeals(board: Board): Board {
  return { clauses: board.clauses.map((clause) => ({ ...clause, slots: clause.slots.map((slot) => ({ ...slot, sealed: false })) })) }
}

export function getEncounter(id: string): RallyEncounterDef {
  const encounter = RALLY_ENCOUNTERS[id]
  if (!encounter) throw new Error(`알 수 없는 조우: ${id}`)
  return encounter
}

/** 이번 턴에 index번째 적이 실행할 예고 문장. */
export function enemyIntent(state: RallyState, enemyIndex: number): RallyIntent {
  const spec = getEncounter(state.encounterId).enemies[enemyIndex]
  if (!spec) throw new Error(`적이 없습니다: ${enemyIndex}`)
  return spec.intents[(state.turn - 1) % spec.intents.length]
}

/** 내 턴 시작: 보호 만료, 버리기 회복, 손패 최대치까지 채우기, 대상 보정. 서고 바닥 대가로 쓰러지면 진다. */
export function startPlayerTurn(state: RallyState): Result {
  const entities = state.entities.map((e) => (e.id === PLAYER_ID ? expireBlock(e) : e))
  const refreshed: RallyState = { ...state, entities, discardsLeft: state.build.discardsPerTurn }
  const drawn = drawCards(refreshed, Math.max(0, state.build.handMax - state.deck.hand.length))
  if (outcomeOf(drawn.state.entities) === 'lost') {
    return { state: { ...drawn.state, phase: 'lost' }, events: [...drawn.events, { type: 'combatEnded', outcome: 'lost' }] }
  }
  const target = drawn.state.entities.find((e) => e.id === drawn.state.targetId)
  const targetId = target && isAlive(target) ? drawn.state.targetId : firstAliveEnemy(drawn.state.entities)
  return {
    state: { ...drawn.state, targetId },
    events: drawn.events,
  }
}

/** 적 턴: 보호 소멸 → 적마다 예고 문장 실행 → 상태 처리 → 다음 내 턴. */
export function enemyPhase(state: RallyState, events: CombatEvent[]): Result {
  events.push({ type: 'enemyTurn' })
  // 적 턴 시작: 적의 보호와 지난 봉인이 사라진다.
  let current: RallyState = {
    ...state,
    board: clearSeals(state.board),
    entities: state.entities.map((e) => (e.side === 'enemy' && isAlive(e) ? expireBlock(e) : e)),
  }
  const ended = (outcome: 'won' | 'lost'): Result => {
    events.push({ type: 'combatEnded', outcome })
    return { state: { ...current, phase: outcome }, events }
  }

  for (const [index, spec] of getEncounter(current.encounterId).enemies.entries()) {
    const enemyId = `e${index}`
    if (!isAliveEnemy(current, enemyId) || !spec) continue
    const intent = enemyIntent(current, index)
    if (intent.kind === 'seal') {
      // 봉인도 행동이다: 얼어 있으면 빙결을 하나 쓰고 무효가 된다(절 실행과 같은 규칙).
      const self = current.entities.find((e) => e.id === enemyId)
      if (self && self.statuses.freeze > 0) {
        current = { ...current, entities: current.entities.map((e) => (e.id === enemyId ? addStatus(e, 'freeze', -1) : e)) }
        events.push({ type: 'fizzled', clause: 0, reason: 'frozen' })
        continue
      }
      const role = nextSealRole(current)
      current = { ...current, board: addSeal(current.board, role), sealCount: current.sealCount + 1 }
      events.push({ type: 'sealed', role })
      continue
    }
    const board = enemyBoard(intent.clause, enemyId, RALLY_RULES.enemyModifierSlots)
    const executed = runClause(current, board, 0, { damageScale: current.enemyScale.damage }, 'enemy')
    current = executed.state
    events.push(...executed.events)
    const outcome = outcomeOf(current.entities)
    if (outcome) return ended(outcome)
  }

  current = {
    ...current,
    // 적 차례가 끝나면 형용사 상태가 사라진다(독 처리와 같은 시점).
    lingering: {},
    entities: current.entities.map((entity) => {
      if (!isAlive(entity)) return entity
      const r = tickEndOfTurn(entity)
      if (r.poisonDamage > 0) events.push({ type: 'poisonTick', entityId: entity.id, amount: r.poisonDamage })
      if (!isAlive(r.entity)) events.push({ type: 'died', entityId: entity.id })
      return r.entity
    }),
  }
  const outcome = outcomeOf(current.entities)
  if (outcome) return ended(outcome)

  const started = startPlayerTurn({ ...current, turn: current.turn + 1 })
  return { state: started.state, events: [...events, ...started.events] }
}
