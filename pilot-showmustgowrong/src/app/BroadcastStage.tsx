import { useMemo, useState, type MouseEvent, type PointerEvent, type Ref } from 'react'
import { INTERVENTION_SPEED, STEP_SECONDS, TREND_WINDOW_BODY_SECONDS } from '@/content/balance'
import type { PerformerDef, ShowDef } from '@/content/types'
import type { BroadcastInput, BroadcastSetup, BroadcastView } from '@/sim/engine'
import { AdPanel } from './AdPanel'
import { HoverTip } from './HoverTip'
import type { HoverTipState } from './hoverTipContent'
import { EventLog, TOP_BAND_HEIGHT, TopBand } from './Hud'
import { InterventionPanel } from './InterventionPanel'
import type { InterventionTarget } from './interventionTargets'
import { GAUGE_LABELS } from './labels'
import type { LogPerson } from './logSegments'
import { LAYOUT_GRIDS, layoutStorage, loadLayout, nextLayout, saveLayout, type LayoutMode } from './layout'
import { OnAirColumn } from './OnAirColumn'
import { TrendChart } from './TrendChart'
import type { TrendRecorder } from './trendRecorder'
import type { BroadcastLoopControls } from './useBroadcastLoop'
import { useLayoutHotkey } from './useLayoutHotkey'

/** 생방송 화면이 루프에서 쓰는 상태와 명령 */
export type StageControls = Omit<BroadcastLoopControls, 'view' | 'error' | 'result'>

/** 스튜디오 캔버스와 카드-대상 연결선을 위한 DOM 연결(정적 렌더 테스트에서는 없다) */
export interface StudioBindings {
  rowRef: Ref<HTMLDivElement>
  hostRef: Ref<HTMLDivElement>
  cardRef: Ref<HTMLElement>
  linkRef: Ref<SVGGElement>
  onClick(event: MouseEvent<HTMLDivElement>): void
  onMouseMove(event: MouseEvent<HTMLDivElement>): void
  onMouseLeave(): void
  /** 스튜디오의 추적 카메라 표시를 누르면 끌어 조준하기를 시작한다. */
  onPointerDown(event: PointerEvent<HTMLDivElement>): void
  /** 오른쪽 열의 추적 카메라 화면에서 끌어 조준하기를 시작한다. */
  onAimDragStart(cameraId: string, event: PointerEvent<HTMLElement>): void
}

export interface BroadcastStageProps {
  /** 방송이 아직 만들어지지 않았으면 null(스튜디오만 "준비 중") */
  view: BroadcastView | null
  setup: BroadcastSetup
  controls: StageControls
  /** 이 방송의 근접도 기록(방송마다 하나, BroadcastScreen이 만든다) */
  trend: TrendRecorder
  selectedTarget: InterventionTarget | null
  hoverTip: HoverTipState | null
  onSelectTarget(target: InterventionTarget): void
  onDirect(input: BroadcastInput): void
  onBeginIntervention(): void
  studio?: StudioBindings
}

/** 송출 쪽 grid 행: 모니터(위), 미리보기, 조작 안내(남는 높이), 개입·광고 버튼(아래) */
const STAGE_GRID_ROWS = 'auto auto minmax(0, 1fr) auto'

/**
 * 광고 패널 칸: 세 배치 모두 오른쪽 열(3열)의 위 세 행(버튼 위). 송출 화면 크게의 스튜디오 축소판(약 146px)
 * 하나에는 패널이 들어가지 않으므로 버튼 위 오른쪽 열 전체를 쓴다.
 */
// 절대 위치 grid 항목은 끝 줄이 auto면 패딩 끝까지 늘어나므로 끝 줄을 적는다
const AD_PANEL_CELL = { gridColumn: '3 / 4', gridRow: '1 / 4' } as const

/**
 * 생방송 화면 배치(1280×720, spec 2절). 위 띠(세 배치 공통, 한 줄) 아래에 grid로 왼쪽 260px(사고 로그,
 * 개입 중에는 판단 카드), 스튜디오, 송출 쪽 칸들을 놓는다. 배치(기본·스튜디오 크게·송출 화면 크게)는
 * grid 열 너비와 영역만 바꾸므로 스튜디오 host와 카메라 화면 캔버스는 같은 DOM 노드로 남는다(렌더러와
 * 캔버스를 다시 만들지 않는다). 스튜디오 캔버스는 렌더러가 붙이므로 여기서는 자리만 둔다.
 */
export function BroadcastStage({
  view,
  setup,
  controls,
  trend,
  selectedTarget,
  hoverTip,
  onSelectTarget,
  onDirect,
  onBeginIntervention,
  studio,
}: BroadcastStageProps) {
  const { show } = setup
  const { slowmo, interventionOpen, adPanelOpen, adBreak } = controls
  const performers = useMemo(
    () =>
      new Map<string, PerformerDef>(
        [...setup.performers, ...setup.bench].map((performer) => [performer.id, performer]),
      ),
    [setup],
  )
  /** 줄 속 이름을 칠할 출연자: 정식 이름과 짧은 이름 */
  const logPeople = useMemo<LogPerson[]>(
    () =>
      [...performers.values()].flatMap((performer) => [
        { name: performer.name, color: performer.color },
        { name: performer.shortName, color: performer.color },
      ]),
    [performers],
  )
  const trendColors = useMemo(
    () => Object.fromEntries([...performers.values()].map((performer) => [performer.id, performer.color])),
    [performers],
  )
  const trendNames = useMemo(
    () => Object.fromEntries([...performers.values()].map((performer) => [performer.id, performer.shortName])),
    [performers],
  )
  const [layoutStore] = useState(layoutStorage)
  const [layout, setLayout] = useState<LayoutMode>(() => loadLayout(layoutStore))
  /** 사용자가 배치를 바꿀 때만 저장한다(열 때는 저장소를 건드리지 않는다) */
  const changeLayout = (mode: LayoutMode): void => {
    setLayout(mode)
    saveLayout(layoutStore, mode)
  }
  useLayoutHotkey(() => changeLayout(nextLayout(layout)))
  const grid = LAYOUT_GRIDS[layout]
  const highlightedEventId = slowmo === 'auto' ? (view?.autoSlowmo?.eventId ?? null) : null
  const alertGauge = slowmo === 'auto' ? (view?.autoSlowmo?.gauge ?? null) : null

  return (
    <main
      data-layout={layout}
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b1120] text-white"
    >
      {view !== null ? (
        <TopBand
          view={view}
          show={show}
          alertGauge={alertGauge}
          layout={layout}
          onLayoutChange={changeLayout}
        />
      ) : (
        <div className="shrink-0" style={{ height: TOP_BAND_HEIGHT }} />
      )}
      <div
        ref={studio?.rowRef}
        className="relative grid min-h-0 flex-1 gap-2 px-3 pb-3"
        style={{
          gridTemplateColumns: grid.columns,
          gridTemplateRows: STAGE_GRID_ROWS,
          gridTemplateAreas: grid.areas,
        }}
      >
        <div style={{ gridArea: 'log' }} className="flex min-h-0 flex-col gap-2">
          {view !== null &&
            (interventionOpen ? (
              <InterventionPanel
                view={view}
                performers={performers}
                staff={setup.staff}
                cameras={show.cameras}
                selected={selectedTarget}
                onSelect={onSelectTarget}
                onDirect={onDirect}
                onClose={controls.closeIntervention}
                cardRef={studio?.cardRef}
              />
            ) : (
              <>
                <TrendPanel
                  trend={trend}
                  view={view}
                  startingIds={setup.performers.map((performer) => performer.id)}
                  colors={trendColors}
                  names={trendNames}
                  show={show}
                />
                <EventLog
                  log={view.log}
                  highlightedEventId={highlightedEventId}
                  show={show}
                  people={logPeople}
                />
                <p className="text-[11px] text-slate-500">
                  누적 피로 {view.fatigue} · 시드 {setup.seed}
                </p>
              </>
            ))}
        </div>
        {/* 송출 화면 크게에서는 오른쪽 위 작은 칸(16:9)이 된다. 호버 설명이 칸 밖으로 나갈 수 있게 자르기는 host가 한다 */}
        <div
          data-testid="studio"
          style={{ gridArea: 'studio' }}
          className={`relative min-h-0 min-w-0 rounded-xl border-2 border-slate-800 bg-[#14141c] ${
            grid.mainArea === 'studio' ? '' : 'aspect-video'
          }`}
        >
          <div
            ref={studio?.hostRef}
            data-testid="studio-host"
            onClick={studio?.onClick}
            onMouseMove={studio?.onMouseMove}
            onMouseLeave={studio?.onMouseLeave}
            onPointerDown={studio?.onPointerDown}
            className="studio-host absolute inset-0 cursor-pointer overflow-hidden rounded-[10px]"
          />
          {view === null && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              스튜디오 준비 중…
            </div>
          )}
          {hoverTip !== null && <HoverTip tip={hoverTip} />}
        </div>
        {view !== null && (
          <OnAirColumn
            view={view}
            show={show}
            performers={performers}
            onSwitch={(cameraId) => controls.send({ type: 'switch', cameraId })}
            onAimDragStart={studio?.onAimDragStart}
            previews={grid.previews}
            monitorFills={grid.mainArea === 'monitor'}
            actions={
              <BroadcastButtons
                view={view}
                controls={controls}
                onBeginIntervention={onBeginIntervention}
              />
            }
          />
        )}
        {/* 슬로모션 배지와 광고 화면은 배치와 상관없이 크게 보이는 칸(송출 화면 크게에서는 송출 모니터) 위에 띄운다(Ruling 10) */}
        <div
          style={{ gridArea: grid.mainArea }}
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl"
        >
          {view !== null && slowmo === 'intervention' && !adBreak && (
            <InterventionBadge
              secondsLeft={
                adPanelOpen ? (controls.adPanelSecondsLeft ?? 0) : controls.interventionSecondsLeft
              }
              purpose={adPanelOpen ? '안에 광고 효과 선택' : '안에 지시'}
            />
          )}
          {view !== null && slowmo === 'auto' && !adBreak && (
            <AutoSlowmoBadge
              text={
                alertGauge !== null
                  ? `자동 슬로모션 · ${GAUGE_LABELS[alertGauge]} 게이지 위험`
                  : '자동 슬로모션 · 큰 사고'
              }
            />
          )}
          {adBreak && <CommercialBreak secondsLeft={controls.adBreakSecondsLeft} />}
        </div>
        {/* 광고 패널은 오른쪽 열의 개입·광고 버튼 위 칸 안에만 놓이고, 넘치면 그 안에서 스크롤한다 */}
        {view !== null && adPanelOpen && (
          <div
            data-testid="ad-panel-cell"
            style={AD_PANEL_CELL}
            className="absolute inset-0 z-10 overflow-y-auto"
          >
            <AdPanel
              benchLeft={view.benchLeft}
              secondsLeft={controls.adPanelSecondsLeft}
              onConfirm={controls.endAd}
              onCancel={controls.cancelAd}
            />
          </div>
        )}
        {/* 판단 카드와 스튜디오의 대상을 잇는 선. 좌표는 컨테이너가 매 프레임 직접 고친다. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <g ref={studio?.linkRef} visibility="hidden">
            <line stroke="#fcd34d" strokeWidth={2} strokeDasharray="6 4" />
            <circle r={7} fill="none" stroke="#fcd34d" strokeWidth={2} />
          </g>
        </svg>
      </div>
    </main>
  )
}

interface TrendPanelProps {
  trend: TrendRecorder
  view: BroadcastView
  /** 처음부터 무대에 선 출연자(대기 출연자는 투입된 뒤에만 선이 생기고 범례에 오른다) */
  startingIds: readonly string[]
  colors: Record<string, string>
  names: Record<string, string>
  show: ShowDef
}

/** 왼쪽 칸 위의 터짐 추세 그래프. 창은 지금부터 TREND_WINDOW_BODY_SECONDS(몸 초) 전까지 */
function TrendPanel({ trend, view, startingIds, colors, names, show }: TrendPanelProps) {
  const windowSteps = Math.round(TREND_WINDOW_BODY_SECONDS / STEP_SECONDS)
  const series = trend
    .window(view.step, windowSteps)
    .filter(
      ({ actorId, points }) =>
        startingIds.includes(actorId) || points.some((point) => point.value !== null),
    )
  return (
    <section
      data-testid="trend-panel"
      className="shrink-0 rounded-xl border-2 border-slate-800 bg-slate-900/60 px-2.5 py-1.5"
    >
      <div className="mb-0.5 text-[11px] font-bold text-slate-500">터지기 직전</div>
      <TrendChart
        series={series}
        colors={colors}
        names={names}
        fromStep={view.step - windowSteps}
        toStep={view.step}
        axis="relative"
        show={show}
      />
    </section>
  )
}

interface BroadcastButtonsProps {
  view: BroadcastView
  controls: StageControls
  onBeginIntervention(): void
}

function BroadcastButtons({ view, controls, onBeginIntervention }: BroadcastButtonsProps) {
  const { interventionOpen, adBreak, adPanelOpen } = controls
  return (
    <div className="flex gap-2">
      <button
        type="button"
        data-testid="intervene-button"
        aria-pressed={interventionOpen}
        disabled={adBreak || adPanelOpen}
        onClick={() => (interventionOpen ? controls.closeIntervention() : onBeginIntervention())}
        className="flex h-16 flex-1 flex-col items-center justify-center rounded-xl border-2 border-red-300 bg-red-600 font-black shadow-[0_4px_0_#7f1d1d] hover:bg-red-500 active:translate-y-1 active:shadow-none disabled:opacity-40"
      >
        <span className="text-lg">{interventionOpen ? '개입 닫기' : '개입'}</span>
        <kbd className="text-[11px] font-normal opacity-80">Space</kbd>
      </button>
      <button
        type="button"
        data-testid="ad-button"
        data-ads-left={view.adsLeft}
        disabled={view.adsLeft === 0 || adBreak || adPanelOpen}
        onClick={controls.startAd}
        className="flex h-16 flex-1 flex-col items-center justify-center rounded-xl border-2 border-amber-200 bg-amber-400 font-black text-slate-950 shadow-[0_4px_0_#92400e] hover:bg-amber-300 active:translate-y-1 active:shadow-none disabled:opacity-40"
      >
        <span className="text-lg">광고</span>
        <span className="text-[11px] font-bold">남은 {view.adsLeft}회</span>
      </button>
    </div>
  )
}

/** 개입 중 스튜디오 위: 느려진 배율과 남은 선택 시간을 크게(spec 8.2) */
interface InterventionBadgeProps {
  secondsLeft: number
  /** 남은 시간 안에 할 일(개입 중 "안에 지시", 개입에서 연 광고 패널이면 "안에 광고 효과 선택") */
  purpose: string
}

function InterventionBadge({ secondsLeft, purpose }: InterventionBadgeProps) {
  return (
    <div
      data-testid="slowmo-badge"
      className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-full border-[3px] border-amber-300 bg-slate-950/85 py-1 pl-1.5 pr-5"
    >
      <span className="rounded-full bg-red-600 px-3 py-1 text-lg font-black">
        SLOW ×1/{Math.round(1 / INTERVENTION_SPEED)}
      </span>
      <span
        data-testid="intervention-seconds"
        className="text-3xl font-black tabular-nums text-amber-300"
      >
        {secondsLeft.toFixed(1)}초
      </span>
      <span className="text-xs text-slate-300">{purpose}</span>
    </div>
  )
}

function AutoSlowmoBadge({ text }: { text: string }) {
  return (
    <div
      data-testid="slowmo-badge"
      className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border-2 border-red-400 bg-slate-950/85 px-4 py-1 text-sm font-bold text-red-200"
    >
      {text}
    </div>
  )
}

function CommercialBreak({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div
      data-testid="commercial-break"
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90"
    >
      <div className="rotate-[-4deg] rounded border-4 border-amber-400 px-8 py-4 text-5xl font-black tracking-widest text-amber-300">
        광고 중
      </div>
      <div className="tabular-nums text-slate-300">
        {Math.ceil(secondsLeft)}초 뒤 방송으로 돌아갑니다
      </div>
    </div>
  )
}
