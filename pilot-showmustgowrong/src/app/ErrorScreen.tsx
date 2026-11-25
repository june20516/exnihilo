export type BroadcastErrorKind = 'create' | 'runtime'

const TITLES: Record<BroadcastErrorKind, string> = {
  create: '방송을 시작할 수 없습니다',
  runtime: '방송 중 오류가 났습니다',
}

interface ErrorScreenProps {
  /** create: 방송·렌더러 생성 실패(wasm 로드, 콘텐츠 검증). runtime: 방송 도중 예외. */
  kind: BroadcastErrorKind
  message: string
}

/** spec 9.6: 오류 메시지와 새로고침 안내 */
export function ErrorScreen({ kind, message }: ErrorScreenProps) {
  return (
    <main
      data-testid="error-screen"
      className="flex h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-neutral-950 p-8 text-white"
    >
      <h1 className="text-2xl font-bold text-red-400">{TITLES[kind]}</h1>
      <pre className="max-h-[400px] max-w-[900px] overflow-hidden whitespace-pre-wrap text-sm text-neutral-300">
        {message}
      </pre>
      <p>새로고침해 주세요.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded bg-neutral-700 px-4 py-2 hover:bg-neutral-600"
      >
        새로고침
      </button>
    </main>
  )
}
