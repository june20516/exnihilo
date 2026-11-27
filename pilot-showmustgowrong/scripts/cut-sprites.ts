/**
 * 캐릭터 시트에서 포즈별 그림을 잘라 내는 도구(Plan B2 spec 3.1).
 *
 * - `npm run sprites -- components`: art-source/sheets/*.png의 흰 배경을 지우고 연결 요소마다 번호를 매겨
 *   art-source/components/<시트>/<번호>.png 와 번호 대조 이미지(_overview.png)를 낸다. 사람이 대조 이미지를 보고
 *   art-source/poses/<출연자>.json 에 포즈별 요소 번호를 적는다.
 * - `npm run sprites -- build`: 포즈 매핑대로 src/assets/performers/<출연자>/<포즈>.png 30장과
 *   art-source/contact-sheet.png(출연자 5행 x 포즈 6열 + 쓰지 않은 요소)를 낸다.
 *   각 장의 흰 테두리 자체 검사 비율을 출력하고, 1% 이상이면 종료 코드 1로 끝난다.
 *
 * 요소 번호는 1부터, 시트 안 행 우선(위에서 아래, 왼쪽에서 오른쪽) 순서다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import {
  cropScaled,
  findComponents,
  floodClearBackground,
  scaleForTargetHeight,
  whiteFringeRatio,
  type Box,
} from './spriteCut'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHEETS_DIR = join(ROOT, 'art-source/sheets')
const COMPONENTS_DIR = join(ROOT, 'art-source/components')
const POSES_DIR = join(ROOT, 'art-source/poses')
const OUTPUT_DIR = join(ROOT, 'src/assets/performers')
const CONTACT_SHEET_PATH = join(ROOT, 'art-source/contact-sheet.png')

const PERFORMER_IDS = ['rex', 'priya', 'okafor', 'mo', 'june'] as const
type PerformerId = (typeof PERFORMER_IDS)[number]

const POSES = ['idle', 'laugh', 'angry', 'panic', 'flying', 'fallen'] as const
type Pose = (typeof POSES)[number]

/** 시트 파일 이름(확장자 제외). 준의 쓰러짐 전용 시트가 따로 있다. */
const SHEET_IDS = [...PERFORMER_IDS, 'june-fallen'] as const
type SheetId = (typeof SHEET_IDS)[number]

/** 출연자별 idle 높이(px). 같은 출연자의 다른 포즈는 idle 배율을 그대로 쓴다. */
const IDLE_HEIGHT: Record<PerformerId, number> = { rex: 256, priya: 256, okafor: 256, mo: 268, june: 205 }

/**
 * 포즈 매핑 값: 같은 이름 시트의 요소 번호, 또는 다른 시트의 요소.
 * 다른 시트는 그려진 크기가 달라 idle 배율이 맞지 않으므로, fitWidthTo(같은 이름 시트의 요소 번호)를 주면
 * 그 요소를 idle 배율로 줄였을 때의 폭에 맞춘다.
 */
type PoseRef =
  | number
  | { readonly sheet: SheetId; readonly component: number; readonly fitWidthTo?: number }
type PoseMap = Record<Pose, PoseRef>

/** 다른 시트의 쓰지 않은 요소는 크기 기준이 없어 대조 시트에 작게만 보인다. */
const UNUSED_OTHER_SHEET_SCALE = 0.25
const FRINGE_LIMIT = 0.01
const CONTACT_BACKGROUND = [58, 62, 74] as const
const CELL_PADDING = 12

function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path))
}

function writePng(path: string, img: PNG): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, PNG.sync.write(img))
}

/** 시트를 읽어 흰 배경을 지우고 요소 목록을 돌려준다. */
function loadSheet(sheet: SheetId): { cleared: PNG; boxes: Box[] } {
  const cleared = floodClearBackground(readPng(join(SHEETS_DIR, `${sheet}.png`)))
  return { cleared, boxes: findComponents(cleared) }
}

// ---- 번호 그리기(대조 이미지용 3x5 숫자 글꼴) ----

const DIGIT_GLYPHS: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
}

function paint(img: PNG, x: number, y: number, rgb: readonly [number, number, number]): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
  const i = (y * img.width + x) * 4
  img.data[i] = rgb[0]
  img.data[i + 1] = rgb[1]
  img.data[i + 2] = rgb[2]
  img.data[i + 3] = 255
}

function drawNumber(img: PNG, text: string, left: number, top: number, unit: number): void {
  const RED = [230, 30, 30] as const
  const YELLOW = [255, 235, 60] as const
  // 노란 바탕 위에 빨간 숫자를 그려 어떤 그림 위에서도 읽히게 한다.
  const margin = Math.floor(unit / 2)
  const boxWidth = text.length * 4 * unit + unit
  for (let y = 0; y < 6 * unit; y++) for (let x = 0; x < boxWidth; x++) paint(img, left + x, top + y, YELLOW)
  text.split('').forEach((digit, index) => {
    DIGIT_GLYPHS[digit].forEach((row, gy) => {
      row.split('').forEach((bit, gx) => {
        if (bit !== '1') return
        for (let dy = 0; dy < unit; dy++) {
          for (let dx = 0; dx < unit; dx++) {
            paint(img, left + margin + (index * 4 + gx) * unit + dx, top + margin + gy * unit + dy, RED)
          }
        }
      })
    })
  })
}

function drawRect(img: PNG, box: Box, rgb: readonly [number, number, number]): void {
  for (let x = box.x - 1; x <= box.x + box.width; x++) {
    paint(img, x, box.y - 1, rgb)
    paint(img, x, box.y + box.height, rgb)
  }
  for (let y = box.y - 1; y <= box.y + box.height; y++) {
    paint(img, box.x - 1, y, rgb)
    paint(img, box.x + box.width, y, rgb)
  }
}

/** 어두운 바탕 위에 img를 합성한다(투명도 반영). 흰 테두리가 남았는지 눈으로 보기 쉽다. */
function compositeOver(target: PNG, img: PNG, left: number, top: number): void {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const from = (y * img.width + x) * 4
      const alpha = img.data[from + 3] / 255
      if (alpha === 0) continue
      const tx = left + x
      const ty = top + y
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue
      const to = (ty * target.width + tx) * 4
      for (let c = 0; c < 3; c++) {
        target.data[to + c] = Math.round(img.data[from + c] * alpha + target.data[to + c] * (1 - alpha))
      }
      target.data[to + 3] = 255
    }
  }
}

function solid(width: number, height: number, rgb: readonly [number, number, number]): PNG {
  const img = new PNG({ width, height })
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) paint(img, x, y, rgb)
  return img
}

// ---- components 단계 ----

function runComponents(): void {
  for (const sheet of SHEET_IDS) {
    const { cleared, boxes } = loadSheet(sheet)
    const overview = solid(cleared.width, cleared.height, CONTACT_BACKGROUND)
    compositeOver(overview, cleared, 0, 0)
    boxes.forEach((box, index) => {
      const number = index + 1
      writePng(join(COMPONENTS_DIR, sheet, `${number}.png`), cropScaled(cleared, box, 1))
      drawRect(overview, box, [255, 90, 200])
      drawNumber(overview, String(number), box.x, box.y, 4)
    })
    writePng(join(COMPONENTS_DIR, sheet, '_overview.png'), overview)
    console.log(`${sheet}: 요소 ${boxes.length}개`)
    boxes.forEach((box, index) =>
      console.log(`  ${index + 1}: x${box.x} y${box.y} ${box.width}x${box.height} 면적 ${box.area}`),
    )
  }
}

// ---- build 단계 ----

function isPoseRef(value: unknown): value is PoseRef {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    SHEET_IDS.includes(record.sheet as SheetId) &&
    typeof record.component === 'number' &&
    Number.isInteger(record.component) &&
    record.component >= 1 &&
    (record.fitWidthTo === undefined || (typeof record.fitWidthTo === 'number' && record.fitWidthTo >= 1))
  )
}

function readPoseMap(id: PerformerId): PoseMap {
  const raw: unknown = JSON.parse(readFileSync(join(POSES_DIR, `${id}.json`), 'utf8'))
  if (typeof raw !== 'object' || raw === null) throw new Error(`${id}.json이 객체가 아닙니다`)
  const record = raw as Record<string, unknown>
  const entries = POSES.map((pose): [Pose, PoseRef] => {
    const value = record[pose]
    if (!isPoseRef(value)) throw new Error(`${id}.json의 ${pose} 값이 올바르지 않습니다`)
    return [pose, value]
  })
  return Object.fromEntries(entries) as PoseMap
}

interface BuiltPose {
  readonly pose: Pose
  readonly sheet: SheetId
  readonly component: number
  readonly image: PNG
  readonly fringe: number
}

interface BuiltPerformer {
  readonly id: PerformerId
  readonly scale: number
  readonly poses: BuiltPose[]
  /** 어떤 포즈에도 쓰지 않은 요소(대조 시트에 빨간 틀로 표시). */
  readonly unused: { sheet: SheetId; component: number; image: PNG }[]
}

function buildPerformer(id: PerformerId): BuiltPerformer {
  const map = readPoseMap(id)
  const sheets = new Map<SheetId, ReturnType<typeof loadSheet>>()
  const sheetOf = (sheet: SheetId): ReturnType<typeof loadSheet> => {
    const cached = sheets.get(sheet)
    if (cached) return cached
    const loaded = loadSheet(sheet)
    sheets.set(sheet, loaded)
    return loaded
  }
  const resolve = (ref: PoseRef): { sheet: SheetId; component: number; fitWidthTo?: number } =>
    typeof ref === 'number' ? { sheet: id, component: ref } : ref
  const boxOf = (sheet: SheetId, component: number): Box => {
    const box = sheetOf(sheet).boxes[component - 1]
    if (!box) throw new Error(`${sheet} 시트에 요소 ${component}번이 없습니다`)
    return box
  }

  const idleRef = resolve(map.idle)
  const scale = scaleForTargetHeight(boxOf(idleRef.sheet, idleRef.component), IDLE_HEIGHT[id])

  const poses = POSES.map((pose): BuiltPose => {
    const { sheet, component, fitWidthTo } = resolve(map[pose])
    const box = boxOf(sheet, component)
    // 다른 시트의 요소는 기준 요소의 (idle 배율 적용) 폭에 맞춰 크기를 정한다.
    const poseScale = fitWidthTo === undefined ? scale : (boxOf(id, fitWidthTo).width * scale) / box.width
    const image = cropScaled(sheetOf(sheet).cleared, box, poseScale)
    writePng(join(OUTPUT_DIR, id, `${pose}.png`), image)
    return { pose, sheet, component, image, fringe: whiteFringeRatio(image) }
  })

  const usedKeys = new Set(poses.map((p) => `${p.sheet}#${p.component}`))
  const unused = [...new Set(poses.map((p) => p.sheet))].flatMap((sheet) =>
    sheetOf(sheet).boxes.flatMap((box, index) =>
      usedKeys.has(`${sheet}#${index + 1}`)
        ? []
        : [{ sheet, component: index + 1, image: cropScaled(sheetOf(sheet).cleared, box, sheet === id ? scale : UNUSED_OTHER_SHEET_SCALE) }],
    ),
  )
  return { id, scale, poses, unused }
}

function drawFrame(img: PNG, left: number, top: number, width: number, height: number, rgb: readonly [number, number, number]): void {
  for (let x = left; x < left + width; x++) {
    paint(img, x, top, rgb)
    paint(img, x, top + height - 1, rgb)
  }
  for (let y = top; y < top + height; y++) {
    paint(img, left, y, rgb)
    paint(img, left + width - 1, y, rgb)
  }
}

/** 출연자 행마다 6포즈를 나란히, 오른쪽에 쓰지 않은 요소를 빨간 틀로 붙인 대조 시트를 만든다. */
function renderContactSheet(performers: BuiltPerformer[]): PNG {
  const cell = (images: PNG[]): { width: number; height: number } => ({
    width: Math.max(...images.map((i) => i.width)) + CELL_PADDING * 2,
    height: Math.max(...images.map((i) => i.height)) + CELL_PADDING * 2,
  })
  const all = performers.flatMap((p) => [...p.poses.map((x) => x.image), ...p.unused.map((x) => x.image)])
  const { width: cellWidth, height: cellHeight } = cell(all)
  const columns = Math.max(...performers.map((p) => p.poses.length + p.unused.length))
  const sheet = solid(cellWidth * columns, cellHeight * performers.length, CONTACT_BACKGROUND)

  performers.forEach((performer, row) => {
    const place = (image: PNG, column: number, frame: readonly [number, number, number], label: string): void => {
      const left = column * cellWidth
      const top = row * cellHeight
      compositeOver(sheet, image, left + Math.round((cellWidth - image.width) / 2), top + cellHeight - CELL_PADDING - image.height)
      drawFrame(sheet, left, top, cellWidth, cellHeight, frame)
      drawNumber(sheet, label, left + 4, top + 4, 3)
    }
    performer.poses.forEach((built, column) => place(built.image, column, [120, 120, 130], String(built.component)))
    performer.unused.forEach((extra, index) =>
      place(extra.image, performer.poses.length + index, [255, 60, 60], String(extra.component)),
    )
  })
  return sheet
}

function runBuild(): void {
  const performers = PERFORMER_IDS.map(buildPerformer)
  let failed = false
  for (const performer of performers) {
    console.log(`${performer.id} (배율 ${performer.scale.toFixed(4)})`)
    for (const built of performer.poses) {
      const percent = built.fringe * 100
      const status = built.fringe < FRINGE_LIMIT ? 'ok' : 'FAIL'
      if (built.fringe >= FRINGE_LIMIT) failed = true
      console.log(
        `  ${built.pose.padEnd(6)} ${built.image.width}x${built.image.height}  원본 ${built.sheet}#${built.component}  흰 테두리 ${percent.toFixed(2)}% ${status}`,
      )
    }
    for (const extra of performer.unused) {
      console.log(`  (쓰지 않음) ${extra.sheet}#${extra.component} ${extra.image.width}x${extra.image.height}`)
    }
  }
  writePng(CONTACT_SHEET_PATH, renderContactSheet(performers))
  console.log(`대조 시트: ${CONTACT_SHEET_PATH}`)
  if (failed) {
    console.error(`흰 테두리 비율이 ${FRINGE_LIMIT * 100}% 이상인 장이 있습니다.`)
    process.exit(1)
  }
}

const command = process.argv[2]
if (command === 'components') runComponents()
else if (command === 'build') runBuild()
else {
  console.error('사용법: npm run sprites -- components | build')
  process.exit(2)
}
