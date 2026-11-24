/**
 * 런 기계 검증 리포트와 게이트 (런 spec §7).
 * 사용법: npm run sim:run -- [--runs N] [--iterations N] [--gate] [--skip-train]
 *   --gate        목표를 판정하고, 하나라도 실패하면 exit 1
 *   --skip-train  저장된 학습 가중치(src/game/sim/learnedWeights.json)를 쓴다
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { RelicId } from '@/game/build/build'
import { RELICS } from '@/game/build/relics'
import type { OfferKind } from '@/game/run/shop'
import { type RunResult, type ShopPolicy, simulateRun } from '@/game/sim/runSim'
import { RUN_TARGETS as T } from '@/game/sim/runTargets'
import { ARCHETYPES, noShopBot, randomShopBot, type ShopWeights, trainShopWeights, weightedShopBot } from '@/game/sim/shopBots'

const WEIGHTS_PATH = 'src/game/sim/learnedWeights.json'
const TRAIN_SEEDS = Array.from({ length: 30 }, (_, i) => i + 1)

function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = Number.parseInt(process.argv[index + 1] ?? '', 10)
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`${name}는 양의 정수여야 합니다.`)
    process.exit(1)
  }
  return value
}
const runs = argValue('--runs', 60)
const iterations = argValue('--iterations', 40)
const gate = process.argv.includes('--gate')
const skipTrain = process.argv.includes('--skip-train')
const evalSeeds = Array.from({ length: runs }, (_, i) => 1001 + i)

function isShopWeights(value: unknown): value is ShopWeights {
  return typeof value === 'object' && value !== null && 'kinds' in value && 'saveThreshold' in value
}

const started = Date.now()
let learned: ShopWeights
if (skipTrain) {
  const parsed: unknown = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8'))
  if (!isShopWeights(parsed)) throw new Error(`${WEIGHTS_PATH} 형식이 맞지 않습니다.`)
  learned = parsed
} else {
  learned = trainShopWeights(TRAIN_SEEDS, iterations, 42)
  writeFileSync(WEIGHTS_PATH, `${JSON.stringify(learned, null, 2)}\n`)
  console.log(`학습 완료 (${((Date.now() - started) / 1000).toFixed(0)}초): ${WEIGHTS_PATH}`)
}

const policies: [string, ShopPolicy][] = [
  ['학습', weightedShopBot(learned)],
  ...Object.entries(ARCHETYPES).map(([name, w]): [string, ShopPolicy] => [`유형:${name}`, weightedShopBot(w)]),
  ['무작위', randomShopBot],
  ['안 삼', noShopBot],
]

const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
const quantile = (xs: readonly number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5)
const num = (x: number, width = 6) => x.toFixed(1).padStart(width)

interface Summary {
  readonly name: string
  readonly results: readonly RunResult[]
  readonly winRate: number
  readonly avgFloor: number
  readonly burstMean: number
  readonly burstTop: number
  readonly eliteTurns: number
  readonly twoClauseRate: number
}

function summarize(name: string, results: readonly RunResult[]): Summary {
  const bursts = results.map((r) => r.bestBurst)
  const eliteTurns = results.flatMap((r) => r.floorTurns.filter((f) => f.tier !== 'normal').map((f) => f.turns))
  const casts = results.reduce((sum, r) => sum + r.casts, 0)
  return {
    name,
    results,
    winRate: results.filter((r) => r.outcome === 'won').length / results.length,
    avgFloor: mean(results.map((r) => r.floorReached)),
    burstMean: mean(bursts),
    burstTop: quantile(bursts, 0.75),
    eliteTurns: mean(eliteTurns),
    twoClauseRate: casts === 0 ? 0 : results.reduce((sum, r) => sum + r.twoClauseCasts, 0) / casts,
  }
}

console.log(`\n평가 시드 ${runs}개 (${evalSeeds[0]}~${evalSeeds[evalSeeds.length - 1]})\n`)
console.log('정책          완주율 평균층  한방평균 한방상위25% 정예·보스턴 두절낭독  구매(단어/강화/구조/유물)')
const summaries: Summary[] = []
for (const [name, policy] of policies) {
  const s = summarize(name, evalSeeds.map((seed) => simulateRun(seed, policy)))
  summaries.push(s)
  const purchases = s.results.flatMap((r) => r.purchases)
  const share = (kind: OfferKind) => (purchases.length === 0 ? 0 : purchases.filter((p) => p.kind === kind).length / purchases.length)
  console.log(
    `${name.padEnd(13)} ${pct(s.winRate)} ${num(s.avgFloor)} ${num(s.burstMean, 9)} ${num(s.burstTop, 10)} ${num(s.eliteTurns, 10)} ${pct(s.twoClauseRate).padStart(8)}` +
      `   ${(['word', 'upgrade', 'structure', 'relic'] as const).map((k) => pct(share(k))).join(' ')}`,
  )
}

const attackOnlyRuns = evalSeeds.map((seed) => simulateRun(seed, weightedShopBot(learned), undefined, 'attackOnly'))
const attackOnly = summarize('때리기만(학습 구매)', attackOnlyRuns)
console.log(`${attackOnly.name.padEnd(13)} ${pct(attackOnly.winRate)} ${num(attackOnly.avgFloor)} ${num(attackOnly.burstMean, 9)} ${num(attackOnly.burstTop, 10)} ${num(attackOnly.eliteTurns, 10)}`)

const learnedRuns = summaries[0].results
const perRun = (pick: (r: RunResult) => number) => num(mean(learnedRuns.map(pick)))
const learnedCasts = learnedRuns.reduce((sum, r) => sum + r.casts, 0)
console.log('\n보고 지표(학습 봇, 런당 평균)')
console.log(`  서고 바닥으로 잃은 HP ${perRun((r) => r.emptyDrawHpLost)} · 떠올린 카드 ${perRun((r) => r.recalledCards)} · 새로고침 ${perRun((r) => r.rerolls)}`)
console.log(`  낭독 중 기본 동사 ${pct(learnedCasts === 0 ? 0 : learnedRuns.reduce((s, r) => s + r.basicVerbCasts, 0) / learnedCasts)} · 되받아친다 ${pct(learnedCasts === 0 ? 0 : learnedRuns.reduce((s, r) => s + r.counterCasts, 0) / learnedCasts)} · 지원 동사 ${pct(learnedCasts === 0 ? 0 : learnedRuns.reduce((s, r) => s + r.supportCasts, 0) / learnedCasts)}`)

console.log(`시간 초과(교착) 런: ${summaries.map((s) => `${s.name} ${s.results.filter((r) => r.timedOut).length}`).join(' · ')}`)

const learnedSummary = summaries[0]
console.log('\n유물별 완주율(학습 봇, 산 런 / 안 산 런)')
for (const id of Object.keys(RELICS) as RelicId[]) {
  const bought = learnedSummary.results.filter((r) => r.purchases.some((p) => p.kind === 'relic' && p.id === id))
  const notBought = learnedSummary.results.filter((r) => !bought.includes(r))
  const rate = (rs: readonly RunResult[]) => (rs.length === 0 ? '   -' : pct(rs.filter((r) => r.outcome === 'won').length / rs.length))
  console.log(`  ${RELICS[id].name.padEnd(8)} ${rate(bought)} (${bought.length}런) / ${rate(notBought)}`)
}
console.log(`\n학습 가중치: ${JSON.stringify(learned)}`)
console.log(`소요 ${((Date.now() - started) / 1000).toFixed(0)}초`)

if (gate) {
  const random = summaries.find((s) => s.name === '무작위')
  const none = summaries.find((s) => s.name === '안 삼')
  const archetypesNear = summaries.filter((s) => s.name.startsWith('유형:') && learnedSummary.winRate - s.winRate <= T.archetypeGap).length
  const checks: [string, boolean, string][] = [
    ['학습 봇 완주율', learnedSummary.winRate >= T.learnedWinRate[0] && learnedSummary.winRate <= T.learnedWinRate[1], pct(learnedSummary.winRate)],
    ['무작위 구매 격차', !!random && learnedSummary.winRate - random.winRate >= T.randomGap, random ? pct(learnedSummary.winRate - random.winRate) : '-'],
    ['안 삼 완주율', !!none && none.winRate <= T.noShopMaxWinRate, none ? pct(none.winRate) : '-'],
    ['학습 봇 근처 유형 수', archetypesNear >= T.minArchetypes, `${archetypesNear}`],
    ['상위 25% 최대 한 방', learnedSummary.burstTop >= T.topQuartileBurst, num(learnedSummary.burstTop)],
    ['정예·보스 평균 턴', learnedSummary.eliteTurns <= T.eliteMaxTurns, num(learnedSummary.eliteTurns)],
    ['때리기만 봇 격차', learnedSummary.winRate - attackOnly.winRate >= T.attackOnlyGap, pct(learnedSummary.winRate - attackOnly.winRate)],
  ]
  console.log('\n게이트')
  for (const [label, ok, value] of checks) console.log(`  ${ok ? '통과' : '실패'}  ${label}: ${value}`)
  if (checks.some(([, ok]) => !ok)) process.exit(1)
}
