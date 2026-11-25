import type { ReactNode } from 'react'
import type { CameraDef, PerformerDef, ShowDef } from '@/content/types'
import type { BroadcastView } from '@/sim/engine'
import { CameraFeedCanvas } from './CameraFeedCanvas'
import { SWITCHER_KEYS } from './labels'

const MONITOR_WIDTH = 276
const MONITOR_HEIGHT = 155
const PREVIEW_WIDTH = 122
const PREVIEW_HEIGHT = 69

interface OnAirColumnProps {
  view: BroadcastView
  show: ShowDef
  performers: ReadonlyMap<string, PerformerDef>
  onSwitch(cameraId: string): void
  /** 맨 아래 개입·광고 버튼 */
  actions: ReactNode
  /** 광고 패널처럼 열 위에 띄우는 것 */
  overlay: ReactNode
}

/** "CAM 2 클로즈업"처럼 스위처 번호와 카메라 이름 */
function cameraName(show: ShowDef, camera: CameraDef): string {
  return `CAM ${show.cameras.indexOf(camera) + 1} ${camera.label}`
}

/** 추적 카메라면 "대상 렉스", 아니면 null */
function trackingTarget(
  view: BroadcastView,
  camera: CameraDef,
  performers: ReadonlyMap<string, PerformerDef>,
): string | null {
  const targetId = view.cameraTargets[camera.id] ?? null
  if (targetId === null) return null
  return `대상 ${performers.get(targetId)?.shortName ?? targetId}`
}

/**
 * 오른쪽 열(spec 8.2 1·2단계): 위에 ON AIR 모니터, 그 아래 송출하지 않는 카메라 2대의 미리보기
 * (누르면 그 카메라로 전환), 맨 아래 개입·광고 버튼.
 */
export function OnAirColumn({
  view,
  show,
  performers,
  onSwitch,
  actions,
  overlay,
}: OnAirColumnProps) {
  const onAir = show.cameras.find((camera) => camera.id === view.onAirCameraId) ?? show.cameras[0]
  const others = show.cameras.filter((camera) => camera !== onAir)
  const onAirTarget = trackingTarget(view, onAir, performers)
  return (
    <aside className="relative flex w-[300px] shrink-0 flex-col gap-2 py-1 pr-3">
      <button
        type="button"
        data-testid={`switcher-${onAir.id}`}
        aria-pressed
        className="flex cursor-default flex-col gap-1.5 rounded-xl border-2 border-red-500 bg-slate-900 p-2 text-left shadow-[0_0_14px_rgba(239,68,68,0.35)]"
      >
        <span className="flex items-center justify-between gap-2">
          <span data-testid="on-air-label" className="truncate text-sm font-bold text-slate-100">
            {cameraName(show, onAir)}
            {onAirTarget !== null && ` · ${onAirTarget}`}
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full border-2 border-red-400 bg-red-600 px-2 text-[11px] font-black text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            ON AIR
          </span>
        </span>
        <span className="overflow-hidden rounded-md border border-slate-700">
          <CameraFeedCanvas
            view={view}
            camera={onAir}
            audienceZone={show.audienceZone}
            width={MONITOR_WIDTH}
            height={MONITOR_HEIGHT}
          />
        </span>
      </button>
      <div className="flex gap-2">
        {others.map((camera) => {
          const target = trackingTarget(view, camera, performers)
          return (
            <button
              key={camera.id}
              type="button"
              data-testid={`switcher-${camera.id}`}
              data-preview
              aria-pressed={false}
              onClick={() => onSwitch(camera.id)}
              className="flex flex-1 flex-col gap-1 rounded-xl border-2 border-slate-700 bg-slate-900 p-1.5 text-left hover:border-sky-400 active:translate-y-px"
            >
              <span data-testid="camera-preview" className="overflow-hidden rounded-md opacity-90">
                <CameraFeedCanvas
                  view={view}
                  camera={camera}
                  audienceZone={show.audienceZone}
                  width={PREVIEW_WIDTH}
                  height={PREVIEW_HEIGHT}
                />
              </span>
              <span className="flex items-center gap-1 text-xs font-bold text-slate-200">
                <kbd className="rounded bg-slate-950 px-1 text-[10px] text-slate-400">
                  {SWITCHER_KEYS[show.cameras.indexOf(camera)]}
                </kbd>
                <span className="truncate">{cameraName(show, camera)}</span>
              </span>
              {target !== null && <span className="text-[11px] text-amber-300">{target}</span>}
            </button>
          )
        })}
      </div>
      <p className="mt-auto rounded-lg bg-slate-900/60 px-2 py-1.5 text-[11px] leading-4 text-slate-400">
        미리보기를 누르거나 1·2·3: 카메라 전환
        <br />
        출연자 클릭: 클로즈업 대상 바꾸기(공짜)
        <br />
        Space: 개입(슬로모션 속 지시)
      </p>
      {actions}
      {overlay}
    </aside>
  )
}
