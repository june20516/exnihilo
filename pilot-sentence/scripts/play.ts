/**
 * 텍스트 플레이: npm run play -- <명령>. 상태는 .play/state.json에 저장해 명령 사이에 이어진다(런 spec §8).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BALANCE } from '@/game/content/balance'
import { migrateRunState, parseCommand, runCommand } from '@/game/play/textPlay'
import type { RunState } from '@/game/run/run'

const STATE_PATH = fileURLToPath(new URL('../.play/state.json', import.meta.url))

function load(): RunState | null {
  if (!existsSync(STATE_PATH)) return null
  const state = migrateRunState(JSON.parse(readFileSync(STATE_PATH, 'utf8')))
  if (!state) throw new Error(`${STATE_PATH}가 런 상태가 아닙니다. new로 다시 시작하세요.`)
  return state
}

const command = parseCommand(process.argv.slice(2))
if ('error' in command) {
  console.log(command.error)
  process.exitCode = 1
} else {
  const result = runCommand(command.type === 'new' ? null : load(), command, BALANCE)
  if (result.state) {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(result.state))
  }
  console.log(result.output)
}
