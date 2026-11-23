import type { EffectHandlers } from '@/kit/fx/effectPlayer'
import { flash, popNumber, shake, wait } from '@/kit/fx/primitives'
import type { SlotAddress } from '@/game/content/encounters'
import type { CombatEvent } from '@/game/combat/events'
import { fadeAway, inkSpread, meltDown, penStroke, readAloud } from './inkEffects'

const query = (selector: string): Element | null => document.querySelector(selector)
const slotSelector = (at: SlotAddress, modifierIndex: number | null) =>
  modifierIndex === null
    ? `[data-slot="${at.clause}-${at.role}"]`
    : `[data-modifier="${at.clause}-${at.role}:${modifierIndex}"]`
const portrait = (entityId: string) => query(`[data-portrait="${entityId}"]`) ?? query(`[data-entity-id="${entityId}"]`)

/** 전투 이벤트별 연출. 대상 요소가 없으면 조용히 건너뛴다. */
export const fxRegistry: EffectHandlers<CombatEvent> = {
  async placed(event, speed) {
    const el = query(slotSelector(event.at, event.modifierIndex))
    if (el) await inkSpread(el, speed)
  },
  async rejected(event, speed) {
    const el = event.at ? query(slotSelector(event.at, null)) : query('[data-testid="hand"]')
    if (el) await Promise.all([shake(el, 4, speed), flash(el, '#ff5a52', speed)])
  },
  async intervention(event, speed) {
    const from = query('[data-testid="intent"]') ?? query('[data-portrait^="e"]')
    const to = 'at' in event.step ? query(slotSelector(event.step.at, null)) : query('[data-testid="hand"]')
    if (from && to) await penStroke(from, to, speed)
    if (to) await flash(to, '#ff5a52', speed)
  },
  async clauseExecuted(event, speed) {
    const slots = Array.from(document.querySelectorAll(`[data-clause="${event.clause}"] [data-slot]`))
    await readAloud(slots, speed)
  },
  async fizzled(event, speed) {
    const clause = query(`[data-clause="${event.clause}"]`)
    if (clause)
      await clause.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 500 / speed }).finished
  },
  async damaged(event, speed) {
    const el = portrait(event.entityId)
    if (!el) return
    const text = event.amount > 0 ? `-${event.amount}` : `막음 ${event.blocked}`
    await Promise.all([
      flash(el, '#ffffff', speed),
      shake(el, Math.min(12, 2 + event.amount / 2), speed),
      popNumber(el, text, 'damage', speed),
    ])
  },
  async healed(event, speed) {
    const el = portrait(event.entityId)
    if (el) await popNumber(el, `+${event.amount}`, 'heal', speed)
  },
  async statusApplied(event, speed) {
    const el = portrait(event.entityId)
    if (!el) return
    if (event.status === 'block') await popNumber(el, `🛡${event.amount}`, 'block', speed)
    else if (event.status === 'poison') await popNumber(el, `☠${event.amount}`, 'poison', speed)
    else await popNumber(el, '잠듦', 'block', speed)
  },
  async poisonTick(event, speed) {
    const el = portrait(event.entityId)
    if (el) await popNumber(el, `☠-${event.amount}`, 'poison', speed)
  },
  async summoned(_event, speed) {
    await wait(200, speed)
  },
  async died(event, speed) {
    const el = portrait(event.entityId)
    if (el) await meltDown(el, speed)
  },
  async dried(event, speed) {
    const el = query(slotSelector(event.at, event.modifierIndex))
    if (el) await fadeAway(el, speed)
  },
  async polluted(_event, speed) {
    const el = query('[data-testid="discard"]')
    if (el) await shake(el, 6, speed)
  },
  async hpLost(event, speed) {
    const el = portrait(event.entityId)
    if (el) await Promise.all([shake(el, 4, speed), popNumber(el, `HP −${event.amount}`, 'damage', speed)])
  },
  async grew(event, speed) {
    const el = portrait(event.entityId)
    if (el) await popNumber(el, `최대 HP +${event.amount}`, 'heal', speed)
  },
  async cleansed(event, speed) {
    const el = portrait(event.entityId)
    if (el) await popNumber(el, '정화', 'heal', speed)
  },
  async swapped(event, speed) {
    const slots = [query(`[data-slot="${event.clause}-subject"]`), query(`[data-slot="${event.clause}-object"]`)]
    await Promise.all(slots.filter((el): el is Element => el !== null).map((el) => inkSpread(el, speed)))
  },
  async cast(event, speed) {
    const sentence = query('[data-testid="sentence"]')
    if (sentence) await flash(sentence, event.by === 'player' ? '#fcba5b' : '#ff5a52', speed)
  },
  async burned(_event, speed) {
    const el = query('[data-testid="hand"]')
    if (el) await shake(el, 5, speed)
  },
  async combatEnded(_event, speed) {
    await wait(300, speed)
  },
}
