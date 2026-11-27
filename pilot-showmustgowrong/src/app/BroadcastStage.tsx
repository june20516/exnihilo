import { useMemo, useState, type MouseEvent, type PointerEvent, type Ref } from 'react'
import { INTERVENTION_SPEED, STEP_SECONDS, TREND_WINDOW_BODY_SECONDS } from '@/content/balance'
import type { PerformerDef, ShowDef } from '@/content/types'
import type { BroadcastInput, BroadcastSetup, BroadcastView } from '@/sim/engine'
import { ActorCardLayer, type ActorCardAnchor } from './ActorCardLayer'
import { AdPanel } from './AdPanel'
import { HoverTip } from './HoverTip'
import { sourceName, type HoverTipState } from './hoverTipContent'
import { EventLog, TOP_BAND_HEIGHT, TopBand } from './Hud'
import { InterventionPanel } from './InterventionPanel'
import type { InterventionTarget } from './interventionTargets'
import { GAUGE_LABELS } from './labels'
import { sortPeopleLongestFirst, type LogPerson } from './logSegments'
import { LAYOUT_GRIDS, layoutStorage, loadLayout, nextLayout, saveLayout, type LayoutMode } from './layout'
import { OnAirColumn } from './OnAirColumn'
import { performerPalette, type PerformerPalette } from './performerPalette'
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
  /** 정보 카드를 띄울 출연자와 자리. 없으면 카드도, 나머지 화면을 흐리게 하는 덮개도 없다 */
  actorCard: ActorCardAnchor | null
  onSelectTarget(target: InterventionTarget): void
  onDirect(input: BroadcastInput): void
  onBeginIntervention(): void
  /**
   * 배치가 바뀐 뒤(L 키·배치 버튼). 정보 카드와 호버 설명의 자리는 띄운 순간의 스튜디오 크기로 굳으므로
   * 컨테이너가 이때 카드를 닫는다.
   */
  onLayoutChanged(mode: LayoutMode): void
  studio?: StudioBindings
}

/** 개입 중 판단 카드 밖(위 띠와 오른쪽 열)을 흐리게 하는 필터 */
const DIM_STYLE = { filter: 'brightness(0.6) saturate(0.6)' } as const

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
  actorCard,
  onSelectTarget,
  onDirect,
  onBeginIntervention,
  onLayoutChanged,
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
      sortPeopleLongestFirst(
        [...performers.values()].flatMap((performer) => [
          { name: performer.name, color: performer.color },
          { name: performer.shortName, color: performer.color },
        ]),
      ),
    [performers],
  )
  const palette = useMemo(() => performerPalette(performers.values()), [performers])
  const [layoutStore] = useState(layoutStorage)
  const [layout, setLayout] = useState<LayoutMode>(() => loadLayout(layoutStore))
  /** 사용자가 배치를 바꿀 때만 저장한다(열 때는 저장소를 건드리지 않는다) */
  const changeLayout = (mode: LayoutMode): void => {
    setLayout(mode)
    saveLayout(layoutStore, mode)
    onLayoutChanged(mode)
  }
  useLayoutHotkey(() => changeLayout(nextLayout(layout)))
  const grid = LAYOUT_GRIDS[layout]
  const cardActor = actorCard === null ? undefined : view?.actors.find((actor) => actor.id === actorCard.actorId)
  const cardPerformer = actorCard === null ? undefined : performers.get(actorCard.actorId)
  const cardShown = actorCard !== null && cardActor !== undefined && cardPerformer !== undefined
  const highlightedEventId = slowmo === 'auto' ? (view?.autoSlowmo?.eventId ?? null) : null
  const alertGauge = slowmo === 'auto' ? (view?.autoSlowmo?.gauge ?? null) : null

  return (
    <main
      data-layout={layout}
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b1120] text-white"
    >
      {view !== null ? (
        <div className="shrink-0" style={interventionOpen ? DIM_STYLE : undefined}>
          <TopBand
            view={view}
            show={show}
            alertGauge={alertGauge}
            layout={layout}
            onLayoutChange={changeLayout}
          />
        </div>
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
        {/* 카드가 떠 있는 동안 스튜디오 패널(z-13) 밖을 살짝 흐리게 한다. 클릭은 막지 않는다 */}
        {cardShown && (
          <div
            data-testid="card-dim"
            className="pointer-events-none fixed inset-0 z-[12] bg-black/30"
          />
        )}
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
                <TrendPanel trend={trend} view={view} palette={palette} show={show} />
                <EventLog
                  log={view.log}
                  highlightedEventId={highlightedEventId}
                  show={show}
                  people={logPeople}
                  actorColors={palette.colors}
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
          } ${cardShown ? 'z-[13]' : ''}`}
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
          {cardShown && (
            <ActorCardLayer
              anchor={actorCard}
              actor={cardActor}
              performer={cardPerformer}
              nameOf={(id) => sourceName(id, { ...setup, show })}
            />
          )}
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
            dimStyle={interventionOpen ? DIM_STYLE : undefined}
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
            <InterventionBadge secondsLeft={controls.interventionSecondsLeft} />
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
  palette: PerformerPalette
  show: ShowDef
}

/**
 * 왼쪽 칸 위의 터짐 추세 그래프. 창은 지금부터 TREND_WINDOW_BODY_SECONDS(몸 초) 전까지.
 * 값 없는 출연자(투입 전 대기 출연자 등)를 범례에서 빼는 규칙은 TrendChart가 맡는다.
 */
function TrendPanel({ trend, view, palette, show }: TrendPanelProps) {
  const windowSteps = Math.round(TREND_WINDOW_BODY_SECONDS / STEP_SECONDS)
  return (
    <section
      data-testid="trend-panel"
      className="shrink-0 rounded-xl border-2 border-slate-800 bg-slate-900/60 px-2.5 py-1.5"
    >
      <div className="mb-0.5 text-[11px] font-bold text-slate-500">터지기 직전</div>
      <TrendChart
        series={trend.window(view.step, windowSteps)}
        colors={palette.colors}
        names={palette.names}
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
        <kbd className="text-[11px] font-normal opacity-80">{interventionOpen ? 'Esc' : 'Space'}</kbd>
      </button>
      <button
        type="button"
        data-testid="ad-button"
        data-ads-left={view.adsLeft}
        disabled={view.adsLeft === 0 || adBreak || adPanelOpen || interventionOpen}
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
function InterventionBadge({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div
      data-testid="slowmo-badge"
      className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border-[3px] border-amber-300 bg-slate-950/85 py-1 pl-1.5 pr-5"
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
      <span className="text-xs text-slate-300">안에 지시</span>
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
