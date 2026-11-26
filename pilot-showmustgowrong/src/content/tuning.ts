/**
 * 게임 조정 목록(spec Plan B1 1.3). 플레이 감각 수치의 기본값·범위·근거가 여기 있다.
 * kit과 tuningSource만 import한다. balance.ts와 mind가 이 모듈을 import하므로 거꾸로 import하면 순환이 된다.
 *
 * 범위 규칙: 비율·확률은 0~1(간격 0.01), 감정 문턱은 0~100(간격 1), 그 밖은 0~기본값×4이고 간격은 기본값의
 * 1/20에 가장 가까운(로그 기준) 1·2·5×10ⁿ이다. 그 간격의 눈금에 기본값이 없으면 기본값이 눈금에 올 때까지 다음으로
 * 작은 1·2·5 값으로 내린다(슬라이더가 기본값을 가리킬 수 있게). 기본값이 0인 항목은 range를 직접 적는다.
 *
 * 하한 규칙: 0이 뜻이 있는 값은 하한 0이다. 비율·확률, 양·상한·배율(0 = 효과 없음), 쿨다운·유예·원인 연결 창·
 * 회상 범위·반경(0 = 없음), 기본 상황 빠짐(0 = 빠지지 않음), 자동 슬로모션 길이(0 = 끔), 최소 컷 유지(0 = 바로
 * 옮김)가 그렇다. 0이면 고장 나는 값은 positive로 표시하고 하한을 간격 한 칸으로 올린다.
 * - 나누는 값: 방송 길이(쇼 배율 = 극 중 길이 / 방송 길이), 개입 슬로모션 속도(HUD가 1/속도를 보이고 0이면 개입 중
 *   시간이 멈춘다).
 * - 평균 대기와 주기: 터짐 평균 대기(0이면 매 틱 터짐), 버릇 간격, 로그 재촉, 자동 PD 컷 길이(0이면 매 스텝 반복).
 * - 감쇠 지속: 사건 이유·후련함 지속(0이면 이유가 생기자마자 사라져 효과가 없다).
 * - 플레이어가 쓰는 시간 창: 개입 선택 시간, 광고 길이(0이면 조작하거나 볼 틈이 없다).
 * - 콘텐츠 검증이 0을 거부하는 값: 출연자 감정 속도(perShowMinute·fadePerShowMinute > 0, validate.ts). 0이면 엔진 생성이
 *   throw해 화면이 깨진다.
 *
 * 관계 규칙(TUNING_CONSTRAINTS): 범위 안 값이라도 조합이 어긋나면(예: 내림 문턱 >= 진입 문턱) 걸린 저장값을
 * 기본값으로 되돌리고 TUNING.rejected에 conflict로 남긴다. 감정 문턱 관계는 콘텐츠 문턱 검증(isValidThresholds)과 같다.
 *
 * 시간 단위: 몸 초는 물리 시간(평소 실제 1초, 개입 슬로모션 중 실제 5초), 극 중 초·분은 쇼 배율이 곱해진 시간
 * (토크쇼 배율 10: 극 중 1분 = 평소 실제 6초), 실제 초는 사람이 보는 시간이다.
 */
import {
  enforceConstraints,
  resolveTuning,
  type ResolvedTuning,
  type TunableDef,
  type TuningConstraint,
} from '../kit/tuning/tuning'
import { initialOverrides } from './tuningSource'

export const TUNING_STORAGE_KEY = 'exnihilo.showmustgowrong.tuning'

type Range = Pick<TunableDef, 'min' | 'max' | 'step'>

const NICE_MANTISSAS = [1, 2, 5] as const

function isOnGrid(value: number, step: number): boolean {
  const ratio = value / step
  return Math.abs(ratio - Math.round(ratio)) < 1e-9
}

/** target 근처의 1·2·5×10ⁿ 후보를 작은 것부터 */
function niceSteps(target: number): number[] {
  const exponent = Math.floor(Math.log10(target))
  const candidates: number[] = []
  for (let power = exponent - 3; power <= exponent + 1; power += 1) {
    for (const mantissa of NICE_MANTISSAS) candidates.push(mantissa * 10 ** power)
  }
  return candidates
}

/** 후보 중 target에 로그 기준으로 가장 가까운 값의 자리 */
function nearestNiceStepIndex(candidates: readonly number[], target: number): number {
  let best = 0
  for (let index = 1; index < candidates.length; index += 1) {
    const distance = Math.abs(Math.log10(candidates[index]) - Math.log10(target))
    const bestDistance = Math.abs(Math.log10(candidates[best]) - Math.log10(target))
    if (distance < bestDistance) best = index
  }
  return best
}

/** 그 밖의 값: 0 ~ 기본값×4(음수 기본값이면 기본값×4 ~ 0). 기본값이 0이면 크기를 알 수 없어 throw한다 */
export function scaledRange(key: string, defaultValue: number): Range {
  if (defaultValue === 0) throw new Error(`기본값이 0인 항목은 range를 직접 적어야 합니다: ${key}`)
  const size = Math.abs(defaultValue)
  const candidates = niceSteps(size / 20)
  let index = nearestNiceStepIndex(candidates, size / 20)
  while (index > 0 && !isOnGrid(defaultValue, candidates[index])) index -= 1
  // 부동소수 오차(0.30000000000000004 같은)를 지운다
  const step = Number(candidates[index].toPrecision(1))
  return { min: Math.min(0, defaultValue * 4), max: Math.max(0, defaultValue * 4), step }
}

const RATIO_RANGE: Range = { min: 0, max: 1, step: 0.01 }
const THRESHOLD_RANGE: Range = { min: 0, max: 100, step: 1 }

type Entry = Omit<TunableDef, 'group' | 'min' | 'max' | 'step'> & {
  range?: 'ratio' | 'threshold' | Range
  /** 0이면 고장 나는 값. 하한을 간격 한 칸으로 올린다(머리 주석의 하한 규칙) */
  positive?: true
}

function group(name: string, entries: readonly Entry[]): TunableDef[] {
  return entries.map(({ range, positive, ...entry }) => {
    const resolved =
      range === 'ratio'
        ? RATIO_RANGE
        : range === 'threshold'
          ? THRESHOLD_RANGE
          : (range ?? scaledRange(entry.key, entry.defaultValue))
    const min = positive ? resolved.step : resolved.min
    return { ...entry, group: name, ...resolved, min }
  })
}

export const TUNABLES: readonly TunableDef[] = [
  ...group('방송', [
    {
      key: 'BROADCAST_REAL_SECONDS',
      positive: true,
      label: '방송 길이',
      unit: '실제 초',
      defaultValue: 180,
      description: '한 회 방송의 실제 길이. 극 중 길이와 무관하고, 코너는 이것을 3등분한다.',
    },
  ]),

  // 감정 기본값의 체감 목표(living spec 1.1): 평온 -> 1단계 실제 40~60초, 1 -> 2단계 실제 20~40초.
  ...group('감정', [
    // 토크쇼(배율 10)에서 0 -> 50은 극 중 8.3분 = 실제 50초(목표 40~60초),
    // 50 -> 80은 극 중 5분 = 실제 30초(목표 20~40초).
    {
      key: 'SITUATION_REFERENCE_PER_SHOW_MINUTE',
      label: '기준 상황 쌓임',
      unit: '극 중 분당',
      defaultValue: 6,
      description: '기준 상황이 참일 때 극 중 1분에 쌓이는 감정. 0 -> 50이 실제 약 50초다.',
    },
    // 토크쇼(극 중 1분 = 실제 6초)에서 실제 초당 약 0.58이라 50이 실제 약 86초에 0이 된다. 사건 하나가 정적을 끊는
    // 실제 5초 동안 모두의 정적 감정이 약 2.9만 빠진다. 12(실제 5초에 10)였을 때는 1단계 출연자 셋의 작은 터짐이
    // 서로의 지루함을 계속 깎아 아무도 2단계에 닿지 못하는 방송이 시드의 30% 가까이 나왔다(Task 10).
    // 4 -> 3.5(Plan B1 Task 8): 자동 PD의 관객석 컷은 관객 소음을 송출해 컷마다 밋밋함을 끊는다(컷 8초에서 측정상
    // 평소 실제 분당 약 1.3회). 다른 네 값을 최종값으로 두고 이것만 4일 때 끊길 때마다 3.3씩 깎여 기본 라인업 큰 터짐
    // 1~3회가 시드 70%(35/50)였다.
    {
      key: 'SITUATION_FADE_PER_SHOW_MINUTE',
      label: '상황 빠짐',
      unit: '극 중 분당',
      defaultValue: 3.5,
      description: '상황 조건이 끝나면 극 중 1분에 빠지는 감정. 크면 사건 하나가 정적 감정을 크게 깎는다.',
    },
    {
      key: 'SITUATION_CAP',
      label: '상황 감정 상한',
      unit: '포인트',
      defaultValue: 100,
      description: '상황 하나가 쌓을 수 있는 감정의 상한.',
    },
    // 180초 = 토크쇼 실제 18초라 버릇 간격(실제 10~20초)과 겹쳐 쌓일 수 있다.
    {
      key: 'EVENT_REASON_SHOW_SECONDS',
      positive: true,
      label: '사건 이유 지속',
      unit: '극 중 초',
      defaultValue: 180,
      description: '사건(지시) 이유가 0으로 줄어드는 시간. 토크쇼 실제 18초라 버릇 간격과 겹쳐 쌓인다.',
    },
    {
      key: 'RELIEF_AMOUNT',
      label: '후련함',
      unit: '포인트',
      defaultValue: -40,
      description: '큰 터짐 뒤 그 감정에 남는 후련함. 0에 가까우면 큰 터짐 뒤에도 빨리 다시 찬다.',
    },
    {
      key: 'RELIEF_SHOW_SECONDS',
      positive: true,
      label: '후련함 지속',
      unit: '극 중 초',
      defaultValue: 600,
      description: '후련함이 0으로 줄어드는 시간. 600 = 토크쇼 실제 60초.',
    },
    // 올라가는 문턱과 내려가는 문턱이 10 벌어져 값이 문턱 근처에서 흔들려도 단계가 깜빡이지 않는다.
    {
      key: 'threshold.rise1',
      label: '1단계 진입 문턱',
      unit: '포인트',
      defaultValue: 50,
      range: 'threshold',
      description: '감정이 이 값에 닿으면 1단계. 1단계 내림 문턱보다 커야 한다.',
    },
    {
      key: 'threshold.rise2',
      label: '2단계 진입 문턱',
      unit: '포인트',
      defaultValue: 80,
      range: 'threshold',
      description: '감정이 이 값에 닿으면 2단계(큰 터짐 대기). 1단계 문턱보다 커야 한다.',
    },
    {
      key: 'threshold.fall1',
      label: '1단계 내림 문턱',
      unit: '포인트',
      defaultValue: 40,
      range: 'threshold',
      description: '1단계에서 감정이 이 값 아래로 내려가면 평온. 진입 문턱과 벌어져 깜빡임을 막는다.',
    },
    {
      key: 'threshold.fall2',
      label: '2단계 내림 문턱',
      unit: '포인트',
      defaultValue: 70,
      range: 'threshold',
      description: '2단계에서 이 값 아래로 내려가면 1단계. 작은 터짐 뒤(80 × 0.9 = 72)에도 2단계가 남게 70이다.',
    },
    // intense는 100(꽉 참)이다. 정적 지루함은 2단계에서도 계속 오르므로 95면 큰 터짐 대기(유예 포함 평균 실제 약
    // 11초) 중에 자주 넘었고, 강도 3 소음이 반사 반응 사슬을 깊이 4로 키웠다(Task 10 무입력 sim). 공용 정적
    // 지루함(극 중 분당 4.5 = 실제 초당 0.75)으로 80에서 100까지 실제 약 27초라, 유예 뒤 대기(평균 8.25초)보다
    // 세 배쯤 길게 참은 경우만 intense가 된다. 그래서 intense는 사실상 정적처럼 오래 이어지는 상황 이유에서만 나온다.
    {
      key: 'threshold.intense',
      label: '참다 터짐 문턱',
      unit: '포인트',
      defaultValue: 100,
      range: 'threshold',
      description: '큰 터짐 때 감정이 이 값 이상이면 한 단계 더 크게 번진다. 낮추면 강도 3 사슬이 깊어진다.',
    },
  ]),

  ...group('터짐', [
    // 2단계 문턱 80에서 작은 터짐이 나도 72라 내려가는 문턱 70 위에 남는다(living spec 3.3: 작은 터짐은 2단계
    // 유예 중에도 일어날 수 있다). 0.6이면 80 -> 48로 2단계가 끝나 2단계 구간의 절반이 큰 터짐 없이 끝났다(Task 10).
    {
      key: 'SMALL_BURST_KEEP',
      label: '작은 터짐 뒤 남는 감정',
      unit: '비율',
      defaultValue: 0.9,
      range: 'ratio',
      description: '작은 터짐이 그 감정의 양수 이유를 남기는 비율. 낮추면 작은 터짐이 2단계를 끝내 버린다.',
    },
    // 간격은 쿨다운 + Exp(MTB)라 MTB를 짧게 두면 거의 쿨다운 주기로 터져 방송당 횟수가 고르게 나온다. MTB가 간격
    // 대부분을 차지하던 때(극 중 420초)는 횟수가 포아송처럼 2~12회로 퍼져 living spec 7.1의 "4~8회"에 시드 66%만
    // 들었다(Task 10, 쿨다운 손잡이).
    {
      key: 'SMALL_BURST_MTB_SHOW_SECONDS',
      positive: true,
      label: '작은 터짐 평균 대기',
      unit: '극 중 초',
      defaultValue: 50,
      description: '쿨다운이 끝난 뒤 작은 터짐까지의 평균(실제 5초). 길면 방송당 횟수가 들쭉날쭉해진다.',
    },
    // 무입력 sim에서 감정 하나가 1단계 이상에 머무는 시간이 실제 약 60~95초(출연진 합계 방송당 약 300~370초)라,
    // 쿨다운 + MTB = 실제 90초면 1단계 구간마다 작은 터짐이 대략 한 번이고 방송당 평균 5~6회다(목표 4~8회).
    {
      key: 'SMALL_BURST_COOLDOWN_SHOW_SECONDS',
      label: '작은 터짐 쿨다운',
      unit: '극 중 초',
      defaultValue: 850,
      description: '같은 감정의 작은 터짐 뒤 다시 터지지 않는 시간(실제 85초). 방송당 작은 터짐 수를 정한다.',
    },
    {
      key: 'BIG_BURST_GRACE_BODY_SECONDS',
      label: '큰 터짐 유예',
      unit: '몸 초',
      defaultValue: 3,
      description: '2단계 진입 뒤 큰 터짐이 없는 시간. living spec 1.1의 "2단계 진입 3초 안에는 터지지 않는다".',
    },
    // 유예가 끝나는 틱에서 첫 판정을 하므로 순수 대기 기댓값은 0.5/p - 0.5이고, 틱 확률
    // p = 1 - e^(-0.5/8.5) ≈ 0.0571이라 약 8.25초다. living spec 1.1의 "유예 뒤 평균 8초 이상"을 만족한다.
    {
      key: 'BIG_BURST_MTB_BODY_SECONDS',
      positive: true,
      label: '큰 터짐 평균 대기',
      unit: '몸 초',
      defaultValue: 8.5,
      description: '유예 뒤 큰 터짐까지의 평균 목표. 8.5면 실제 대기 약 8.25초로 경고 창이 평균 8초를 넘는다.',
    },
    {
      key: 'STAGE_LINE_COOLDOWN_SHOW_SECONDS',
      label: '단계 진입 줄 쿨다운',
      unit: '극 중 초',
      defaultValue: 120,
      description: '같은 감정·같은 단계 진입 줄이 다시 나오지 않는 시간(실제 12초). 문턱 근처 깜빡임을 줄 하나로 줄인다.',
    },
  ]),

  ...group('버릇', [
    // living spec 1.1 목표 그대로 토크쇼(배율 10)의 실제 10~20초다. 긴 쪽은 늘 짧은 쪽의 2배로 둔다.
    {
      key: 'HABIT_INTERVAL_SHOW_SECONDS',
      positive: true,
      label: '버릇 간격(짧은 쪽)',
      unit: '극 중 초',
      defaultValue: 100,
      description: '버릇 사이 간격의 짧은 쪽. 긴 쪽은 이 값의 2배다(기본 100~200 = 실제 10~20초).',
    },
    {
      key: 'HABIT_BOREDOM_SHORTEN',
      label: '지루함의 버릇 재촉',
      unit: '비율',
      // 0.4 -> 0.55(Plan B1 Task 8): 자동 PD 클로즈업·관객석 컷에서는 화면 밖 출연자의 소리 버릇이 송출되지 않아 방송
      // 정적(실제 5초)이 잦아진다. 지루할수록 버릇이 잦아지게 해 지루한 출연자가 정적을 메운다. 지루함 100이면 간격이
      // 실제 10~20초에서 4.5~9초로 줄고(0.4일 때 6~12초), 지루함 0의 버릇 간격(living spec 1.1 실제 10~20초)은 그대로다.
      // 0.4에서는 준 라인업 정적 줄 20% 이하가 시드 78%(39/50)였다.
      defaultValue: 0.55,
      range: 'ratio',
      description: '지루함 100일 때 버릇 간격이 줄어드는 비율. 간격 × (1 - 0.55 × 지루함/100)이라 실제 4.5~9초가 된다.',
    },
    {
      key: 'HABIT_COOLDOWN_SHOW_SECONDS',
      label: '같은 버릇 쿨다운',
      unit: '극 중 초',
      defaultValue: 300,
      description: '같은 버릇이 다시 뽑히지 않는 시간(실제 30초).',
    },
    {
      key: 'HABIT_REST_AFTER_ACTION_BODY_SECONDS',
      label: '행동 뒤 쉼',
      unit: '몸 초',
      defaultValue: 2,
      description: '이동·넘어짐 같은 행동 뒤 버릇과 터짐을 미루는 시간(L5).',
    },
    {
      key: 'RESPONSE_COOLDOWN_SHOW_SECONDS',
      label: '응답 쿨다운',
      unit: '극 중 초',
      defaultValue: 60,
      description: '응답 버릇을 한 뒤 다시 응답하지 않는 시간(실제 6초). 주고받기가 끝나게 한다.',
    },
    {
      key: 'RECALL_SHOW_SECONDS',
      label: '버릇 회상 범위',
      unit: '극 중 초',
      defaultValue: 120,
      description: '최근 버릇 회상(living spec 5.2-2)이 붙는 범위(실제 12초).',
    },
    // living spec 1.1의 로그 밀도 하한(공백 실제 5초 이하)은 실제 초이므로 쇼 배율과 관계없이 평상시 실제 4초가
    // 되게 몸 초로 둔다(Ruling 16). 틱 0.5초를 더해도 4.5초다.
    {
      key: 'LOG_NUDGE_BODY_SECONDS',
      positive: true,
      label: '로그 재촉',
      unit: '몸 초',
      defaultValue: 4,
      description: '로그에 새 줄이 이만큼 없으면 누군가를 재촉한다(L2). 로그 공백 실제 5초 이하 목표에서 나왔다.',
    },
    {
      key: 'NEAR_RADIUS',
      label: '근처 반경',
      unit: 'm',
      defaultValue: 3.5,
      description: '이웃을 근처로 보는 반경. 이웃 자리 간격(2.5~3m)만 근처다.',
    },
  ]),

  ...group('연쇄', [
    {
      key: 'MOTION_CAUSE_SECONDS',
      label: '충돌 원인 연결',
      unit: '몸 초',
      defaultValue: 2,
      description: '출연자를 움직이게 한 원인이 다음 충돌로 이어지는 시간. 늘리면 무입력 연쇄가 부푼다.',
    },
    {
      key: 'REACTION_COOLDOWN_SECONDS',
      label: '반사 반응 쿨다운',
      unit: '몸 초',
      defaultValue: 1,
      description: '같은 반사 반응이 다시 나오지 않는 시간.',
    },
    {
      key: 'CHAIN_BONUS_PER_DEPTH',
      label: '연쇄 깊이 보너스',
      unit: '배(깊이당)',
      defaultValue: 0.5,
      description: '연쇄 깊이 1마다 사건 점수에 더하는 배율. 점수 × (1 + 0.5 × (깊이 - 1)).',
    },
    // 알아채기 0.5초, 읽고 판단하기 1~2초, Space 0.5초에 여유를 더했다. 몸 시간이라 개입 슬로모션(5배) 중에는
    // 실제 25초다(spec Plan B1 3.2). Task 6이 상수로 쓴다.
    {
      key: 'TAKEOVER_BODY_SECONDS',
      label: '지시 이어받기 창',
      unit: '몸 초',
      defaultValue: 5,
      range: { min: 0, max: 20, step: 0.5 },
      description: '출연자 지시가 그 출연자가 연루된 마지막 사고를 원인으로 이어받는 시간.',
    },
  ]),

  ...group('시청률', [
    {
      key: 'VIEWERS_START',
      label: '시작 시청자',
      unit: '천 명',
      defaultValue: 500,
      description: '방송 시작 때 시청자 수.',
    },
    {
      key: 'VIEWERS_PER_POINT',
      label: '점수당 시청자',
      unit: '천 명/점',
      defaultValue: 4,
      description: '송출된 사건 점수 1점이 늘리는 시청자 수.',
    },
  ]),

  ...group('개입', [
    {
      key: 'INTERVENTION_SPEED',
      positive: true,
      label: '개입 슬로모션 속도',
      unit: '배',
      defaultValue: 0.2,
      range: 'ratio',
      description: '개입 중 몸 시간이 흐르는 빠르기. 0.2면 몸 1초가 실제 5초다.',
    },
    {
      key: 'INTERVENTION_REAL_SECONDS',
      positive: true,
      label: '개입 선택 시간',
      unit: '실제 초',
      defaultValue: 10,
      description: '개입에서 대상 카드를 읽고 고를 시간(spec 8.2).',
    },
    {
      key: 'AUTO_SLOWMO_REAL_SECONDS',
      label: '자동 슬로모션 길이',
      unit: '실제 초',
      defaultValue: 1.5,
      description: '게이지가 위험선에 닿을 때 저절로 걸리는 슬로모션 길이.',
    },
    {
      key: 'AUTO_SLOWMO_GAUGE_RATIO',
      label: '게이지 위험선',
      unit: '비율',
      defaultValue: 0.8,
      range: 'ratio',
      description: '게이지가 상한의 이 비율에 닿으면 경고와 자동 슬로모션이 걸린다.',
    },
    {
      key: 'FATIGUE_MISFIRE_PER_POINT',
      label: '출연자 피로당 엇나감',
      unit: '확률(피로 1당)',
      defaultValue: 0.1,
      range: 'ratio',
      description: '출연자 지시 피로 1마다 지시가 엇나갈 확률.',
    },
    {
      key: 'STAFF_FATIGUE_MISFIRE_PER_POINT',
      label: '스태프 피로당 엇나감',
      unit: '확률(피로 1당)',
      defaultValue: 0.15,
      range: 'ratio',
      description: '스태프 지시 피로 1마다 지시가 엇나갈 확률.',
    },
    {
      key: 'MISFIRE_CAP',
      label: '엇나감 상한',
      unit: '확률',
      defaultValue: 0.6,
      range: 'ratio',
      description: '피로가 아무리 쌓여도 넘지 않는 엇나감 확률.',
    },
    {
      key: 'OVERDO_MULTIPLIER',
      label: '과잉 배율',
      unit: '배',
      defaultValue: 1.5,
      description: '과잉 엇나감이 이동 속도와 지시의 감정 변화 양에 곱하는 배율.',
    },
  ]),

  ...group('광고', [
    {
      key: 'AD_BREAK_REAL_SECONDS',
      positive: true,
      label: '광고 길이',
      unit: '실제 초',
      defaultValue: 3,
      description: '광고가 이어지는 시간.',
    },
    {
      key: 'AD_VIEWER_LOSS',
      label: '광고 시청자 이탈',
      unit: '비율',
      defaultValue: 0.1,
      range: 'ratio',
      description: '광고를 넣을 때 떠나는 시청자 비율.',
    },
  ]),

  // 실제 토크쇼 컷 4~8초에서 골랐다(spec Plan B1 2.3). Task 7이 상수로 쓴다.
  // 컷 길이 5 -> 8(Plan B1 Task 8): 관객석 컷은 4컷 순환에 한 번이고 관객 소음(실제 3초마다)이 송출되어 밋밋함을
  // 끊는다. 설계상 네 칸 모두 같은 컷 길이라 한 바퀴는 5초×4 = 실제 20초에서 8초×4 = 32초가 된다(관객석 컷 평소 실제
  // 분당 3.0 -> 1.9회). 실제로는 관객 소음이 사고라 관객석 컷이 약 2.9초 만에 와이드로 넘어가고, 출연자 사고를
  // 따라가느라 클로즈업은 길어진다. 측정(기본 라인업 시드 1~10)으로 관객석 컷은 평소 실제 분당 2.23 -> 1.30회였다.
  // 다른 네 값을 최종값으로 두고 컷만 5일 때 기본 라인업 큰 터짐 1~3회가 시드 64%(32/50)였다.
  // 8은 실제 토크쇼 컷 4~8초의 가장 긴 쪽이고, spec 2.3의 값(5)을 이 측정으로 바꿨다.
  ...group('자동 PD', [
    {
      key: 'AUTO_SHOT_BODY_SECONDS',
      positive: true,
      label: '평소 컷 길이',
      unit: '몸 초',
      defaultValue: 8,
      description: '자동 PD가 한 컷을 잡고 다음 순서로 넘기기까지의 시간(평소 실제 8초, 실제 토크쇼 컷 4~8초의 긴 쪽).',
    },
    {
      key: 'AUTO_MIN_HOLD_BODY_SECONDS',
      label: '최소 컷 유지',
      unit: '몸 초',
      defaultValue: 1.5,
      description: '다른 출연자의 사고로 컷을 옮기기 전에 지금 컷을 잡는 최소 시간. 컷이 깜빡이지 않게 한다.',
    },
  ]),

  ...group('출연자', [
    // 기준(6)의 0.75배(실제 초당 0.75). 정적이 이어지면 실제 약 67초에 1단계, 다시 약 40초에 2단계다
    // (living spec 1.1의 1단계 목표 40~60초보다 느림, 사용자 확인 항목). 출연자마다 속도를 다르게 두어
    // (프리야 6, 오카포 5.5, 공용 4.5, 렉스 4) 같은 정적에 모두 함께 2단계에 닿지 않게 한다(Task 10).
    {
      key: 'mind.common.boredom.silence.perShowMinute',
      positive: true,
      label: '공용 정적 지루함',
      unit: '극 중 분당',
      defaultValue: 4.5,
      description: '정적 동안 쌓이는 지루함(따로 정하지 않은 출연자, 지금은 모). 실제 약 67초에 1단계.',
    },
    {
      key: 'mind.rex.attention.offScreen.perShowMinute',
      positive: true,
      label: '렉스 주목 욕구 쌓임',
      unit: '극 중 분당',
      // spec Plan B1 4: 1단계 문턱 50을 화면 밖 누적 실제 약 25초에 닿게 한다.
      // 50 ÷ 실제 25초 = 실제 초당 2 = 극 중 분당 12(토크쇼 배율 10, 극 중 1분 = 실제 6초)
      defaultValue: 12,
      description: '렉스가 화면에 안 잡힐 때 쌓이는 주목 욕구. 화면 밖 누적 실제 약 25초에 1단계.',
    },
    {
      key: 'mind.rex.attention.offScreen.fadePerShowMinute',
      positive: true,
      label: '렉스 주목 욕구 빠짐',
      unit: '극 중 분당',
      // 40 -> 15(spec Plan B1 4, Task 8): 극 중 분당 15 = 실제 초당 2.5라 화면에 잡힌 1초가 화면 밖 1.25초를 지운다
      // (쌓임 실제 초당 2). 40(실제 초당 약 6.7)에서는 화면 밖 3.3초를 지워 자동 PD 방송에서 1단계 도달이 2%였다.
      // 최종 조합(컷 8초 등, 작업 로그 "B1 무입력 검증(자동 PD)")의 자동 PD 기본 라인업 시드 50에서 1단계 도달 50%다.
      defaultValue: 15,
      description: '렉스가 다시 화면에 잡히면 빠지는 주목 욕구. 화면에 잡힌 1초가 화면 밖 1.25초만큼을 지운다.',
    },
    {
      key: 'mind.rex.boredom.silence.perShowMinute',
      positive: true,
      label: '렉스 정적 지루함',
      unit: '극 중 분당',
      defaultValue: 4,
      description: '정적 동안 렉스에게 쌓이는 지루함. 공용보다 느려 다른 출연자와 다른 때 찬다.',
    },
    // 8이면 방송당 큰 터짐이 두 번 나는 일이 잦았다(Task 10).
    {
      key: 'mind.priya.boredom.silence.perShowMinute',
      positive: true,
      label: '프리야 정적 지루함',
      unit: '극 중 분당',
      defaultValue: 6,
      description: '정적을 못 견뎌 공용(4.5)보다 빠르다. 8이면 큰 터짐이 두 번 나는 방송이 잦았다.',
    },
    {
      key: 'mind.okafor.boredom.silence.perShowMinute',
      positive: true,
      label: '오카포 정적 지루함',
      unit: '극 중 분당',
      defaultValue: 5.5,
      description: '공용(4.5)과 프리야(6) 사이로 두어 정적 지루함이 출연자마다 다른 때 차오르게 한다.',
    },
    {
      key: 'mind.mo.excitement.studioAudience.perShowMinute',
      positive: true,
      label: '모 관객 앞 흥분',
      unit: '극 중 분당',
      defaultValue: 2,
      description: '스튜디오 관객이 있는 쇼에서 모에게 늘 쌓이는 흥분.',
    },
    {
      key: 'mind.june.chatter.silence.perShowMinute',
      positive: true,
      label: '준 수다 욕구 쌓임',
      unit: '극 중 분당',
      defaultValue: 9,
      description: '정적 동안 준에게 쌓이는 수다 욕구.',
    },
    {
      key: 'mind.june.chatter.silence.fadePerShowMinute',
      positive: true,
      label: '준 수다 욕구 빠짐',
      unit: '극 중 분당',
      defaultValue: 20,
      description: '정적이 끊기면 빠지는 준의 수다 욕구.',
    },
    {
      key: 'mind.june.anxiety.nearTag.perShowMinute',
      positive: true,
      label: '준 덩치 옆자리 불안',
      unit: '극 중 분당',
      defaultValue: 2,
      description: '운동선수 옆자리에 앉은 동안 준에게 쌓이는 불안.',
    },
    {
      key: 'mind.june.boredom.silence.perShowMinute',
      positive: true,
      label: '준 정적 지루함',
      unit: '극 중 분당',
      defaultValue: 3,
      description: '정적 동안 준에게 쌓이는 지루함.',
    },
  ]),
]

const THRESHOLD_CONSTRAINTS: readonly TuningConstraint[] = [
  {
    keys: ['threshold.fall1', 'threshold.rise1'],
    description: '1단계 내림 문턱은 0보다 크고 1단계 진입 문턱보다 작아야 합니다',
    holds: (v) => 0 < v['threshold.fall1'] && v['threshold.fall1'] < v['threshold.rise1'],
  },
  {
    keys: ['threshold.fall2', 'threshold.rise2'],
    description: '2단계 내림 문턱은 0보다 크고 2단계 진입 문턱보다 작아야 합니다',
    holds: (v) => 0 < v['threshold.fall2'] && v['threshold.fall2'] < v['threshold.rise2'],
  },
  {
    keys: ['threshold.rise1', 'threshold.rise2'],
    description: '1단계 진입 문턱은 2단계 진입 문턱보다 작아야 합니다',
    holds: (v) => v['threshold.rise1'] < v['threshold.rise2'],
  },
  {
    keys: ['threshold.fall1', 'threshold.fall2'],
    description: '1단계 내림 문턱은 2단계 내림 문턱보다 작아야 합니다',
    holds: (v) => v['threshold.fall1'] < v['threshold.fall2'],
  },
  {
    keys: ['threshold.rise2', 'threshold.intense'],
    description: '2단계 진입 문턱은 참다 터짐 문턱 이하여야 합니다',
    holds: (v) => v['threshold.rise2'] <= v['threshold.intense'],
  },
]

const AUTO_DIRECTOR_CONSTRAINTS: readonly TuningConstraint[] = [
  {
    keys: ['AUTO_MIN_HOLD_BODY_SECONDS', 'AUTO_SHOT_BODY_SECONDS'],
    description: '최소 컷 유지는 평소 컷 길이 이하여야 합니다',
    holds: (v) => v['AUTO_MIN_HOLD_BODY_SECONDS'] <= v['AUTO_SHOT_BODY_SECONDS'],
  },
]

/** 항목 사이의 관계. 엔진이 throw하는 관계는 없고, 감정 문턱만 조합이 어긋나면 단계 판정이 뒤엉킨다 */
export const TUNING_CONSTRAINTS: readonly TuningConstraint[] = [...THRESHOLD_CONSTRAINTS, ...AUTO_DIRECTOR_CONSTRAINTS]

function loadTuning(): ResolvedTuning & { storageError: string | null } {
  const { overrides, error } = initialOverrides(TUNING_STORAGE_KEY)
  const resolved = enforceConstraints(TUNABLES, resolveTuning(TUNABLES, overrides), TUNING_CONSTRAINTS)
  return { ...resolved, storageError: error }
}

/** 모듈을 불러올 때 한 번 풀린다. 그 페이지(또는 sim 프로세스)의 모든 방송이 같은 값을 쓴다 */
export const TUNING: ResolvedTuning & { storageError: string | null } = loadTuning()

/** 조정 항목 값. 모르는 키면 throw */
export function tuned(key: string): number {
  const value = TUNING.values[key]
  if (value === undefined) throw new Error(`모르는 조정 항목입니다: ${key}`)
  return value
}
