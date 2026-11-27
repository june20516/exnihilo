import { TOLERANCE_COUNT } from '@/content/balance'
import { COMMON_EMOTIONS, type PerformerDef } from '@/content/types'
import { emotionStyle } from '@/render/emotionBadge'
import { performerArtUrl } from '@/render/performerArt'
import type { ActorView } from '@/sim/engineTypes'
import type { EmotionView } from '@/sim/life'
import { topReasons } from './emotionDisplay'

/** 정보 카드 폭(px). 자리는 호출자가 placeCard로 정한다 */
export const ACTOR_CARD_WIDTH = 300

interface ActorInfoCardProps {
  actor: ActorView
  performer: PerformerDef
  /** 이유 문구 속 사건 주체 id를 화면 이름으로 바꾼다 */
  nameOf: (id: string) => string
}

function isCommon(emotion: EmotionView): boolean {
  return (COMMON_EMOTIONS as readonly string[]).includes(emotion.id)
}

/** 감정 막대 하나: 값만큼 칠하고 1·2단계 문턱에 눈금을 긋는다. 2단계를 넘으면 빛난다 */
function EmotionBar({ emotion, personal }: { emotion: EmotionView; personal: boolean }) {
  const { color } = emotionStyle(emotion.id)
  const glow = emotion.stage >= 2
  const fill = Math.max(0, Math.min(100, emotion.value))
  return (
    <div
      data-testid={`emotion-bar-${emotion.id}`}
      data-emotion={emotion.id}
      data-glow={glow}
      className="flex items-center gap-1.5 text-[11px]"
    >
      <span className="w-[62px] shrink-0 truncate text-slate-300">{emotion.name}</span>
      <div
        className="relative h-2 flex-1 rounded-full bg-slate-800"
        style={glow ? { boxShadow: `0 0 6px 1px ${color}` } : undefined}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${fill}%`, backgroundColor: color }}
        />
        {emotion.rise.map((threshold) => (
          <span
            key={threshold}
            data-testid="threshold-tick"
            className="absolute -top-0.5 h-3 w-px bg-slate-200/80"
            style={{ left: `${threshold}%` }}
          />
        ))}
      </div>
      <span className="w-[30px] shrink-0 text-right tabular-nums text-slate-400">
        {Math.round(emotion.value)}
      </span>
      <span className="w-[26px] shrink-0 text-[10px] text-slate-500">{personal ? '개인' : ''}</span>
    </div>
  )
}

/**
 * 출연자 정보 카드(spec Plan B2 6절). 머리(작은 얼굴·이름·역할·대표 감정과 단계·내성 점), 감정 막대,
 * 왜 저러나, 이어받기. 이탈했거나 감정이 없으면 이름·역할·성향 한 줄만 보인다.
 */
export function ActorInfoCard({ actor, performer, nameOf }: ActorInfoCardProps) {
  const hasMind = !actor.walkedOut && actor.emotions.length > 0
  const common = actor.emotions.filter(isCommon)
  const personal = actor.emotions.filter((emotion) => !isCommon(emotion))
  const leading = actor.emotions.find((emotion) => emotion.id === actor.mood?.emotion)
  const reasons = leading === undefined ? [] : topReasons(leading, nameOf)
  const toleranceTotal = TOLERANCE_COUNT[performer.tolerance]
  const moodText =
    actor.mood === null
      ? null
      : actor.mood.stageName === null
        ? actor.mood.name
        : `${actor.mood.name} · ${actor.mood.stageName}`

  return (
    <section
      data-testid="actor-card"
      className="flex w-[300px] flex-col gap-2 rounded-xl border-[3px] bg-slate-950/95 p-2.5 text-xs shadow-[4px_4px_0_#000]"
      style={{ borderColor: performer.color }}
    >
      <header className="flex items-center gap-2">
        <img
          src={performerArtUrl(performer.id, 'idle')}
          alt=""
          className="h-11 w-11 shrink-0 rounded-full border-2 bg-slate-800 object-cover object-top"
          style={{ borderColor: performer.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-black text-slate-50">{performer.name}</span>
            <span
              className="shrink-0 rounded px-1 text-[11px] font-black text-slate-950"
              style={{ backgroundColor: performer.color }}
            >
              {performer.role}
            </span>
          </div>
          {hasMind && moodText !== null && (
            <div data-testid="card-mood" className="truncate text-[11px] text-slate-300">
              {moodText}
            </div>
          )}
        </div>
        {hasMind && (
          <div
            data-testid="card-tolerance"
            className="flex shrink-0 flex-col items-end gap-0.5"
          >
            <span className="sr-only">남은 내성 {actor.directivesLeft}</span>
            <span className="text-[10px] text-slate-400">내성</span>
            <span className="flex gap-0.5">
              {Array.from({ length: toleranceTotal }, (_, index) =>
                index < actor.directivesLeft ? (
                  <span
                    key={index}
                    data-testid="tolerance-dot-filled"
                    className="h-1.5 w-1.5 rounded-full bg-amber-300"
                  />
                ) : (
                  <span key={index} className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                ),
              )}
            </span>
          </div>
        )}
      </header>
      {hasMind ? (
        <>
          <div className="flex flex-col gap-1">
            {common.map((emotion) => (
              <EmotionBar key={emotion.id} emotion={emotion} personal={false} />
            ))}
            {personal.length > 0 && (
              <>
                <hr data-testid="personal-divider" className="my-0.5 border-slate-700" />
                {personal.map((emotion) => (
                  <EmotionBar key={emotion.id} emotion={emotion} personal />
                ))}
              </>
            )}
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-slate-900 px-2 py-1.5">
            <div className="text-[11px] font-bold text-slate-400">왜 저러나</div>
            {reasons.length === 0 ? (
              <div className="text-slate-500">아직 이유 없음</div>
            ) : (
              reasons.map((reason, index) => (
                <div
                  key={`${index}:${reason.text}`}
                  data-testid="card-reason"
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-slate-200">{reason.text}</span>
                  <span className="shrink-0 tabular-nums text-amber-300">+{reason.amount}</span>
                </div>
              ))
            )}
          </div>
          {actor.takeover !== null && (
            <div data-testid="card-takeover" className="truncate text-[11px] text-sky-300">
              ↪ 이어받는 중 · {actor.takeover.text}에 이어 ·{' '}
              {Math.ceil(actor.takeover.remainingBodySeconds)}초
            </div>
          )}
        </>
      ) : (
        <p className="leading-4 text-slate-300">{performer.tendency}</p>
      )}
    </section>
  )
}
