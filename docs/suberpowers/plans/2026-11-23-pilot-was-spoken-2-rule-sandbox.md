# Pilot Sentence — Plan 2: 규칙 샌드박스 Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: suberpower:executing-plans. Step은 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 카드 경제 구조(손패 이월, 드로우, 자원, 단어 지속, 실행 시점)를 프리셋 A/B/C로 바꿔 가며 비교할 수 있는 한 화면짜리 샌드박스를 만든다. 카드 32장, 조우 3종, 결과 미리보기, 덱 편집, 프리셋별 기계 지표를 갖춘다.

**Architecture:** 엔진은 `RuleConfig`를 인자로 받는다. 행동은 `place | swap | drawPaid | cast | endTurn`이다. 형용사는 "슬롯에 있는 개체의 성질"로 다룬다. 피해 한 번마다 공격자 슬롯의 outgoing 수식과 피격자 슬롯의 incoming 수식을 적용한다. 미리보기는 상태 사본에서 개입과 실행을 돌린 결과다.

**Spec:** `docs/suberpowers/specs/2026-11-23-pilot-was-spoken-design.md` 10장 (1~3장과 충돌하면 10장이 우선)

## Global Constraints
- Plan 1의 Global Constraints를 따른다.
- 화면은 1440×900에서 스크롤이 없어야 한다(e2e로 검증).
- 엔진 규칙 테스트는 `test-` 접두사의 고정 조우를 쓴다(실제 조우는 밸런스 게이트만 검증).

## Review Focus
1. 손패가 최대치(7)일 때의 드로우: 넘치는 카드는 버림 더미로 간다(소각 이벤트). 손패가 7을 넘지 않는다.
2. 자원이 부족한 상태에서 유료 드로우, 덱과 버림 더미가 모두 빈 상태에서 유료 드로우: 거부한다(자원을 쓰지 않는다).
3. 자동사로 바뀐 문장의 목적어 슬롯: 실행 시 무시하고, 배치는 거부하며(`slotInactive`), 다시 타동사가 놓이면 원래 목적어가 살아난다.
4. `모두`가 주어인 절에서 플레이어가 죽는 경우: 적이 함께 전멸해도 패배로 판정한다. 죽은 개체는 이후 반복 실행에서 빠진다.
5. 낭독 모드에서 낭독 직후 턴 종료 흐름: 소비된 플레이어 단어는 버림 더미로 가고 원문이 복원된다. 같은 턴에 두 번 낭독할 수 없다.

## Tasks

### Task 1: 상태 이상 확장 (kit/core)
- `StatusKind`에 `strength | weak | vulnerable`을 추가한다. `tickEndOfTurn`에서 weak과 vulnerable은 1 줄고, strength는 유지된다.
- `scaleOutgoing(base: number, source: Entity): number` = `(base + strength) × (weak > 0 ? 0.75 : 1)`, `scaleIncoming(amount: number, target: Entity): number` = `amount × (vulnerable > 0 ? 1.5 : 1)`. 소수점은 호출자가 마지막에 floor한다.
- 테스트: 지속 감소, 힘 가산, 약화·취약 배율.

### Task 2: 규칙 설정과 콘텐츠 (game/content)
- `rules.ts`: `RuleConfig { id; name; handCarry: 'discard'|'keep'; handMax; startHand; autoDraw; paidDrawCost: number|null; resource: {mode:'fixed',perTurn}|{mode:'ramp',start,max}|{mode:'ink',regen,max,start}; persistence: 'dry'|'permanent'|'untilCast'; execution: 'auto'|'cast'; freeSwapsPerTurn }`와 `PRESETS: Record<'A'|'B'|'C', RuleConfig>`(spec 10.1의 값).
- `words.ts`: spec 10.5의 32장, 적 전용 단어(거미, 새끼 거미, 슬라임, 깨문다 피해 2, 짓누른다 피해 8, 거미줄)를 정의한다. `WordEffect`를 확장한다.
  - TargetRef: `allies`, `everyone`
  - VerbAction: `damage{amount, lifesteal?}`, `mutualDamage{amount}`, `loseHp{amount,to}`, `status{status,amount,to}`, `grow{amount,to}`, `cleanse{to}`
  - AdjectiveMod: `outgoingFlat`, `incomingFlat`, `incomingMul`, `selfDamageAfter`
  - AdverbMod: `repeat`, `executionBonus`, `ignoreFreeze`, `inkBonus`
- `tokens.ts`에 돌골렘(HP 15)을 추가한다. `encounters.ts`에 거미, 거미 떼, 슬라임과 `castEvery`(낭독 모드에서 적이 낭독하는 주기, 기본 2), `STARTER_DECK`(15장)를 둔다.
- 테스트: 콘텐츠 검증(초기 문장 적합성, 단어 32장 + 적 전용, 시작 덱 15장, 모든 프리셋 값).

### Task 3: 동사가 문형을 결정 (grammar, sentence)
- `FRAMES.transitive`의 동사 슬롯이 `verbTransitive`와 `verbIntransitive`를 모두 받는다. `isSlotActive(board, at)`: 목적어 슬롯은 같은 절의 동사가 타동사일 때만 활성이다.
- `placeWord`는 비활성 슬롯에 놓으면 `slotInactive`로 거부한다. `renderClause`는 비활성 슬롯과 그 조사를 내보내지 않는다.
- 테스트: 자동사를 놓으면 목적어가 비활성이 되고, 타동사로 되돌리면 원래 목적어가 다시 보인다. 비활성 슬롯 배치는 거부된다.

### Task 4: 절 실행 재작성 (resolve)
- 대상: `allies`(플레이어와 아군 토큰), `everyone`(살아 있는 전원).
- 개체별 수식 묶음: 개체가 속한 슬롯(주어/목적어)의 형용사들. 피해 한 번 = `floor(scaleIncoming((scaleOutgoing(base × 부사 배율 + executionBonus, 공격자) + outgoingFlat) × outgoingMul, 피격자) × incomingMul) − incomingFlat`(0 이상).
- 부사: `repeat`는 동사 전체를 n회 반복하고, 반복마다 죽은 개체를 다시 걸러낸다. `ignoreFreeze`는 빙결을 소모하지 않고 실행한다.
- 실행 후 `selfDamageAfter` 수식이 있는 슬롯의 살아 있는 개체가 피해를 입는다.
- 반환 이벤트에 `statusApplied`(새 상태 포함), `healed`, `damaged`, `died`, `fizzled`, `summoned`를 쓴다.
- 테스트: 그룹 주어·목적어, 끌어안는다, 삼킨다 흡혈, 희생한다, 힘·약화·취약 계산, 단단한·금이 간, 두 번 반복 중 사망, 굶주린 자해, 모두가 무너진다(플레이어 포함).

### Task 5: 전투 reducer v2와 미리보기 (combat)
- `startCombat(encounterId, deck, seed, balance, rules)`. 상태에 `rules`, `resource`, `swapsLeft`, `executions`, `castThisTurn`을 추가한다.
- 행동:
  - `place`: 비용은 자원에서 낸다.
  - `swap`: 절 i의 주어와 목적어 명사구를 교환한다. 목적어가 비활성이면 거부한다. `swapsLeft`를 소모한다.
  - `drawPaid`: `paidDrawCost`가 있을 때만 쓸 수 있다. 덱이 비어 있으면 거부한다.
  - `cast`: execution이 `cast`일 때만 쓸 수 있다. 실행한 뒤 플레이어 단어를 소비하고 원문을 복원한 다음 `endTurn` 흐름으로 이어진다.
  - `endTurn`: 손패 처리(버림/유지) → 개입 → (자동 실행 또는 적 낭독 주기) → 지속 처리(건조/영구/소비) → 상태 처리 → 승패 → 다음 턴(자원 회복, 드로우, 손패 상한 초과분 소각, 뒤바꾸기 회복).
- 이벤트를 추가한다: `swapped`, `burned`, `cast`(주체 player/enemy), `resourceGained`.
- `previewExecution(state): PreviewLine[]`(`{ text: string; tone: 'harm'|'help'|'neutral' }`). 자동 모드는 예고된 개입 적용 후, 낭독 모드는 지금 낭독하는 경우로 계산한다.
- 테스트: 프리셋별 흐름(손패 이월, 자원 모드 3종, 유료 드로우, 손패 상한, 뒤바꾸기 1회, 낭독 후 소비, 적 낭독 주기, 건조/영구), 미리보기 문구, Review Focus 1·2·4·5.

### Task 6: 시뮬레이터 v2, 지표, 밸런스 게이트
- `combatGame(encounterId, rules, deck)`의 합법 행동에 swap, drawPaid, cast를 포함한다. 탐욕 봇은 "행동 → 턴 종료(또는 낭독)" 결과로 평가한다.
- 지표: 승률, 승리 시 HP 손실, 평균 턴, 쓸 수 없는 손패 비율, 선택지 다양성(서로 다른 결과 상태 수), 뻔한 최선 비율(1·2위 점수 차 ≥ 10).
- CLI `npm run sim -- <encounter|all> [runs]`가 프리셋 × 조우 표를 출력한다.
- 게이트: 프리셋 B에서 세 조우 모두 탐욕 봇 승률 60~85%, 승리 시 HP 손실 15~35, 무행동 0%. 데이터만 바꿔 튜닝한다. 결과를 worklog에 기록한다.

### Task 7: 한 화면 UI
- `100vh` 그리드: 상단 막대(프리셋, 조우, 덱 편집, 시드) / 전장(초상화 축소) / 문장 + 흉조 + 미리보기 / 손패 + 자원 + 행동 버튼(뒤바꾸기, 추가 드로우, 낭독, 턴 종료).
- 자원 표시는 프리셋에 맞춘다(행동력/마나/잉크). 비활성 목적어 슬롯은 회색으로 표시한다. 지목은 적이 둘 이상이면 초상화를 클릭해 대상을 고른다.
- 새 이벤트(swapped, cast, burned)의 연출을 추가한다.

### Task 8: 덱 편집
- 모달: 요소별 카드 풀, 장수 ± 버튼, 12~20장 검증, 기본 덱으로 되돌리기. `localStorage`에 저장한다. 전투를 시작할 때 저장된 덱을 쓴다.
- 테스트: 덱 검증 함수(장수 범위, 오염·적 전용 단어 제외).

### Task 9: e2e와 최종 검증
- e2e: 프리셋 전환, 뒤바꾸기, 낭독(C), 덱 편집 저장, **1440×900에서 `scrollHeight <= innerHeight`**.
- 전체 검증 후 커밋하고, 최종 리뷰를 맡긴다.
