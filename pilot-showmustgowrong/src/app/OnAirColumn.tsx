import type { PointerEvent, ReactNode } from 'react'
import type { CameraDef, PerformerDef, ShowDef } from '@/content/types'
import type { BroadcastView } from '@/sim/engine'
import type { CameraAimMode } from '@/sim/engineTypes'
import { CameraFeedCanvas } from './CameraFeedCanvas'
import { SWITCHER_KEYS, cameraName } from './labels'

interface OnAirColumnProps {
  view: BroadcastView
  show: ShowDef
  performers: ReadonlyMap<string, PerformerDef>
  onSwitch(cameraId: string): void
  /** 추적 카메라 화면을 누르면 스튜디오의 출연자에게 끌어 대상을 바꾸기 시작한다. 없으면 끌 수 없다. */
  onAimDragStart?(cameraId: string, event: PointerEvent<HTMLElement>): void
  /** 맨 아래 개입·광고 버튼 */
  actions: ReactNode
  /** 미리보기 3칸 방향. 오른쪽 칸이 넓으면(기본 배치) 가로, 260px로 좁으면 세로 */
  previews: 'row' | 'column'
  /** 송출 화면이 칸 높이를 다 채우는가(송출 화면 크게). 아니면 16:9 */
  monitorFills: boolean
}

/** 조준 상태가 대상 이름 뒤에 붙이는 설명. 대상을 따라가는 중이면 붙이지 않는다. */
const AIM_NOTES: Record<CameraAimMode, string | null> = {
  tracking: null,
  directed: '지시로 고정 (카메라를 출연자에게 끌면 추적)',
  startled: '스태프가 놀라 휘두름',
  fixed: null,
}

/**
 * 추적 카메라면 "대상 렉스", 지시로 고정됐으면 "대상 렉스 · 지시로 고정 (카메라를 출연자에게 끌면 추적)".
 * 대상이 없으면 null.
 */
function trackingTarget(
  view: Pick<BroadcastView, 'cameraTargets' | 'cameraAimModes'>,
  camera: CameraDef,
  performers: ReadonlyMap<string, PerformerDef>,
): string | null {
  const targetId = view.cameraTargets[camera.id] ?? null
  if (targetId === null) return null
  const target = `대상 ${performers.get(targetId)?.shortName ?? targetId}`
  const note = AIM_NOTES[view.cameraAimModes[camera.id] ?? 'fixed']
  return note === null ? target : `${target} · ${note}`
}

/**
 * 송출 쪽 칸들(spec 2절): ON AIR 모니터, 카메라 3대의 미리보기 칸(누르면 그 카메라로 전환), 조작 안내,
 * 개입·광고 버튼. 각 칸은 BroadcastStage grid의 영역(monitor, slots, help, actions)에 놓이고, 배치가
 * 바뀌어도 같은 DOM 노드로 남는다(카메라 화면 캔버스를 다시 만들지 않는다). 미리보기 칸은 송출이나 배치가
 * 바뀌어도 show.cameras 순서(= 숫자 키 순서)로 항상 같은 자리에 있어, 끌기 직후에도 손이 같은 자리로 간다.
 */
export function OnAirColumn({
  view,
  show,
  performers,
  onSwitch,
  onAimDragStart,
  actions,
  previews,
  monitorFills,
}: OnAirColumnProps) {
  /** 추적 카메라면 화면을 눌러 끌기를 시작하는 핸들러. 아니면 undefined */
  const aimHandler = (camera: CameraDef) =>
    camera.tracking === true && onAimDragStart !== undefined
      ? (event: PointerEvent<HTMLElement>) => onAimDragStart(camera.id, event)
      : undefined
  const onAir = show.cameras.find((camera) => camera.id === view.onAirCameraId) ?? show.cameras[0]
  const onAirTarget = trackingTarget(view, onAir, performers)
  const stacked = previews === 'column'
  return (
    <>
      <section
        data-testid="program-monitor"
        data-on-air="true"
        aria-label="송출 중인 카메라"
        onPointerDown={aimHandler(onAir)}
        style={{ gridArea: 'monitor' }}
        className="flex min-h-0 min-w-0 flex-col gap-1.5 rounded-xl border-2 border-red-500 bg-slate-900 p-2 text-left shadow-[0_0_14px_rgba(239,68,68,0.35)]"
      >
        <span className="flex items-center justify-between gap-2">
          <span
            data-testid="on-air-label"
            data-aim-mode={view.cameraAimModes[onAir.id] ?? 'fixed'}
            className="min-w-0 text-sm leading-tight font-bold break-keep text-slate-100"
          >
            {cameraName(show.cameras, onAir)}
            {onAirTarget !== null && ` · ${onAirTarget}`}
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full border-2 border-red-400 bg-red-600 px-2 text-[11px] font-black text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            ON AIR
          </span>
        </span>
        <span
          className={`block w-full overflow-hidden rounded-md border border-slate-700 ${
            monitorFills ? 'min-h-0 flex-1' : 'aspect-video'
          }`}
        >
          <CameraFeedCanvas
            view={view}
            camera={onAir}
            audienceZone={show.audienceZone}
            performers={performers}
          />
        </span>
      </section>
      <div
        data-testid="switcher-slots"
        style={{ gridArea: 'slots' }}
        className={`flex min-w-0 gap-1.5 ${stacked ? 'flex-col' : ''}`}
      >
        {show.cameras.map((camera, index) => {
          const target = trackingTarget(view, camera, performers)
          const isOnAir = camera.id === onAir.id
          return (
            <button
              key={camera.id}
              type="button"
              data-testid={`switcher-slot-${camera.id}`}
              data-slot-index={index}
              data-on-air={isOnAir}
              aria-label={`${cameraName(show.cameras, camera)}${isOnAir ? ' 송출 중' : '로 전환'}`}
              aria-current={isOnAir}
              aria-disabled={isOnAir}
              onClick={isOnAir ? undefined : () => onSwitch(camera.id)}
              onPointerDown={aimHandler(camera)}
              className={`flex min-w-0 flex-1 gap-1 rounded-lg border-2 bg-slate-900 p-0.5 text-left ${
                stacked ? 'flex-row-reverse items-start' : 'flex-col'
              } ${
                isOnAir
                  ? 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.35)]'
                  : 'border-slate-700 hover:border-sky-400 active:translate-y-px'
              }`}
            >
              <span
                data-testid="camera-preview"
                className={`block aspect-video shrink-0 overflow-hidden rounded-md ${
                  stacked ? 'w-[112px]' : 'w-full'
                } ${isOnAir ? '' : 'opacity-90'}`}
              >
                <CameraFeedCanvas
                  view={view}
                  camera={camera}
                  audienceZone={show.audienceZone}
                  performers={performers}
                  compact
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-1 px-0.5 text-[11px] font-bold text-slate-200">
                  <kbd className="rounded bg-slate-950 px-1 text-[10px] text-slate-400">
                    {SWITCHER_KEYS[index]}
                  </kbd>
                  <span className="truncate">{camera.label}</span>
                </span>
                {isOnAir && (
                  <span className="mx-0.5 rounded-full bg-red-600 text-center text-[10px] font-black text-white">
                    ON AIR
                  </span>
                )}
                {target !== null && (
                  <span
                    data-testid="preview-target"
                    data-aim-mode={view.cameraAimModes[camera.id] ?? 'fixed'}
                    className="px-0.5 text-[10px] leading-tight break-keep text-amber-300"
                  >
                    {target}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <p
        style={{ gridArea: 'help' }}
        className="min-h-0 self-end overflow-hidden rounded-lg bg-slate-900/60 px-2 py-1.5 text-[11px] leading-4 text-slate-400"
      >
        아래 카메라 칸을 누르거나 1·2·3: 카메라 전환(칸 자리는 고정)
        <br />
        클로즈업 카메라(노란 고리)나 화면을 출연자에게 끌기: 대상 바꾸기(공짜)
        <br />
        출연자·스태프 클릭: 성향과 스탯 보기
        <br />
        Space: 개입(슬로모션 속 지시)
      </p>
      <div style={{ gridArea: 'actions' }}>{actions}</div>
    </>
  )
}
