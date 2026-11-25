import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** 청크 크기 경고 기준(kB). 기본은 Vite와 같은 500이고, 더 나눌 수 없는 청크만 근거와 함께 따로 둔다. */
const DEFAULT_CHUNK_BUDGET_KB = 500
const CHUNK_BUDGETS_KB: Record<string, number> = {
  // rapier2d-deterministic-compat은 물리 wasm을 base64로 JS에 인라인한다(약 3.4MB). 나눌 수 없다.
  rapier: 3600,
  // pixi.js v8 코어 렌더러 한 덩어리(약 570kB). 더 쪼개도 첫 화면에서 모두 필요하다.
  pixi: 650,
}

/**
 * Vite의 chunkSizeWarningLimit은 모든 청크에 같은 한도를 걸기 때문에, 청크 이름별 예산으로 대신 검사한다.
 * 한도를 넘는 청크가 있으면 빌드 경고를 낸다.
 */
function chunkSizeBudget(): Plugin {
  return {
    name: 'chunk-size-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        const sizeKb = Buffer.byteLength(output.code) / 1000
        const budgetKb = CHUNK_BUDGETS_KB[output.name] ?? DEFAULT_CHUNK_BUDGET_KB
        if (sizeKb > budgetKb) {
          this.warn(`청크 ${output.fileName}가 ${sizeKb.toFixed(0)}kB로 예산 ${budgetKb}kB를 넘습니다.`)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), chunkSizeBudget()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // 청크별 예산은 chunkSizeBudget이 검사한다(가장 큰 rapier 예산보다 크게 두어 중복 경고를 끈다).
    chunkSizeWarningLimit: CHUNK_BUDGETS_KB.rapier,
    rolldownOptions: {
      output: {
        // Vite 8(rolldown)에서 manualChunks는 deprecated라 codeSplitting.groups로 라이브러리를 나눈다.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/ },
            { name: 'pixi', test: /node_modules[\\/](pixi\.js|@pixi)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
