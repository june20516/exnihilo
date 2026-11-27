# 방송망쳐야돼 Plan B2 (화면) Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** 방송 화면 전체를 시안대로 다시 그려, 플레이어가 화면만 보고 "누가 곧 터지나, 왜 저러나, 방금 무슨 일이 있었나"에 답할 수 있게 한다.

**Architecture:** 엔진은 규칙과 수치를 그대로 두고, 화면에 넘길 정보 세 가지만 더한다(연쇄 줄 주인공, 버릇 이모트, 로그 줄 이어받기 머리). 화면 계산은 `src/app`의 순수 함수 모듈로 떼어 단위 테스트하고, React 컴포넌트와 Pixi 렌더러는 그 결과를 그린다. 배치 세 가지는 한 DOM 구조에서 CSS grid 영역만 바꿔, 스튜디오 렌더러와 카메라 캔버스를 다시 만들지 않는다.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind v4, Pixi.js 8, Rapier(결정론 60Hz), Vitest(+jsdom, Testing Library), Playwright, tsx 스크립트, pngjs(새 개발 의존성)

**Spec:** `docs/suberpowers/specs/2026-11-27-pilot-showmustgowrong-planb2-design.md` (시안: `docs/suberpowers/specs/assets/2026-11-27-planb2/`)

작업 디렉터리는 모두 `pilot-showmustgowrong/` 기준이다.

## Global Constraints

- 엔진 규칙과 수치를 바꾸지 않는다. `npm run sim` 출력은 이 plan 시작 커밋과 글자 단위로 같아야 한다(Task 2, 12에서 비교).
- `any` 금지. 새 코드의 이름과 주석은 기존 파일 관례(한국어 주석)를 따른다.
- 시간 표기: 몸 1초 = 실제 1초(슬로모션 밖), 극 중 1분 = 실제 6초. 조정 항목 단위는 `'몸 초'`, `'포인트'`.
- 화면 글은 게임 정보만. 영어는 "ON AIR", "SLOW"만. 시안의 장식 문구(사운드스테이지, ISO 45°, REC, LIVE TALK SHOW, LIVE FEED, 상태 띠, JUDGMENT MODE, FREEZE FRAME, DECISION WINDOW)는 넣지 않는다.
- 출연자 색: 렉스 `#EF4444`, 프리야 `#A855F7`, 오카포 `#14B8A6`, 모 `#F97316`, 준 `#22C55E`.
- 감정 색: 짜증 `#EF4444`, 흥분 `#FACC15`, 불안 `#A855F7`, 지루함 `#64748B`, 주목 욕구 `#EC4899`, 수다 욕구 `#38BDF8`.
- 기준 해상도 1280×720. 새 UI는 이 크기에서 잘리거나 줄바꿈되지 않아야 한다(위 띠 글자는 한 줄).
- 머리 위 배지: 0단계 흐린 아이콘만, 1단계 감정 색 반 고리 + 단계 이름, 2단계 1단계의 1.6배 + 빨간 꽉 찬 고리 + 단계 이름 + 실제 0.5초 주기 깜박임(슬로모션 중에도 실제 시간).
- 감정 변화 크기: |양| < `SHIFT_SIZE_SOME`(20) "조금", < `SHIFT_SIZE_BIG`(30) "꽤", 그 이상 "크게". 올림 "▲", 내림 "▼".
- 터짐 근접도: 감정 하나는 `[0,r1]→[0,50]`, `[r1,r2]→[50,80]`, `[r2,100]→[80,100]` 구간별 직선, 출연자는 감정 중 최댓값. 몸 0.5초(30스텝)마다 기록, 창은 `TREND_WINDOW_BODY_SECONDS`(60).
- 버릇 이모트는 몸 `EMOTE_BODY_SECONDS`(2)초 보인다.
- 배치 저장 키 `exnihilo.showmustgowrong.layout`, 전환 키 `L`(수정자 키, 입력 칸 무시). 순서 기본 → 스튜디오 크게 → 송출 화면 크게 → 기본.
- 리뷰 Minor는 미루지 않고 그 task 안에서 고친다(사용자 규칙).

## Review Focus

1. 이탈했거나 마음이 없는 출연자(감정 배열이 빈 경우)가 추세 그래프, 정보 카드, 판단 카드, 배지에서 오류 없이 빠지거나 "정보 없음"으로 보여야 한다 → Task 3, 9, 10 테스트.
2. 화면 가장자리(네 모서리) 출연자에게 정보 카드를 띄워도 카드가 스튜디오 패널 밖으로 나가지 않아야 한다 → Task 3(`placeCard`) 테스트, Task 12 e2e.
3. 저장된 배치 값이 깨졌거나 저장소를 쓸 수 없을 때(사파리 비공개 모드 등) 기본 배치로 열려야 한다 → Task 7 테스트.
4. 배치를 바꿔도 방송이 이어지고 송출 카메라·클로즈업 대상·드래그가 그대로여야 한다(렌더러와 캔버스가 다시 만들어지지 않음) → Task 7 테스트, Task 12 e2e.
5. 사고 연쇄가 전혀 없던 방송(뿌리 없음, 연쇄 0줄)에서도 정산 화면이 뜨고 "큰 사고 없이 끝났다"가 보여야 한다 → Task 11 테스트.

---

## 컨트롤러 준비 (Task 4 dispatch 전에 컨트롤러가 직접)

- Stitch로 렉스 시트를 효과 없이 다시 만든다(spec 3.1, 다른 넷과 같은 프롬프트 틀). 렉스·프리야·오카포·모·준 시트와 준 쓰러짐 단독 그림의 원본을 `=s0` 또는 `download_file`로 받아 `sips`로 PNG로 바꿔 `art-source/sheets/{rex,priya,okafor,mo,june,june-fallen}.png`에 둔다. 준 날아감 포즈의 효과선은 Task 4의 자르기에서 따로 지운다.

---

### Task 1: 콘텐츠 — 출연자 색, 버릇 이모트, 화면 조정 항목

**Files:**
- Modify: `src/content/types.ts`(PerformerDef, HabitDef), `src/content/lineup.ts`, `src/content/commonMind.ts`, `src/content/minds/*.ts`, `src/content/validate.ts`, `src/content/tuning.ts`
- Test: `src/content/validate.test.ts`, `src/content/content.test.ts`, `src/content/tuning.test.ts`

**Interfaces:**
- Produces: `PerformerDef.color: string`(`#RRGGBB`), `HabitDef.emote: string`(그래핌 1개), 조정 키 `EMOTE_BODY_SECONDS`, `TREND_WINDOW_BODY_SECONDS`, `SHIFT_SIZE_SOME`, `SHIFT_SIZE_BIG`(새 그룹 `'화면'`).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// validate.test.ts
it('출연자 색이 #RRGGBB가 아니면 오류', () => { /* color: 'red' → errors에 '색' 포함 */ })
it('출연자 색이 겹치면 오류', () => { /* 두 출연자 같은 color → 오류 */ })
it('버릇 이모트가 비었거나 그래핌 2개 이상이면 오류', () => { /* '' 와 '😀😀' 각각 오류 */ })
// content.test.ts
it('기본 라인업과 벤치 출연자 색은 spec 값', () => {
  expect(colorsById()).toEqual({ rex: '#EF4444', priya: '#A855F7', okafor: '#14B8A6', mo: '#F97316', june: '#22C55E' })
})
it('모든 버릇에 이모트가 있고 검사를 통과한다', () => { expect(validateShow(...).errors).toEqual([]) })
it('지시 expect에 ▲ 또는 ▼가 있으면 오류(감정 변화는 moodShifts 칩으로만 보인다)', ...)
it('오카포 진정하세요의 expect는 "자리에서 숨을 고른다"', ...)
// tuning.test.ts
it('화면 그룹 4개 항목 기본값', () => {
  expect(defaults(['EMOTE_BODY_SECONDS','TREND_WINDOW_BODY_SECONDS','SHIFT_SIZE_SOME','SHIFT_SIZE_BIG'])).toEqual([2, 60, 20, 30])
})
it('SHIFT_SIZE_SOME >= SHIFT_SIZE_BIG 이면 관계 위반', () => { /* enforceConstraints가 거부 */ })
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run src/content` → 위 테스트 FAIL.

- [ ] **Step 3: 구현**
  - 그래핌 수는 `Intl.Segmenter('ko', { granularity: 'grapheme' })`로 센다.
  - 이모트는 버릇 문장에 맞는 이모지 한 글자씩 고른다(예: 코를 판다 → 👃, 하품 → 🥱, 시계를 본다 → ⌚). 같은 이모지를 여러 버릇이 써도 된다.
  - 조정 항목: `EMOTE_BODY_SECONDS` 몸 초, 기본 2, 범위 `{ min: 0.5, max: 5, step: 0.5 }`. `TREND_WINDOW_BODY_SECONDS` 몸 초, 60, `{ min: 20, max: 180, step: 10 }`. `SHIFT_SIZE_SOME` 포인트, 20, `{ min: 5, max: 60, step: 5 }`. `SHIFT_SIZE_BIG` 포인트, 30, `{ min: 5, max: 80, step: 5 }`. 관계: `SHIFT_SIZE_SOME < SHIFT_SIZE_BIG`. 설명 문구는 spec 4.2·5·7의 근거 한 줄.
  - 조정 항목 총수를 세는 기존 테스트가 있으면 4 늘린다.
  - 지시 `expect` 13개에서 괄호 속 감정 변화 표기("(짜증 ▼)" 등)를 지운다. 오카포 `calmDown`의 `expect`는 `'자리에서 숨을 고른다'`. 나머지는 괄호 앞 문장을 그대로 둔다.

- [ ] **Step 4: 통과 확인** — `npx vitest run src/content && npx tsc --noEmit` → PASS, 오류 0.

- [ ] **Step 5: Commit** — `feat(content): 출연자 색, 버릇 이모트, 화면 조정 항목`

---

### Task 2: 엔진 — 화면에 넘길 정보 세 가지

**Files:**
- Modify: `src/sim/engineTypes.ts`, `src/sim/engine.ts`, `src/sim/life.ts`(버릇 이모트 기록), 로그 줄을 만드는 곳(이어받기 머리를 붙이는 B1 코드)
- Test: `src/sim/engine.test.ts`(또는 같은 관례의 새 파일 `src/sim/engine.screenData.test.ts`)

**Interfaces:**
- Consumes: Task 1 `HabitDef.emote`, `tuned('EMOTE_BODY_SECONDS')`
- Produces:
  - `ChainLine.actorId: string | null` — 그 줄 사건의 주인공(사건 source)이 출연자(라인업 또는 벤치)면 그 id, 아니면 null.
  - `ActorView.habit: { emote: string; startedStep: number } | null` — 마지막 버릇을 시작한 스텝부터 `EMOTE_BODY_SECONDS × 60` 스텝 동안만 non-null. 이탈하면 null. 기존 `lastHabit`(회상 문장용)과 따로 기록해 회상 규칙이 이모트를 지우지 않게 한다.
  - `LogLine.leadIn: string | null` — 이어받은 사고 줄의 앞머리("프리야의 킥킥거림에 이어 ")와 정확히 같은 문자열. `text`는 그대로 앞머리를 포함한다(`text.startsWith(leadIn)` 항상 참). 그 밖의 줄은 null.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('longestChain 줄의 actorId는 사건 주인공 출연자, 장비·관객이면 null', ...)
it('버릇 직후 ActorView.habit.emote는 버릇 정의의 emote이고 EMOTE_BODY_SECONDS 뒤 null', ...)
it('이어받은 사고 줄은 leadIn이 있고 text가 leadIn으로 시작한다. 다른 줄은 leadIn null', ...)
```
(B1의 `engine.takeover.test.ts` 셋업을 재사용해 이어받기 줄을 만든다.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/sim` → 새 테스트 FAIL.

- [ ] **Step 3: 구현** — 위 Interfaces대로. RNG 호출 순서와 수를 바꾸지 않는다.

- [ ] **Step 4: 통과와 결정론 확인**
  - `npx vitest run && npx tsc --noEmit` → 전부 PASS.
  - `git stash; npm run sim > /tmp/sim-before.txt; git stash pop; npm run sim > /tmp/sim-after.txt; diff /tmp/sim-before.txt /tmp/sim-after.txt` → 차이 없음, 종료 코드 0. (임시 파일 경로는 scratchpad를 써도 된다.)

- [ ] **Step 5: Commit** — `feat(sim): 화면용 연쇄 주인공, 버릇 이모트, 이어받기 머리`

---

### Task 3: 화면 계산 순수 함수

**Files:**
- Create: `src/app/emotionDisplay.ts`, `src/app/trendRecorder.ts`, `src/app/cardPlacement.ts`
- Test: `src/app/emotionDisplay.test.ts`, `src/app/trendRecorder.test.ts`, `src/app/cardPlacement.test.ts`

**Interfaces:**
- Consumes: `ActorView`, `EmotionView`, `MoodShift`, `reasonNoun`(`src/sim/narration.ts`), Task 1 조정 키
- Produces:
  - `emotionProximity(value: number, rise: readonly [number, number]): number`
  - `actorProximity(actor: ActorView): number | null` — 이탈(`walkedOut`)이거나 감정이 없으면 null
  - `type ShiftSize = '조금' | '꽤' | '크게'`; `shiftSize(amount: number, some?: number, big?: number): ShiftSize`(기본값 `tuned(...)`)
  - `formatMoodShift(shift: MoodShift, emotionName: string): { text: string; rising: boolean }` — text 예 `'짜증 ▼ 크게'`
  - `topReasons(emotion: EmotionView, nameOf: (id: string) => string, count?: number): { text: string; amount: number }[]` — 양수 양만, 큰 순, 기본 3개, `relief`는 건너뜀, amount는 반올림 정수
  - `interface TrendSeries { actorId: string; points: { step: number; value: number | null }[] }`
  - `class TrendRecorder { constructor(actorIds: readonly string[], sampleEverySteps?: number /* 30 */); record(view: BroadcastView): void; window(endStep: number, windowSteps: number): TrendSeries[]; all(): TrendSeries[] }` — 같은 표본 구간에 여러 번 불려도 점은 하나, 스텝이 건너뛰어도 건너뛴 표본 칸마다 지금 값으로 하나씩 채움, 이탈한 출연자는 value null
  - `placeCard(anchor: { x: number; y: number }, card: { width: number; height: number }, bounds: { width: number; height: number }, gap?: number /* 12 */): { left: number; top: number }` — 오른쪽 우선, 넘치면 왼쪽, 세로는 앵커 중심에서 시작해 bounds 안으로 밀어 넣음. 카드가 bounds보다 크면 0에 붙임

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
expect(emotionProximity(0, [50, 80])).toBe(0)
expect(emotionProximity(50, [50, 80])).toBe(50)
expect(emotionProximity(65, [50, 80])).toBe(65)
expect(emotionProximity(100, [50, 80])).toBe(100)
expect(emotionProximity(30, [60, 90])).toBe(25)      // 문턱이 다른 감정
expect(emotionProximity(75, [60, 90])).toBe(65)
expect(actorProximity({ ...actor, walkedOut: true })).toBeNull()
expect(actorProximity({ ...actor, emotions: [] })).toBeNull()
expect([10, 15, 20, 25, 30, 50].map((a) => shiftSize(a, 20, 30))).toEqual(['조금','조금','꽤','꽤','크게','크게'])
expect(shiftSize(-40, 20, 30)).toBe('크게')
expect(formatMoodShift({ emotion: 'irritation', amount: -40 }, '짜증')).toEqual({ text: '짜증 ▼ 크게', rising: false })
expect(topReasons(emotionWith4Reasons, nameOf).map((r) => r.amount)).toEqual([24, 18, 9])
expect(topReasons(emotionWithOnlyRelief, nameOf)).toEqual([])
// TrendRecorder
it('30스텝마다 한 점, 같은 구간 중복 호출은 무시', ...)
it('window(600, 3600)은 step 0~600 점만, all()은 전부', ...)
it('이탈한 출연자 점은 null', ...)
// placeCard (bounds 470×600, card 300×260)
expect(placeCard({ x: 50, y: 100 }, card, bounds)).toEqual({ left: 62, top: 0 })     // 위로 넘침 → 0
expect(placeCard({ x: 400, y: 300 }, card, bounds).left).toBe(88)                     // 오른쪽 넘침 → 왼쪽(400-12-300)
expect(placeCard({ x: 460, y: 590 }, card, bounds)).toEqual({ left: 148, top: 340 })   // 오른쪽 아래 모서리
expect(placeCard({ x: 10, y: 10 }, { width: 600, height: 700 }, bounds)).toEqual({ left: 0, top: 0 })
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/emotionDisplay.test.ts src/app/trendRecorder.test.ts src/app/cardPlacement.test.ts` → FAIL.

- [ ] **Step 3: 구현** — signature와 테스트대로. `topReasons`의 문구는 `reasonNoun` 그대로.

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npx tsc --noEmit` 0.

- [ ] **Step 5: Commit** — `feat(app): 근접도, 추세 기록, 감정 변화 크기, 카드 배치 계산`

---

### Task 4: 캐릭터 그림 자르기 파이프라인과 30장

**Files:**
- Create: `scripts/cut-sprites.ts`, `scripts/spriteCut.ts`(순수 함수), `scripts/spriteCut.test.ts`, `art-source/poses/{rex,priya,okafor,mo,june}.json`, `src/assets/performers/<id>/<pose>.png`(30장), `art-source/contact-sheet.png`
- Modify: `package.json`(devDependencies `pngjs`, `@types/pngjs`; script `"sprites": "tsx scripts/cut-sprites.ts"`), `vitest` include에 `scripts/**/*.test.ts`가 없으면 추가

**Interfaces:**
- Consumes: 컨트롤러가 둔 `art-source/sheets/*.png`
- Produces: `src/assets/performers/<performerId>/<pose>.png`, pose는 `idle | laugh | angry | panic | flying | fallen`. 모든 출연자 6장.

- [ ] **Step 1: 실패하는 테스트 작성** (`scripts/spriteCut.test.ts`, 합성 이미지로)

```ts
it('가장자리와 이어진 흰 영역(232 이상)만 투명이 된다. 인물 안쪽의 흰 셔츠는 남는다', ...)
it('연결 요소를 찾아 경계 상자를 행 우선(위→아래, 왼→오른) 순서로 돌려준다', ...)
it('면적이 가장 큰 요소의 2% 미만인 조각은 버린다', ...)
it('키 맞춤: 기준 포즈(idle) 높이를 targetHeight로 맞춘 배율을 같은 출연자 모든 포즈에 쓴다', ...)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run scripts` → FAIL.

- [ ] **Step 3: 구현**
  - `spriteCut.ts`: `floodClearBackground(img, threshold = 232)`, `findComponents(img, minAreaRatio = 0.02): Box[]`, `cropScaled(img, box, scale): Png`, 경계 1px 블렌딩(투명과 맞닿은 불투명 픽셀의 알파를 이웃 평균으로).
  - `cut-sprites.ts` 두 단계: `npm run sprites -- components`는 시트마다 요소를 번호와 함께 `art-source/components/<id>/<n>.png`와 번호 대조 이미지로 낸다. 너는 그 이미지를 직접 보고 `art-source/poses/<id>.json`(`{ "idle": n, ... }`)을 쓴다. 화난 포즈가 둘이면 앞의 것, 준의 `fallen`은 `june-fallen.png`의 요소. 그다음 `npm run sprites -- build`가 30장과 5×6 대조 시트를 낸다.
  - 키(idle 높이 px): 렉스·프리야·오카포 256, 모 268, 준 205. 같은 출연자의 다른 포즈는 idle 배율을 그대로 쓴다.
  - 준 `flying`에 효과선이 남으면 그 요소에서 인물과 이어지지 않은 선 조각은 `findComponents`가 떨어뜨리고, 이어진 선은 대조 시트에 표시해 보고한다(손으로 지우지 않는다).

- [ ] **Step 4: 확인**
  - `npx vitest run scripts` PASS.
  - 출력 30장 존재(`ls src/assets/performers/*/*.png | wc -l` → 30).
  - 자체 검사: 각 PNG에서 투명과 맞닿은 불투명 픽셀 중 RGB가 모두 232 이상인 비율 < 1%(스크립트가 출력). 대조 시트를 직접 열어 포즈가 맞는지, 다른 인물이 섞이지 않았는지 보고서에 적는다.

- [ ] **Step 5: Commit** — 원본 시트, 포즈 매핑, 30장, 대조 시트, 스크립트를 함께. `feat(assets): 출연자 6포즈 그림 30장과 자르기 스크립트`

---

### Task 5: 스튜디오 렌더러 — 캐릭터 그림, 감정 배지, 이모트, 초점

**Files:**
- Create: `src/render/performerArt.ts`, `src/render/actorFigure.ts`, `src/render/emotionBadge.ts`, `src/render/emotionBadge.test.ts`
- Modify: `src/render/StudioRenderer.ts`(출연자 그리기를 `actorFigure.ts`로 옮기고 긴장도 막대·"곧 터짐!"·내성 점 제거), `src/render/colors.ts`

**Interfaces:**
- Consumes: Task 1 색, Task 2 `ActorView.habit`, Task 4 그림
- Produces:
  - `performerArtUrl(performerId: string, pose: Pose): string`(`import.meta.glob('../assets/performers/*/*.png', { eager: true, query: '?url', import: 'default' })`로 만든 표). 그림이 없는 id면 throw.
  - `EMOTION_STYLE: Record<EmotionId, { color: string; icon: string }>`(Global Constraints의 감정 색, 아이콘은 이모지)
  - `badgeLook(mood: MoodView | null): { size: 'faint' | 'normal' | 'large'; ring: 'none' | 'half' | 'full'; showName: boolean; blink: boolean }`
  - `blinkVisible(realMs: number): boolean` — 0.5초 주기(앞 250ms 보임)
  - `StudioRenderer.setFocus(actorId: string | null): void` — null이 아니면 다른 출연자 알파 0.45

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
expect(badgeLook(null)).toEqual({ size: 'faint', ring: 'none', showName: false, blink: false })
expect(badgeLook(mood(0))).toEqual({ size: 'faint', ring: 'none', showName: false, blink: false })
expect(badgeLook(mood(1))).toEqual({ size: 'normal', ring: 'half', showName: true, blink: false })
expect(badgeLook(mood(2))).toEqual({ size: 'large', ring: 'full', showName: true, blink: true })
expect([0, 249, 250, 499, 500].map(blinkVisible)).toEqual([true, true, false, false, true])
expect(() => performerArtUrl('nobody', 'idle')).toThrow()
expect(performerArtUrl('rex', 'fallen')).toMatch(/\.png/)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/render/emotionBadge.test.ts` → FAIL.

- [ ] **Step 3: 구현**
  - 그림은 Pixi `Sprite`, 발밑 기준(anchor 0.5, 1). 날아감·쓰러짐은 지금 캡슐처럼 `up` 벡터로 회전.
  - 배지: 원 + 아이콘 텍스트 + 고리(`Graphics.arc`). 크기 normal 지름 28px, large는 1.6배. 단계 이름은 배지 아래 작은 글. 깜박임은 `performance.now()` 기준.
  - 이모트: `actor.habit`이 있으면 배지 오른쪽 위에 이모지 텍스트.
  - 클로즈업 대상 표시(노란 점선 고리)는 발밑에 유지.

- [ ] **Step 4: 확인** — `npx vitest run && npx tsc --noEmit && npm run lint` PASS. `npm run dev`로 열어 1280×720 캡처 한 장을 보고서에 첨부(배지 세 단계와 이모트가 보이는 순간, `?seed=3` 실제 90초 근처).

- [ ] **Step 5: Commit** — `feat(render): 스튜디오 캐릭터 그림과 머리 위 감정 배지`

---

### Task 6: 카메라 화면 — 그림, 이름표 단계 아이콘, 겹침 피하기

**Files:**
- Modify: `src/app/CameraFeedCanvas.tsx`, `src/render/feedLabels.ts`, `src/render/cameraFeed.ts`(필요하면 pose와 mood를 넘김)
- Test: `src/render/feedLabels.test.ts`, `src/render/cameraFeed.test.ts`

**Interfaces:**
- Consumes: Task 5 `performerArtUrl`, `badgeLook`, `EMOTION_STYLE`, Task 1 색
- Produces: `CameraFeedCanvas`가 부모 크기를 `ResizeObserver`로 재서 그린다(고정 width/height prop 제거, Task 7이 의존). 이름표는 출연자 색 테두리 + 단계 아이콘(0단계 없음, 1단계 반 고리, 2단계 깜박이는 꽉 찬 빨간 고리).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('다섯 이름표가 한 점에 몰려도 결과 상자끼리 겹치지 않고 화면 안에 있다', ...)   // 264×149
it('미리보기 크기(84×47)에서도 겹치지 않는다', ...)
it('이름표 높이를 넘는 세로 공간이 없으면 가장 덜 겹치는 배치를 돌려주고 throw하지 않는다', ...)
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/render/feedLabels.test.ts` → 새 테스트 FAIL.

- [ ] **Step 3: 구현** — 그림은 `HTMLImageElement`를 한 번 불러 캐시하고 앞모습으로 그린다(가려짐·화면 밖 판정은 그대로). 이름표 겹침은 위아래 교대로 비켜 놓는다.

- [ ] **Step 4: 확인** — 전체 vitest, tsc, lint PASS. 기존 `OnAirColumn.test.tsx`가 고정 크기 prop을 쓰면 새 방식에 맞게 고친다.

- [ ] **Step 5: Commit** — `feat(feed): 카메라 화면 캐릭터 그림과 이름표 단계 아이콘`

---

### Task 7: 배치 셸 — 세 배치, 위 띠, 전환

**Files:**
- Create: `src/app/layout.ts`, `src/app/layout.test.ts`, `src/app/useLayoutHotkey.ts`, `src/app/LayoutToggle.tsx`
- Modify: `src/app/BroadcastScreen.tsx`(`BroadcastStage`를 grid 영역 배치로), `src/app/Hud.tsx`(`TopBand`에 토글, 한 줄 고정), `src/app/OnAirColumn.tsx`(미리보기 방향 `'row' | 'column'`)
- Test: `src/app/layout.test.ts`, `src/app/screens.test.tsx`

**Interfaces:**
- Consumes: Task 6 크기 자동 `CameraFeedCanvas`
- Produces:
  - `type LayoutMode = 'default' | 'studio' | 'onair'`, `LAYOUT_STORAGE_KEY = 'exnihilo.showmustgowrong.layout'`
  - `nextLayout(mode: LayoutMode): LayoutMode`, `loadLayout(storage: Storage | null): LayoutMode`(없음·깨짐·접근 예외 → `'default'`), `saveLayout(storage: Storage | null, mode: LayoutMode): void`(예외 삼킴)
  - `useLayoutHotkey(onNext: () => void): void` — `L`/`l` 또는 `code === 'KeyL'`, 수정자 키나 `isTextEntry` 대상이면 무시
  - `<main data-layout={mode}>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
expect(nextLayout('default')).toBe('studio'); expect(nextLayout('studio')).toBe('onair'); expect(nextLayout('onair')).toBe('default')
expect(loadLayout(null)).toBe('default')
expect(loadLayout(storageWith('weird'))).toBe('default')
expect(loadLayout(throwingStorage)).toBe('default')
expect(() => saveLayout(throwingStorage, 'studio')).not.toThrow()
// screens.test.tsx (jsdom)
it('L을 누르면 data-layout이 default→studio→onair→default로 바뀌고 저장된다', ...)
it('입력 칸에서 L은 무시된다', ...)
it('배치를 바꿔도 studio-host와 program-monitor 요소가 같은 DOM 노드로 남는다', ...)   // 렌더러 재생성 방지
```

- [ ] **Step 2: 실패 확인** — 해당 테스트 FAIL.

- [ ] **Step 3: 구현**
  - 한 DOM 구조(왼쪽 칸, 스튜디오, 송출 모니터, 미리보기 3칸, 버튼)를 유지하고 `grid-template-areas`와 열 너비만 배치마다 바꾼다. 열 너비는 spec 2절 표(왼쪽 260, 크게 720, 작게 260, 기본 반반).
  - `송출 화면 크게`에서 스튜디오는 오른쪽 위 작은 영역으로 간다(같은 host 요소, ResizeObserver가 크기 반영). 클릭·호버·드래그는 그대로 동작한다.
  - 위 띠: 수위 4개, 시청자, 극 중 시계, 코너, `LayoutToggle`(아이콘 3개, 현재 배치 강조). `whitespace-nowrap`으로 한 줄.

- [ ] **Step 4: 확인** — vitest, tsc, lint, `npm run e2e`(기존 17개) PASS. 세 배치 1280×720 캡처를 보고서에 첨부.

- [ ] **Step 5: Commit** — `feat(app): 배치 세 가지와 위 띠 전환`

---

### Task 8: 터짐 추세 그래프와 로그 위계

**Files:**
- Create: `src/app/TrendChart.tsx`, `src/app/TrendChart.test.tsx`, `src/app/logSegments.ts`, `src/app/logSegments.test.ts`
- Modify: `src/app/Hud.tsx`(`EventLog`), `src/app/logFormat.ts`, `src/app/BroadcastScreen.tsx`(TrendRecorder를 방송마다 하나 만들고 매 프레임 `record`)

**Interfaces:**
- Consumes: Task 2 `LogLine.leadIn`, Task 3 `TrendRecorder`, `TrendSeries`, Task 1 색
- Produces:
  - `<TrendChart series={TrendSeries[]} colors={Record<string,string>} names={Record<string,string>} fromStep={number} toStep={number} axis={'relative' | 'clock'} show={ShowDef} />` — SVG, 50·80 점선과 "1단계" "2단계", 범례. `relative`는 "-60초 … 지금", `clock`은 극 중 시각 눈금(정산용).
  - `logTier(line: LogLine): 1 | 2 | 3` — incident 3, stage 2, 나머지 1
  - `logSegments(line: LogLine, people: { name: string; color: string }[]): { text: string; color: string | null; dim: boolean }[]` — 이름(정식 이름과 짧은 이름, 긴 것 먼저)을 출연자 색으로, `leadIn` 부분은 `dim: true`
  - `BroadcastScreen`이 결과를 넘길 때 `trend: TrendSeries[]`(recorder.all())를 함께 넘긴다(Task 11이 소비).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
expect(logTier(line('incident'))).toBe(3); expect(logTier(line('stage'))).toBe(2); expect(logTier(line('habit'))).toBe(1)
expect(logSegments(takeoverLine, people)).toEqual([
  { text: '프리야', color: '#A855F7', dim: true }, { text: '의 킥킥거림에 이어 ', color: null, dim: true },
  { text: '오카포', color: '#14B8A6', dim: false }, { text: '가 ', color: null, dim: false },
  { text: '렉스', color: '#EF4444', dim: false }, { text: '에게 버럭한다', color: null, dim: false },
])
it('TrendChart는 출연자마다 path 하나, null 점에서 선이 끊긴다', ...)
it('TrendChart에 점이 하나도 없어도 축과 점선만 그리고 오류가 없다', ...)
```

- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — spec 8절 표의 표시. 3단: 왼쪽 띠(주인공 색, 첫 이름 색), 흰 굵은 글. 2단: 감정 색 글 + `EMOTION_STYLE` 아이콘, 2단계 진입은 굵게. 1단: 흐린 회색 기울임, 정적은 회청. 사용자가 로그를 위로 올려 읽는 중이면 새 줄에 자동으로 내려가지 않는다(맨 아래에서 8px 이내일 때만 따라감).
- [ ] **Step 4: 확인** — vitest, tsc, lint PASS.
- [ ] **Step 5: Commit** — `feat(app): 터짐 추세 그래프와 로그 3단 위계`

---

### Task 9: 정보 카드

**Files:**
- Create: `src/app/ActorInfoCard.tsx`, `src/app/ActorInfoCard.test.tsx`
- Modify: `src/app/BroadcastScreen.tsx`(출연자 호버·클릭 시 카드, 스태프·장비는 기존 `HoverTip`), `src/app/hoverTipContent.ts`(출연자 분기 제거)

**Interfaces:**
- Consumes: Task 3 `topReasons`, `placeCard`, Task 5 `EMOTION_STYLE`, `performerArtUrl`
- Produces: `<ActorInfoCard actor={ActorView} performer={PerformerDef} nameOf={(id: string) => string} />`. 위치는 호출자가 `placeCard`로 정한다(카드 300px 폭).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('머리에 이름, 역할, 대표 감정과 단계 이름, 내성 점 수', ...)
it('감정 막대는 공용 4개 + 구분선 + 개인 감정(개인 표시), 막대마다 문턱 눈금 2개', ...)
it('왜 저러나에 대표 감정의 이유 3개를 +양과 함께', ...)
it('이유가 없으면 "아직 이유 없음"', ...)
it('takeover가 있으면 "↪ 이어받는 중 · {text}에 이어 · {올림 초}초"', ...)   // 2.2초 → "3초"
it('이탈했거나 감정이 없으면 감정 칸 없이 이름, 역할, 성향 한 줄', ...)
```

- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — 호버하면 뜨고 마우스가 떠나면 사라진다. 클릭하면 고정되고, 다른 곳 클릭이나 Esc로 닫힌다(개입 중이 아닐 때. 개입 중 클릭은 지금처럼 대상 선택). 카드가 뜨면 스튜디오 밖 영역을 살짝 흐리게 한다.
- [ ] **Step 4: 확인** — vitest, tsc, lint PASS.
- [ ] **Step 5: Commit** — `feat(app): 출연자 정보 카드`

---

### Task 10: 판단 카드

**Files:**
- Modify: `src/app/InterventionPanel.tsx`, `src/app/TargetCard.tsx`, `src/app/interventionTargets.ts`, `src/app/BroadcastScreen.tsx`(개입 중 흐림, `setFocus`)
- Test: `src/app/interventionTargets.test.ts`, `src/app/screens.test.tsx`

**Interfaces:**
- Consumes: Task 3 `formatMoodShift`, Task 5 `setFocus`, `EMOTION_STYLE`, Task 1 색
- Produces: `DirectiveOption.shifts: { text: string; rising: boolean; color: string }[]`(rising이면 그 감정 색, 내림이면 `#22C55E`), `TargetOption.color: string | null`(출연자 색, 스태프 null), `TargetOption.takeoverText: string | null`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('오카포 "진정하세요"의 shifts는 [{ text: "짜증 ▼ 크게", rising: false, color: "#22C55E" }]', ...)
it('moodShifts가 없는 지시는 shifts []', ...)
it('takeover가 있으면 takeoverText = "이 지시는 {text}에 이어집니다 · {올림 초}초"', ...)
it('판단 카드에 대상 탭(출연자 색), 지시 카드마다 번호·이름·예상·칩, 엇나갈 확률이 보인다', ...)
it('개입 중 광고 버튼은 disabled, 개입 버튼은 "개입 닫기"와 Esc', ...)
```

- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — spec 7절. 개입 중 왼쪽 칸을 판단 카드가 덮고, 위 띠·오른쪽 열은 `brightness(0.6) saturate(0.6)`, 스튜디오는 `setFocus(대상 id)`. 카메라 감독은 감정 칸 없이 지시만.
- [ ] **Step 4: 확인** — vitest, tsc, lint, e2e PASS.
- [ ] **Step 5: Commit** — `feat(app): 판단 카드의 감정 막대와 감정 변화 칩`

---

### Task 11: 정산 화면

**Files:**
- Modify: `src/app/ResultScreen.tsx`, `src/app/App.tsx`(결과에 `trend` 전달)
- Test: `src/app/screens.test.tsx`

**Interfaces:**
- Consumes: Task 2 `ChainLine.actorId`, Task 8 `TrendChart`와 `trend`, Task 1 색
- Produces: 없음(최종 화면)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('뿌리가 있으면 "모든 건 여기서 시작됐다"와 "{시각} {문장}"이 가장 큰 글로', ...)
it('뿌리가 없으면 "큰 사고 없이 끝났다"', ...)
it('숫자 4개: 최고 시청자, 평균 시청자, 최대 연쇄 깊이, 개입', ...)
it('연쇄 줄은 화살표로 이어지고 첫 줄 "뿌리", 마지막 줄 "가장 큰 터짐", 점 색은 actorId 색, null이면 회색', ...)
it('연쇄가 0줄이면 연쇄 칸에 "연쇄 없음"', ...)
it('터짐 추세는 clock 축으로 방송 전체', ...)
```

- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — 시안 6 배치. "다시 하기"는 B1 조정값 새로고침 규칙 그대로.
- [ ] **Step 4: 확인** — vitest, tsc, lint PASS.
- [ ] **Step 5: Commit** — `feat(app): 정산 화면의 뿌리 카드와 연쇄, 전체 추세`

---

### Task 12: e2e와 화면 점검

**Files:**
- Modify: `tests/e2e/broadcast.spec.ts`

- [ ] **Step 1: e2e 추가**

```ts
test('세 배치 모두에서 송출 전환(1·2·3)과 클로즈업 드래그가 된다', ...)
test('배치 전환 뒤 새로고침해도 배치가 유지된다', ...)
test('가장 왼쪽·오른쪽·위·아래 출연자에게 정보 카드를 띄워도 카드 상자가 스튜디오 상자 안', ...)
test('개입 중 판단 카드에 감정 변화 칩이 보이고 Esc로 닫힌다', ...)
test('방송 끝(가속 시드)까지 가면 정산 화면에 뿌리 카드 또는 "큰 사고 없이 끝났다"', ...)
```

- [ ] **Step 2: 확인** — `npm run e2e` 전부 PASS, `npx vitest run`, `npx tsc --noEmit`, `npm run lint` 0, `npm run sim` 출력이 plan 시작 커밋과 같음(diff 없음).
- [ ] **Step 3: 화면 캡처** — 1280×720에서 기본·스튜디오 크게·송출 화면 크게(방송 실제 약 90초), 정보 카드, 판단 카드, 정산 화면 6장을 `docs/lab/worklog/assets/planb2/`에 저장하고 보고서에 경로를 적는다. 시안과 다른 점을 표로 적는다.
- [ ] **Step 4: Commit** — `test(e2e): B2 화면 배치·카드·정산 확인과 캡처`
