# 방송망쳐야돼 Plan 2: 쿼터뷰·3D 물리 재작성과 정보 위계 HUD Implementation Plan

> **agentic worker에게:** REQUIRED SUB-SKILL: 이 plan을 task 단위로 구현하려면 suberpower:subagent-driven-development(권장) 또는 suberpower:executing-plans를 사용하세요. Step은 추적을 위해 checkbox(`- [ ]`) 문법을 사용합니다.

**Goal:** Plan 1의 토크쇼 한 회를 쿼터뷰와 Rapier 3D 물리로 다시 만든다. 클로즈업 카메라는 대상 출연자를 따라가고, 스태프 사고는 지시 없이도 복구된다. 생방송 화면은 spec 8.2의 정보 위계대로 짠다. 이 빌드로 설계자가 "이 화면만 보고 결정을 내릴 수 있는지"를 다시 판정한다.

**Architecture:** sim 규칙층(phenomena, reactions, director, broadcast 점수, 입력·리플레이, 광고)은 그대로 둔다. 좌표를 3D(x 가로, y 높이, z 깊이)로 옮기고 물리 래퍼, 카메라 판정, 이동을 다시 쓴다. 카메라 방향·추적·스태프 복구는 새 모듈 `sim/cameraRig.ts`가 맡아 `engine.ts`를 줄인다. 화면은 PixiJS 2D에서 3D 좌표를 쿼터뷰로 투영하고 깊이 순서로 그린다. ON AIR 모니터와 카메라 미리보기는 카메라 시점 투영을 Canvas 2D로 그린다.

**Tech Stack:** React 19, Vite 8, TypeScript, Tailwind 4, PixiJS v8, `@dimforge/rapier3d-deterministic-compat` 0.21, Vitest, Playwright, oxlint

**Spec:** `docs/suberpowers/specs/2026-11-25-pilot-showmustgowrong-design.md` (개정판. 3.1 카메라, 5.2 개입 10초, 5.6 스태프 자동 복구, 8.2 정보 위계, 9.1 물리와 쿼터뷰 표시, 9.5 캐릭터 표현)

**기반 코드:** 브랜치 `feat/showmustgowrong-slice`의 Plan 1 결과(`pilot-showmustgowrong/`). Plan 1 plan과 작업 로그 `docs/lab/worklog/pilot-showmustgowrong.md`의 Ruling 1~36은 이 plan이 바꾸지 않는 한 유효하다.

## 전체 로드맵 (2026-11-25 개정)

| Plan | 내용 |
|---|---|
| 1. 방송 한 회 수직 슬라이스 | 완료(사이드뷰). 사람 판정: 시점과 정보 부족으로 플레이 불가 |
| **2. 쿼터뷰·3D 재작성과 정보 위계** | 이 문서 |
| 3. 캐릭터 애셋 | 3/4 각도 포즈 스프라이트, 검증 워크플로, UI 톤(8.1) |
| 4. 런 구조와 콘텐츠 전체 | 기존 로드맵의 Plan 3 |
| 5. 검증과 배포 | 기존 로드맵의 Plan 4 |

## Global Constraints

- 위치는 `pilot-showmustgowrong/`. 명령은 그 폴더에서 실행한다. `any` 금지. 수치는 모두 `src/content/balance.ts`에 둔다. 화면 문구는 한국어.
- 좌표: 미터. x 가로(0~`STUDIO_WIDTH` 16), z 깊이(0~`STUDIO_DEPTH` 10), y 높이(바닥 0, 천장 `STUDIO_HEIGHT` 9, 위가 +y). 바닥 위 방향각(yaw)은 도 단위이고 +x가 0°, +z가 90°다. 이 규칙은 Ruling 15(+x 0°, 반시계)를 대체한다.
- 물리 패키지는 `@dimforge/rapier3d-deterministic-compat` 0.21. `rapier2d-deterministic-compat`은 Task 2에서 제거한다.
- 결정론 규칙은 Plan 1과 같다. 새 입력(`track`)도 입력 기록과 리플레이에 들어간다.
- `src/sim`은 `src/render`와 `src/app`에 의존하지 않는다.
- spec 값: 개입 선택 시간 실제 10초(`INTERVENTION_REAL_SECONDS = 10`), 개입 속도 1/5, 스태프 복구 유지 1.5초·복귀 2초(스태프별 덮어쓰기 가능), 자동 슬로모션과 게이지 강조 기준 상한의 80%, 긴장도 창 1초, "곧 터짐!" 기준 0.75.
- 게임 화면은 1280×720에서 스크롤이 없다. 배치는 spec 8.2를 따른다. 빠른 지시(단축키 지시)는 만들지 않는다.
- 시안은 Stitch 프로젝트 `projects/12747394793416726906`의 화면 B(`77b522683f04485680adeb68a8dabceb`, 배치 기준), A(`83d8dcb222e64660a3fdc2ab3657df4a`, 공간 표시 밀도 기준), 개입(`51c84feb492c455a87c3f91b306b4664`)이다. 툰 톤(8.1)과 스프라이트는 Plan 3 몫이다. 이번 화면은 도형과 CSS로 그린다.

## Review Focus

1. 클로즈업 대상이 이탈하거나 출연자가 모두 떠남 → 대상이 존재감이 가장 높은 남은 출연자로 바뀌고, 아무도 없으면 기본 방향으로 돌아간다. 오류가 나지 않는다(Task 3).
2. 복귀 중에 다시 놀람 / 유지 중에 지시 → 앞의 경우 타이머가 처음부터 다시 돌고, 뒤의 경우 즉시 기준 방향으로 돌아온다(Task 3).
3. `track` 입력과 스태프 복구가 섞인 방송을 입력 기록으로 리플레이 → 같은 결과가 나온다(Task 3).
4. 광고 중이거나 방송이 끝난 뒤, 또는 이탈한 출연자를 스튜디오에서 클릭 → 입력이 나가지 않는다(Task 7).
5. 창 크기가 바뀌어 캔버스가 늘거나 줄어든 상태에서 출연자를 클릭 → 쿼터뷰 투영에서도 그 출연자가 정확히 선택된다(Task 5).

---

### Task 1: Rapier 3D 물리 월드

새 파일로 만들고 기존 `physics.ts`는 Task 2에서 교체한다. 이 task가 끝나도 앱은 Plan 1 그대로 돈다.

**Files:**
- Create: `src/sim/vec.ts`, `src/sim/vec.test.ts`
- Create: `src/sim/physics3d.ts`, `src/sim/physics3d.test.ts`
- Modify: `src/content/balance.ts` (3D 상수 추가), `package.json` (`@dimforge/rapier3d-deterministic-compat@0.21.0` 추가)

**Interfaces:**
- Produces (`vec.ts`):
  - `interface Vec3 { x: number; y: number; z: number }`
  - `interface FloorPoint { x: number; z: number }`
  - `floorDistance(a: FloorPoint, b: FloorPoint): number`
  - `distance3(a: Vec3, b: Vec3): number`
  - `yawBetween(from: FloorPoint, to: FloorPoint): number` (도, +x 0°, +z 90°, 범위 (-180, 180])
  - `normalizeDegrees(degrees: number): number` (범위 (-180, 180]. `broadcast.ts`에 있는 것을 여기로 옮겨 공유한다)
  - `rotateYaw(from: number, to: number, t: number): number` (짧은 쪽으로 보간, t는 0~1)
- Produces (`physics3d.ts`, 클래스 이름 `PhysicsWorld`, 함수 `initPhysics()`. Plan 1 API와 같은 이름을 쓰되 좌표가 3D다):
  - `addActor(id: string, at: FloorPoint, weight: Weight): void`
  - `addEquipment(def: EquipmentDef3): void`, `releaseEquipment(id: string): void`, `removeActor(id: string): void`
  - `impulse(id: string, velocity: Vec3): void` (velocity.y > 0이면 넘어짐 시작)
  - `teleport(id: string, to: FloorPoint): void`
  - `step(): Contact[]` (`Contact`는 Plan 1과 같은 모양)
  - `actorState(id): ActorState3 | undefined`. `ActorState3 = { position: Vec3; velocity: Vec3; up: Vec3; tumbling: boolean; grounded: boolean }`. `up`은 몸의 위 방향 단위 벡터다(서 있으면 (0,1,0)).
  - `equipmentState(id): EquipmentState3 | undefined`. `EquipmentState3 = { position: Vec3; rotation: { x: number; y: number; z: number; w: number }; released: boolean }`
  - `lineOfSight(from: Vec3, to: Vec3): boolean`. 장비 collider만 가린다(출연자, 바닥, 벽은 무시).
  - `dispose(): void`
- `EquipmentDef3`는 Task 2에서 `EquipmentDef`가 될 모양이다. 이 task에서는 `physics3d.ts` 안에 export해 둔다. `{ id; name; kind: 'hangingLight' | 'setWall'; position: Vec3; breakAt: Intensity; onBreak: EmitDef[]; darknessZone?: { x: number; z: number; radius: number } }`. 조명의 position은 중심, 세트 벽의 position.y는 바닥면이다(Ruling 12 유지). 세트 벽은 x 방향으로 길고(`SET_WALL_HALF_EXTENTS = { hx: 1.5, hy: 1.5, hz: 0.1 }`), 풀려나면 스튜디오 중심(z = `STUDIO_DEPTH / 2`) 쪽으로 x축을 중심으로 쓰러진다.

- [ ] **Step 1: `vec.test.ts` 작성.** `yawBetween({x:0,z:0},{x:1,z:0}) === 0`, `({x:0,z:0},{x:0,z:1}) === 90`, `({x:0,z:0},{x:-1,z:0}) === 180`. `rotateYaw(170, -170, 0.5)`는 180(짧은 쪽). `normalizeDegrees(-180) === 180`.
- [ ] **Step 2: `physics3d.test.ts` 작성.** Plan 1 `physics.test.ts`의 시나리오를 3D로 옮기고 아래를 추가한다.
  - 서 있는 actor는 60스텝 뒤에도 `up`이 (0,1,0)에서 0.01 안이고 y가 서 있는 높이(`CAPSULE.halfHeight + CAPSULE.radius`)다.
  - `impulse(id, {x:0, y:6, z:4})` 뒤 tumbling이 true이고, z 방향으로 1m 이상 움직인다.
  - 넘어진 뒤 받쳐져 `STAND_UP_SECONDS` 동안 멈추면 다시 선다. 다른 actor가 그 자리에 있으면 x 또는 z로 비켜 선다(두 actor 중심의 바닥 거리 ≥ 2 × `CAPSULE.radius`).
  - 두 actor가 상대 속도 6.5m/s로 정면 충돌하면 강도 2 접촉 하나가 나오고, `fasterId`는 더 빨랐던 쪽이다.
  - 높이 3m에서 떨어진 actor의 바닥 접촉은 내려오는 속도로 강도를 정한다(Ruling 24 유지).
  - 조명 `releaseEquipment` 뒤 120스텝 안에 바닥에 닿고, 세트 벽은 스튜디오 중심 쪽 z로 쓰러진다(`up`에 해당하는 회전 뒤 윗변의 z가 중심 쪽으로 이동).
  - `lineOfSight`: 카메라 (8, 1.5, 9.5)에서 actor (8, 0.85, 3)까지, 그 사이 z=6에 세운 세트 벽이 있으면 false, 벽이 없으면 true, 사이에 다른 actor가 있어도 true.
  - 결정론: 같은 순서로 같은 입력을 준 두 월드의 300스텝 뒤 actor 위치가 비트 단위로 같다.
  - 바깥으로 세게 날린 actor(속도 30m/s)가 300스텝 뒤에도 스튜디오 경계 안에 있다(벽 4면과 천장).
- [ ] **Step 3: 실패 확인.** Run: `npx vitest run src/sim/vec.test.ts src/sim/physics3d.test.ts` → FAIL(모듈 없음).
- [ ] **Step 4: 구현.** `npm i @dimforge/rapier3d-deterministic-compat@0.21.0`. `balance.ts`에 `STUDIO_DEPTH = 10`, `GRAVITY3 = { x: 0, y: -9.81, z: 0 }`, `SET_WALL_HALF_EXTENTS3 = { hx: 1.5, hy: 1.5, hz: 0.1 }`, `LIGHT_HALF_EXTENTS3 = { hx: 0.4, hy: 0.2, hz: 0.4 }`를 추가한다(Task 2에서 접미사 3을 떼고 옛 상수를 지운다). Rapier 3D의 capsule은 y축 방향이라 서 있는 몸에 그대로 맞는다. 서 있는 동안은 회전을 잠그고(`lockRotations`), 넘어지면 `setEnabledRotations(true, true, true, true)`로 푼다. 일어설 빈자리는 Plan 1 `freeStandingX`를 바닥 평면 나선 탐색(`STAND_UP_SEARCH_STEP` 간격, 같은 스텝에 세운 자리 목록 유지)으로 넓힌다. `lineOfSight`는 `world.castRay`에 장비 collider만 통과시키는 filter predicate를 준다.
- [ ] **Step 5: 통과 확인.** Run: `npx vitest run src/sim/vec.test.ts src/sim/physics3d.test.ts` → PASS. `npm run lint` → 오류 0. `npx tsc -b` → 오류 0.
- [ ] **Step 6: Commit.** `git add -A pilot-showmustgowrong && git commit -m "feat(showmustgowrong): Rapier 3D 물리 월드"`

---

### Task 2: sim을 3D 좌표로 옮기기

물리를 3D로 바꾸고 콘텐츠 좌표, 지각 거리, 이동, 카메라 판정을 함께 옮긴다. 화면은 아직 Plan 1 사이드뷰 렌더러가 x와 y(높이)만 읽어 그리므로 그대로 돈다.

**Files:**
- Modify: `src/content/types.ts`, `src/content/talkShow.ts`, `src/content/lineup.ts`, `src/content/validate.ts`, `src/content/balance.ts`, 각 테스트
- Modify: `src/sim/cast.ts`, `src/sim/targeting.ts`, `src/sim/phenomena.ts`, `src/sim/reactions.ts`, `src/sim/broadcast.ts`, `src/sim/gaze.ts`, `src/sim/engine.ts`, `src/sim/engineTypes.ts`, 각 테스트
- Delete: `src/sim/physics.ts`, `src/sim/physics.test.ts`. Rename: `physics3d.ts` → `physics.ts`(테스트 포함)
- Modify: `scripts/sim-broadcast.ts`, `vite.config.ts`(rapier 청크 이름과 예산), `package.json`(rapier2d 제거)

**Interfaces:**
- Consumes: Task 1의 `vec.ts`와 `PhysicsWorld`
- Produces (콘텐츠 타입 변경):
  - `CameraDef.position: Vec3`, `defaultAngle`은 yaw(도), `tracking?: boolean` 추가(Task 3이 씀)
  - `EquipmentDef`는 Task 1의 `EquipmentDef3` 모양
  - `ShowDef.homeSpots: FloorPoint[]`, `benchSpot: FloorPoint`, `exit: FloorPoint`(`exitX` 대체), `audienceZone: { minX; maxX; minZ; maxZ }`
- Produces (sim 변경):
  - `PhenomenonEvent`와 `Perceiver`의 위치는 `x, y, z`. 거리는 `distance3`
  - `Point` 타입은 `Vec3`로 바꾼다. `Cast.add(def, home: FloorPoint)`, `CastMember.home: FloorPoint`(`homeX` 대체)
  - `inFrame(camera: CameraDef, yaw: number, point: Vec3): boolean`. 바닥 평면에서 거리 ≤ range이고 yaw 차이 ≤ fov/2면 true(높이는 보지 않음)
  - 엔진의 송출 판정은 `inFrame(...) && physics.lineOfSight(camera.position, point)`
  - `ActorView`: `x, y, z`, `up: Vec3`(`angle` 대체). `EquipmentView`: `x, y, z`, `rotation`(`angle` 대체). `LogLine`: `x, y, z`
  - darkness: `darknessZone`은 바닥 원. 안에 있는지는 `floorDistance ≤ radius`

- [ ] **Step 1: 콘텐츠 테스트 수정.** `content.test.ts`에 아래 배치 조건을 고정한다(수치는 구현자가 고르되 이 조건을 만족해야 한다).
  - 무대 와이드는 home spot 4곳을 모두 잡고 관객석 중앙은 잡지 않는다.
  - 관객석 카메라는 관객석 중앙을 잡고 home spot은 하나도 잡지 않는다.
  - 클로즈업은 `tracking: true`이고 화각 24°, 기본 방향으로 첫 home spot을 잡는다.
  - 카메라 3대는 모두 스튜디오 앞쪽(z ≥ 8)이나 옆에 있어서 쿼터뷰에서 무대를 가리지 않는다.
  - 세트 벽은 home spot을 가리지 않는 자리에 서 있다(와이드에서 home spot 4곳의 `lineOfSight`가 모두 true).
  - 조명의 어둠 원은 home spot 2곳 이상을 덮는다.
  - `validate.test.ts`: 스튜디오 밖 좌표(x, z가 범위 밖)를 쓰는 home spot, 장비, 카메라는 검증 오류다.
- [ ] **Step 2: sim 테스트 수정.** 좌표를 쓰는 fixture를 3D로 옮긴다. 의미가 바뀌지 않는 테스트는 좌표만 고친다. 다음을 추가한다.
  - `phenomena.test.ts`: 소음 반경은 3D 거리다. 같은 바닥 거리라도 높이 차가 반경을 넘기면 인지하지 못한다.
  - `broadcast.test.ts`: `inFrame`은 z 방향 화각을 판정한다. yaw 90°, fov 40°, range 5인 카메라가 (0,0,0)에 있으면 (0, 3, 4)는 잡고 (3, 0, 1)은 잡지 않는다.
  - `engine.test.ts`: 세트 벽이 와이드 카메라와 출연자 사이를 막으면 그 출연자의 현상은 송출로 세지 않는다. dash는 대상 쪽 바닥 방향(x와 z 둘 다)으로 움직인다. 이탈한 출연자는 `exit` 쪽으로 걸어가 `WALKOUT_SECONDS` 뒤 사라진다.
- [ ] **Step 3: 실패 확인.** Run: `npx vitest run` → 바뀐 테스트들이 FAIL.
- [ ] **Step 4: 구현.** 순서: 타입 → talkShow·lineup 좌표 → validate → cast·targeting(`angleBetween` 대신 `yawBetween`) → phenomena·reactions → broadcast `inFrame` → engine(이동은 대상까지의 바닥 방향 단위 벡터 × speed, leap은 여기에 수직 속도 `speed × LEAP_VERTICAL_RATIO`. flee는 반대 방향. 걷기 이탈은 `exit` 쪽 바닥 방향) → engineTypes → `physics3d.ts`를 `physics.ts`로 바꾸고 옛 파일과 rapier2d 제거 → balance 상수 이름 정리 → `scripts/sim-broadcast.ts`. `vite.config.ts`의 rapier 청크 그룹 이름 패턴을 rapier3d로 바꾸고, 빌드한 실제 크기 + 5%로 rapier 예산을 고친다(주석에 측정값을 적는다).
- [ ] **Step 5: 통과 확인.** Run: `npx vitest run` → 전부 PASS. `npm run lint`, `npm run build` → 오류 0, 예산 경고 없음. `npm run sim` → 방송이 끝까지 돌고 요약이 출력된다.
- [ ] **Step 6: Commit.** `git commit -m "refactor(showmustgowrong): sim 좌표를 3D로 전환"`

---

### Task 3: 카메라 리그(클로즈업 추적, 스태프 자동 복구)

**Files:**
- Create: `src/sim/cameraRig.ts`, `src/sim/cameraRig.test.ts`
- Modify: `src/sim/engine.ts`(카메라 방향 관련 코드를 리그로 옮김), `src/sim/engineTypes.ts`, `src/sim/inputValidation.ts`, `src/content/types.ts`, `src/content/balance.ts`, `src/content/talkShow.ts`, `src/sim/engine.test.ts`

**Interfaces:**
- Consumes: `yawBetween`, `rotateYaw`(Task 1), `CameraDef.tracking`(Task 2)
- Produces:
  - `BroadcastInput`에 `{ type: 'track'; cameraId: string; actorId: string }` 추가
  - `StaffDef.recovery?: { holdSeconds: number; returnSeconds: number }`. 기본값 `STAFF_RECOVERY = { holdSeconds: 1.5, returnSeconds: 2 }`(balance)
  - `type StaffMode = 'normal' | 'startled' | 'recovering'`
  - `StaffView = { id: string; name: string; cameraId: string; mode: StaffMode; recoveryProgress: number; x: number; y: number; z: number }`. `recoveryProgress`는 놀란 순간 0에서 복구 완료 1까지(유지+복귀 전체 기준)
  - `BroadcastView`에 `staff: StaffView[]`, `cameraTargets: Record<string, string | null>`(추적 카메라만 값, 나머지는 null) 추가. `cameraAngles`는 유지한다(리그가 계산한 실제 방향).
  - `class CameraRig`:
    - `constructor(cameras: CameraDef[], staff: StaffDef[])`
    - `angle(cameraId: string): number`
    - `target(cameraId: string): string | null`
    - `setTarget(cameraId: string, actorId: string | null): void`
    - `panic(staffId: string, randomYaw: number): void` (놀람 시작 또는 재시작)
    - `direct(staffId: string, aim: DirectedAim): void`. `DirectedAim = { kind: 'default' } | { kind: 'yaw'; yaw: number }`. 지시는 즉시 반영하고 놀람 상태를 끝낸다.
    - `update(positionOf: (actorId: string) => FloorPoint | null): void`. 매 스텝 한 번. 추적 대상 방향 계산, 놀람 타이머 진행.
    - `staffViews(): Omit<StaffView, 'name' | 'x' | 'y' | 'z'>[]`

**동작 결정**
- 카메라의 기준 방향: 지시로 정한 방향(`yaw`)이 있으면 그것, 없으면 추적 카메라는 대상 방향, 아니면 `defaultAngle`.
- 놀람: `panic` 순간 방향을 `randomYaw`로 바꾸고 `holdSeconds` 유지한 뒤, `returnSeconds` 동안 `rotateYaw`로 놀란 방향에서 그 순간의 기준 방향까지 보간한다. 추적 대상이 움직이면 보간 목표도 따라 움직인다.
- '침착하세요'(aim `default`)는 지시 방향을 지우고 기준으로 돌아간다. '관객석'과 '가장 가까운 출연자' 지시는 지시 방향(`yaw`)을 정한다. 스태프 지시가 엇나가면(aim `random`) 놀람과 같은 처리를 한다(`panic`).
- 클로즈업 시작 대상: 첫 코너의 `startTag`를 가진 출연자. 없으면 존재감이 가장 높은 출연자(같으면 무대에 먼저 오른 순서).
- 대상이 이탈하면 남은 출연자 중 같은 규칙으로 다시 고른다. 아무도 없으면 대상 null, 방향은 `defaultAngle`.
- `track` 입력은 공짜다. 개입이 아니고 내성과 피로를 쓰지 않는다. 대상이 이탈했거나 추적 카메라가 아니면 입력 검증 오류다(Plan 1의 입력 검증과 같은 방식). 큐에 있던 `track`의 대상이 그 사이 이탈하면 `step` 전에 버린다(Ruling 35와 같은 처리).
- 로그: 놀람은 Plan 1 문구 그대로, 복구 완료는 `"<스태프 shortName>가 자리를 잡았다"`(조사는 `withSubject`).

- [ ] **Step 1: `cameraRig.test.ts` 작성.**
  - 추적: 대상 위치가 (4, z 4)에서 (10, z 4)로 옮기면 `angle('close')`가 `yawBetween(카메라, 대상)`과 같다(오차 0.001).
  - 놀람 유지: `panic(op, 123)` 뒤 89스텝 동안 각도 123. 90번째 스텝부터 복귀가 시작된다.
  - 복귀: 놀란 뒤 90 + 120 = 210스텝 뒤 기준 방향과 같고 mode는 `normal`. 복귀 중간(150스텝)에는 기준과 123 사이에 있다.
  - 재시작: 복귀 중(150스텝)에 다시 `panic(op, 10)` → 각도 10, mode `startled`, 그로부터 210스텝 뒤 기준으로 돌아온다.
  - 지시: 유지 중 `direct(op, {kind:'default'})` → 즉시 기준 방향, mode `normal`.
  - 지시 방향 유지: `direct(op, {kind:'yaw', yaw: 200})` 뒤 놀람이 끝나면 200으로 돌아온다(기본 방향이 아니라).
  - 덮어쓰기: `recovery: {holdSeconds: 0.5, returnSeconds: 1}`인 스태프는 30 + 60 = 90스텝 뒤 기준으로 돌아온다.
  - `recoveryProgress`: 놀란 순간 0, 105스텝에 0.5, 210스텝에 1.
- [ ] **Step 2: `engine.test.ts`에 추가.**
  - 시작 대상: 토크쇼 고정 라인업이면 `view().cameraTargets.close`가 첫 코너 `host` 태그 출연자 id다.
  - `track` 입력으로 대상이 바뀌고, 출연자 내성과 누적 피로가 그대로다.
  - 대상 이탈: 대상이 이탈하면 다음 스텝에 존재감이 가장 높은 남은 출연자로 바뀐다. 모두 이탈하면 null이고 오류가 없다.
  - 이탈한 출연자를 대상으로 한 `track`은 입력 검증 오류다. 큐에 있다가 대상이 이탈한 `track`은 버려진다.
  - 리플레이: `switch`, `track`, `direct`, `directStaff`, `ad`가 섞이고 놀람과 복구가 일어나는 방송을 `replay`로 돌리면 `summary()`와 마지막 `view()`가 같다.
- [ ] **Step 3: 실패 확인.** Run: `npx vitest run src/sim/cameraRig.test.ts src/sim/engine.test.ts` → FAIL
- [ ] **Step 4: 구현.** `engine.ts`의 `cameraAngles`, `aimCamera`, `panicCamera`, `randomAngle` 사용처를 `CameraRig`로 옮긴다. 엔진은 매 스텝 물리 뒤, 시선 판정 전에 `rig.update(...)`를 부른다. talkShow의 클로즈업에 `tracking: true`. `STAFF_RECOVERY`를 balance에 둔다.
- [ ] **Step 5: 통과 확인.** Run: `npx vitest run` → PASS. `npm run lint` → 0.
- [ ] **Step 6: Commit.** `git commit -m "feat(showmustgowrong): 클로즈업 추적과 스태프 자동 복구"`

---

### Task 4: 판단에 필요한 정보를 view에 싣기

화면이 그릴 정보를 sim에서 계산해 `BroadcastView`에 싣는다. 화면은 이 값을 읽기만 한다.

**Files:**
- Create: `src/sim/tension.ts`, `src/sim/tension.test.ts`
- Modify: `src/sim/engine.ts`, `src/sim/engineTypes.ts`, `src/sim/director.ts`, `src/sim/broadcast.ts`, `src/content/types.ts`, `src/content/lineup.ts`, `src/content/validate.ts`, `src/content/balance.ts`, 각 테스트

**Interfaces:**
- Produces:
  - `PerformerDef.tendency: string`(성향 한 줄), `PerformerDef.role: string`(예: `"MC"`), `DirectiveDef.expect: string`(예상 결과). 비어 있으면 검증 오류.
  - `tensionOf(member: CastMember, recent: readonly PhenomenonEvent[], cooldowns: CooldownTable, step: number, perceivesEvent: (event: PhenomenonEvent) => boolean): number` (0~1, spec 8.2 정의)
  - `ActorView`에 `tension: number`, `aboutToBurst: boolean`(tension ≥ `BURST_WARNING_TENSION`), `misfireChance: number` 추가
  - `Director.previewMisfireChance(performerId: string): number`(지금 지시하면 엇나갈 확률. `misfire: 'never'`면 0. 굴리지 않는다), `Director.previewStaffMisfireChance(staffId: string): number`
  - `RecentPhenomenon = { id: number; kind: PhenomenonKind; intensity: Intensity; x: number; y: number; z: number; ageSeconds: number; text: string }`. `BroadcastView.recentPhenomena: RecentPhenomenon[]`(최근 `PHENOMENON_DISPLAY_SECONDS`초의 현상. `silence`는 공간에 그릴 자리가 없고 `gaze`는 카메라 시야로 이미 보이므로 둘 다 뺀다)
  - `BroadcastView.viewersTrend: -1 | 0 | 1`(1초 전 시청자 수와 비교, 차이가 `VIEWERS_TREND_EPSILON` 이하면 0)
  - balance: `TENSION_WINDOW_SECONDS = 1`, `BURST_WARNING_TENSION = 0.75`, `PHENOMENON_DISPLAY_SECONDS = 1.5`, `VIEWERS_TREND_EPSILON = 0.5`(천 명), `INTERVENTION_REAL_SECONDS = 10`(4에서 변경)
- 고정 라인업의 출연자 4 + 대기 1에 `tendency`, `role`, 지시마다 `expect`를 쓴다. 문구는 spec 7.1 표의 성향과 장단점에서 한 줄로 줄인다(예: Rex `"웃음 2↑ 받으면 → 분노 3(욕설)"`).

- [ ] **Step 1: `tension.test.ts` 작성.**
  - `absentFor 5초` 반응이 있는 출연자가 화면 밖 150스텝(2.5초)이면 0.5, 270스텝이면 0.9.
  - `anger min 2` 반응이 있고 최근 1초 안에 강도 1 분노를 인지했으면 0.5. 1초보다 오래된 이벤트는 세지 않는다. 그 반응이 쿨다운 중이면 그 반응의 진행도는 0.
  - 여러 반응 중 가장 큰 값을 쓴다. 값은 1을 넘지 않는다.
- [ ] **Step 2: 엔진·director 테스트 추가.**
  - `previewMisfireChance`: 피로 0에서 0, 개입 2번 뒤 `2 × FATIGUE_MISFIRE_PER_POINT`, `misfire: 'never'` 출연자는 항상 0. 미리보기는 rng를 바꾸지 않는다(미리보기 전후 같은 시드의 다음 지시 결과가 같다).
  - `recentPhenomena`: 소음이 생긴 스텝부터 90스텝 동안 들어 있고 91번째 스텝에 빠진다. `text`는 로그 문구와 같다.
  - `viewersTrend`: 강도 3 사고가 송출된 다음 초에 1.
  - `validate.test.ts`: `tendency`, `role`, `expect`가 빈 문자열이면 오류.
  - `loopState.test.ts`: 개입 창이 실제 10초 동안 열려 있고 10초가 지나면 닫힌다(기존 4초 기대값을 상수 참조로 바꾼다).
- [ ] **Step 3: 실패 확인.** Run: `npx vitest run` → 새 테스트 FAIL
- [ ] **Step 4: 구현.** 긴장도는 엔진이 반응 판정 뒤에 출연자마다 계산해 view에 싣는다. 최근 인지 이벤트는 `EventLog`에서 창 안의 것만 골라 `perceives`로 거른다.
- [ ] **Step 5: 통과 확인.** Run: `npx vitest run` → PASS. `npm run lint` → 0.
- [ ] **Step 6: Commit.** `git commit -m "feat(showmustgowrong): 긴장도, 엇나감 미리보기, 최근 현상을 view에 추가"`

---

### Task 5: 쿼터뷰 스튜디오 렌더러

**Files:**
- Modify: `src/render/geometry.ts`, `src/render/geometry.test.ts`
- Rewrite: `src/render/StudioRenderer.ts`
- Modify: `src/render/colors.ts`

**Interfaces:**
- Consumes: Task 2~4의 `BroadcastView`(`actors`, `equipment`, `staff`, `cameraAngles`, `cameraTargets`, `recentPhenomena`, `onAirCameraId`)
- Produces:
  - `interface IsoTransform { scale: number; originX: number; originY: number }`
  - `projectIso(point: Vec3, transform: IsoTransform): { x: number; y: number }`. 화면 x = originX + (x − z) × cos30° × scale, 화면 y = originY + (x + z) × sin30° × scale − y × scale
  - `fitIso(canvasWidth: number, canvasHeight: number, padding: number): IsoTransform`. 스튜디오 바닥 네 모서리와 천장 높이 2.5m까지(조명이 보이는 높이)를 감싸는 상자가 캔버스에 꽉 차게(여백 `padding`px) 들어가는 transform
  - `depthKey(point: Vec3): number`(= x + z. 클수록 앞)
  - `StudioRenderer.create(host: HTMLElement, show: ShowDef): Promise<StudioRenderer>`, `draw(view: BroadcastView, mode: 'live' | 'intervention' | 'auto'): void`, `hitTest(px: number, py: number): StudioHit | null`, `resize(width: number, height: number): void`, `destroy(): void`
  - `StudioHit = { kind: 'actor'; id: string } | { kind: 'staff'; id: string } | { kind: 'equipment'; id: string } | { kind: 'phenomenon'; id: number }`

**그리는 것 (spec 8.2 2단계)**
- 바닥(타일 격자), 관객석 구역, 세트 벽(직육면체 투영), 조명(공중 상자 + 바닥 그림자). 어둠 구역은 바닥 원을 어둡게 칠한다.
- 출연자: 바닥 그림자(타원) + 세운 캡슐 빌보드(색은 `colors.ts`). 높이는 그림자와 몸 사이 거리로 보인다. 넘어지면 `up` 벡터를 투영한 화면 방향으로 몸을 기울인다. 이름표는 몸 아래에 작게 둔다.
- 머리 위: 긴장도 막대(0~1, 0.75 이상은 빨강)와 남은 내성 점(`directivesLeft`). `aboutToBurst`면 "곧 터짐!" 태그를 붙인다.
- 클로즈업 추적 대상 머리 위에 작은 카메라 표시.
- 바닥: 카메라 시야 3개를 바닥 부채꼴로 그린다. 송출 중인 카메라만 진한 빨강으로 채우고 나머지는 흐린 외곽선이다. 송출 시야 안의 출연자는 빨간 테두리를 두른다(`ActorView.onAir`).
- 최근 현상: 소음은 발생 지점에서 `NOISE_RADIUS[강도]`까지 시간에 따라 퍼지는 바닥 링, 웃음과 노출은 `SIGHT_RADIUS` 링(색 구분), 충격은 발생 지점의 별 모양, 분노는 출처에서 대상으로 향하는 짧은 화살표.
- 스태프: 카메라 위치에 사람 도형. `startled`면 "놀람!" 말풍선, `recovering`이면 원형 진행 타이머(`recoveryProgress`).
- 그리는 순서는 `depthKey`가 작은 것부터. 바닥 표시(시야, 링, 어둠)는 모든 몸보다 먼저 그린다.
- 개입 모드: 스튜디오 가장자리를 어둡게 하고 채도를 뺀다(Pixi `ColorMatrixFilter`의 채도 낮춤 + 가장자리 비네트). 자동 슬로모션은 같은 효과를 약하게 쓴다.
- `hitTest`: 출연자 빌보드 사각형, 스태프 도형, 장비 투영 상자, 최근 현상 링 중심 순으로 검사한다. 앞쪽(`depthKey`가 큰 것)이 우선이다.

- [ ] **Step 1: `geometry.test.ts` 작성.**
  - `projectIso({x:0,y:0,z:0})`와 `({x:1,y:0,z:1})`의 화면 x가 같고, 뒤의 것이 아래(화면 y가 큼)에 있다.
  - y가 1 커지면 화면 y가 `scale`만큼 작아진다.
  - `fitIso(760, 560, 16)`로 투영한 스튜디오 바닥 네 모서리가 모두 [16, 744] × [16, 544] 안에 있고, 가로나 세로 한쪽은 여백에 닿는다(꽉 참).
  - Review Focus 5: 캔버스가 CSS로 0.5배 표시될 때 `clientToCanvas`로 바꾼 좌표가 투영된 출연자 중심과 2px 안에서 일치한다.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/render/geometry.test.ts` → FAIL
- [ ] **Step 3: 구현.** `geometry.ts`의 사이드뷰 함수(`toScreen`, `capsuleEndpoints` 등)는 지운다. 렌더러는 Plan 1처럼 매 프레임 view를 읽어 다시 그린다. 레이어는 floor(바닥 표시) → bodies(깊이 정렬) → overlays(머리 위 표시, 말풍선) 순이다.
- [ ] **Step 4: 통과 확인.** Run: `npx vitest run src/render` → PASS. `npm run lint`, `npx tsc -b` → 0.
- [ ] **Step 5: Commit.** `git commit -m "feat(showmustgowrong): 쿼터뷰 스튜디오 렌더러"`

---

### Task 6: 카메라 피드(ON AIR 모니터와 미리보기)

**Files:**
- Create: `src/render/cameraFeed.ts`, `src/render/cameraFeed.test.ts`, `src/app/CameraFeedCanvas.tsx`

**Interfaces:**
- Produces:
  - `FeedItem = { kind: 'actor' | 'equipment' | 'audience'; id: string; label: string; screenX: number; size: number; heightOffset: number; pose: Pose | null; highlighted: boolean }`. `screenX`는 −1(화면 왼쪽 끝)~1(오른쪽 끝), `size`는 거리에 반비례하는 상대 크기, `heightOffset`은 바닥에서 뜬 높이를 반영한 위치
  - `cameraFeed(view: BroadcastView, camera: CameraDef): FeedItem[]`. 그 카메라 화각 안의 출연자, 장비, 관객석을 카메라 방향 기준으로 투영한다. 가까운 것이 뒤에 온다(나중에 그림). 이탈해 사라진 출연자는 없다. 클로즈업 추적 대상은 `highlighted`
  - `<CameraFeedCanvas view camera width height />`: Canvas 2D로 피드를 그린다(배경, 바닥선, 출연자는 포즈별 색과 이름, 장비는 상자, 관객석은 점 무리)

- [ ] **Step 1: `cameraFeed.test.ts` 작성.**
  - 카메라 정면의 출연자는 `screenX` 0, 화각 왼쪽 끝은 −1, 오른쪽 끝은 1이다(yaw가 커지는 쪽을 화면 왼쪽으로 정한다. 쿼터뷰에서 본 방향과 좌우가 맞도록 테스트로 고정한다).
  - 화각 밖이나 세트 벽에 가린 출연자는 피드에 없다(엔진의 송출 판정과 같은 기준. `ActorView.onAir`가 송출 카메라에 대해 true인 출연자 집합과 송출 카메라 피드의 출연자 집합이 같다).
  - 두 배 멀리 있는 출연자의 `size`는 절반이다.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/render/cameraFeed.test.ts` → FAIL
- [ ] **Step 3: 구현.** 가림 판정은 view만으로 할 수 없으니, 엔진이 카메라마다 잡힌 id 목록을 `BroadcastView.cameraSubjects: Record<string, string[]>`로 싣고(이 task에서 `engine.ts`에 추가) 피드는 그 목록 안에서만 투영한다.
- [ ] **Step 4: 통과 확인.** Run: `npx vitest run src/render src/sim` → PASS
- [ ] **Step 5: Commit.** `git commit -m "feat(showmustgowrong): 카메라 피드 투영"`

---

### Task 7: 정보 위계 HUD와 생방송 화면 배치

**Files:**
- Rewrite: `src/app/BroadcastScreen.tsx`, `src/app/Hud.tsx`, `src/app/InterventionPanel.tsx`
- Create: `src/app/TargetCard.tsx`, `src/app/OnAirColumn.tsx`, `src/app/HoverTip.tsx`
- Modify: `src/app/interventionTargets.ts`(카드용 정보 추가), `src/app/useBroadcastLoop.ts`, `src/app/loopState.ts`(필요 시), `src/app/screens.test.tsx`, `src/app/interventionTargets.test.ts`

**Interfaces:**
- Consumes: Task 4~6의 view 필드, `StudioRenderer.hitTest`, `CameraFeedCanvas`
- Produces:
  - `TargetOption`에 `role`, `tendency`, `presence`, `toleranceLeft`, `weight`, `misfireChance`, `cost`(`"내성 1 소모 · 누적 피로 +1"` 또는 스태프는 `"스태프 피로 +1"`) 추가. `DirectiveOption`에 `expect` 추가
  - 스튜디오 클릭 규칙: `useStudioClick(hit: StudioHit | null)`
    - 개입 중: 출연자·스태프를 클릭하면 대상 선택(Plan 1 동작)
    - 개입 밖, 방송 중(`phase === 'live'`): 출연자를 클릭하면 추적 카메라에 `track` 입력
    - 광고 중, 방송 종료 뒤, 이탈한 출연자, 빈 곳: 아무 입력도 보내지 않는다

**배치 (1280×720, spec 8.2)**
- 위 띠(높이 약 96px): 왼쪽 수위 게이지 4개(상한 80% 이상이면 그 게이지만 빨간 테두리), 가운데 시청자 수(추세 화살표 ▲/▼/–)와 남은 시간, 오른쪽 코너 이름과 번호(`게스트 토크 2/3`)
- 가운데: 스튜디오 캔버스. 가장 큰 영역이고 `fitIso`로 꽉 채운다. 창 크기가 바뀌면 `resize`
- 오른쪽 열(너비 약 300px): ON AIR 모니터(빨간 탈리, `CAM 2 클로즈업 · 대상 렉스` 같은 이름표, 송출 피드), 그 아래 다른 카메라 2대의 피드 미리보기(누르면 `switch`), 맨 아래 개입 버튼과 광고 버튼
- 왼쪽 열(너비 약 260px): 평소에는 작고 흐린 사고 로그(최근 몇 줄, 연쇄 깊이 들여쓰기). 개입 중에 대상을 고르면 그 자리에 `TargetCard`
- `TargetCard`: 이름과 역할, 스탯 칩(존재감, 남은 내성 점, 체급), 성향 한 줄, 엇나감 확률 한 번, 지시 버튼 2~3개(각각 지시 문구와 `expect`), 아래에 소모 비용. 스튜디오의 대상과 카드 사이를 선으로 잇는다(SVG 오버레이)
- 개입 중 스튜디오 위: `SLOW ×1/5` 배지와 남은 선택 시간(초, 소수 한 자리)을 크게
- `HoverTip`(4단계): 개입 밖에서 장비나 최근 현상 위에 마우스를 올리면 작은 설명(장비: 이름, 상태(멀쩡함/부서짐), 무엇에 부서지는지. 현상: 로그 문구와 강도)
- 광고 패널(Plan 1의 `AdPanel`)은 그대로 쓰고 오른쪽 열 위에 띄운다

- [ ] **Step 1: 테스트 작성.**
  - `interventionTargets.test.ts`: 카드 정보(`tendency`, `misfireChance`, `cost`, `expect`)가 view와 콘텐츠에서 채워진다. 이탈한 출연자는 목록에 없다.
  - `screens.test.tsx`(renderToStaticMarkup): 생방송 화면에 게이지 4개, 시청자 수, 남은 시간, 코너, ON AIR 이름표(`대상 <shortName>` 포함), 미리보기 2개, 개입·광고 버튼이 있다. 게이지 하나가 상한 80%를 넘은 view에서는 그 게이지에만 강조 표시(`data-highlighted="true"`)가 있다. 개입 중 view에서 대상을 고르면 `TargetCard`가 로그 자리에 있고, 엇나감 확률이 한 번만 나온다.
  - 클릭 규칙 단위 테스트(`studioClick.test.ts`로 `useStudioClick`의 판정 함수 `studioClickInput(hit, state): BroadcastInput | 'selectTarget' | null`를 분리해 테스트): Review Focus 4의 네 경우에 null, 개입 밖 출연자 클릭은 `track` 입력, 개입 중 출연자 클릭은 `'selectTarget'`.
- [ ] **Step 2: 실패 확인.** Run: `npx vitest run src/app` → FAIL
- [ ] **Step 3: 구현.** 판정 함수 `studioClickInput`은 `src/app/studioClick.ts`에 둔다.
- [ ] **Step 4: 통과 확인.** Run: `npx vitest run` → PASS. `npm run lint`, `npm run build` → 0.
- [ ] **Step 5: Commit.** `git commit -m "feat(showmustgowrong): 정보 위계 HUD와 생방송 화면 배치"`

---

### Task 8: e2e, 스크린샷, 자기 플레이 점검

**Files:**
- Modify: `tests/e2e/broadcast.spec.ts`, `tests/screens/*.png`
- Modify: `docs/lab/worklog/pilot-showmustgowrong.md`

- [ ] **Step 1: e2e 수정과 추가.**
  - 방송이 시작되면 1280×720에서 스크롤이 없다(`document.documentElement.scrollHeight <= 720`, 너비도 같음).
  - 미리보기를 눌러 카메라를 바꾸면 ON AIR 이름표가 바뀐다.
  - 개입 밖에서 스튜디오의 출연자를 클릭하면 ON AIR 이름표(클로즈업이 송출 중일 때)의 대상 이름이 바뀐다.
  - 개입 버튼 → 출연자 클릭 → 카드가 뜨고 남은 시간이 10초에서 줄어든다 → 지시 클릭 → 개입이 닫히고 로그에 지시 결과가 남는다.
  - 스크린샷 두 장을 다시 찍는다: `broadcast-1280x720.png`(평상시), `broadcast-intervention-1280x720.png`(카드가 열린 개입).
- [ ] **Step 2: 실행.** Run: `npm run e2e` → PASS
- [ ] **Step 3: 자기 플레이 점검.** dev 서버로 한 회를 직접 돌리고 스크린샷 두 장을 시안(B·A·개입)과 나란히 본다. spec 8.2의 결정 5개마다 "이 화면만 보고 내릴 수 있는가"를 표로 작업 로그에 적는다(예/아니오와 근거). 아니오가 있으면 고친 뒤 다시 점검한다.
- [ ] **Step 4: 전체 확인.** Run: `npx vitest run && npm run lint && npm run build && npm run e2e` → 모두 통과
- [ ] **Step 5: 작업 로그.** 이 plan에서 내린 결정(Ruling)과 자기 플레이 점검표를 `docs/lab/worklog/pilot-showmustgowrong.md`에 추가한다.
- [ ] **Step 6: Commit.** `git commit -m "test(showmustgowrong): 쿼터뷰 화면 e2e와 자기 플레이 점검"`
