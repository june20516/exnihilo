/**
 * 캐릭터 시트 자르기용 순수 이미지 함수(Plan B2 spec 3.1).
 * 흰 배경 지우기 -> 연결 요소 찾기 -> 요소별 자르기와 크기 맞춤 순서로 쓴다. 파일 입출력은 cut-sprites.ts가 맡는다.
 */
import { PNG } from 'pngjs'

/** 흰 배경으로 보는 RGB 하한(모든 채널이 이 값 이상이면 배경 후보). */
export const BACKGROUND_THRESHOLD = 232
/** 흰 테두리 자체 검사에서 "연한 색"으로 세는 RGB 하한. flood 임계값(232)보다 낮춰 남은 밝은 헤일로까지 잡는다. */
export const FRINGE_LIGHT_THRESHOLD = 200

/** 흰 테두리 검사에서 세는 최소 알파. 눈에 보이는 밝은 띠만 세려고 반투명(거의 안 보이는) 픽셀은 뺀다. */
export const FRINGE_MIN_ALPHA = 128

/** 경계 정리를 거듭하는 최대 겹 수. */
export const DEFRINGE_MAX_PASSES = 2
/** 경계 정리로 알파가 이 값 미만이 되면 사실상 안 보이므로 0(투명)으로 만들어 다음 겹이 안쪽을 보게 한다. */
const DEFRINGE_CLEAR_ALPHA = 8

export const PERFORMER_IDS = ['rex', 'priya', 'okafor', 'mo', 'june'] as const
export type PerformerId = (typeof PERFORMER_IDS)[number]

/** 출연자별 idle 높이(px). 같은 출연자의 다른 포즈는 idle 배율을 그대로 쓴다. */
export const IDLE_HEIGHT: Record<PerformerId, number> = { rex: 256, priya: 256, okafor: 256, mo: 268, june: 205 }

/** 가장 큰 요소 면적 대비 이 비율 미만인 조각은 먼지로 보고 버린다. */
export const MIN_AREA_RATIO = 0.02

/** 연결 요소의 경계 상자. pixels는 요소에 속한 픽셀 번호(y * 너비 + x)다. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly area: number
  readonly pixels: Int32Array
}

const NEIGHBORS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const NEIGHBORS_8: ReadonlyArray<readonly [number, number]> = [
  ...NEIGHBORS_4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

function isNearWhite(img: PNG, pixel: number, threshold: number): boolean {
  const i = pixel * 4
  return img.data[i] >= threshold && img.data[i + 1] >= threshold && img.data[i + 2] >= threshold
}

/** 이미지 가장자리와 이어진 흰 영역만 투명으로 만든 새 이미지를 돌려준다. 인물 안쪽의 흰색은 남는다. */
export function floodClearBackground(img: PNG, threshold: number = BACKGROUND_THRESHOLD): PNG {
  const { width, height } = img
  const out = new PNG({ width, height })
  img.data.copy(out.data)

  const visited = new Uint8Array(width * height)
  const stack: number[] = []
  const seed = (x: number, y: number): void => {
    const pixel = y * width + x
    if (!visited[pixel] && isNearWhite(img, pixel, threshold)) {
      visited[pixel] = 1
      stack.push(pixel)
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x, 0)
    seed(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    seed(0, y)
    seed(width - 1, y)
  }

  while (stack.length > 0) {
    const pixel = stack.pop()!
    out.data[pixel * 4 + 3] = 0
    const x = pixel % width
    const y = (pixel - x) / width
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      seed(nx, ny)
    }
  }
  return out
}

/**
 * flood fill 뒤에 남은 연회색 안티앨리어싱 띠를 지운다. 투명(알파 0)과 4방향으로 맞닿은 픽셀 중
 * min(R,G,B) >= threshold인 것의 알파를 (255 - min) / (255 - threshold) 배로 줄인다(거의 흰색은 거의 투명, 임계값 근처는 거의 유지).
 * 줄어서 투명해진 픽셀의 안쪽 이웃은 다음 겹의 대상이 된다. 한 픽셀은 한 번만 줄이고, 최대 maxPasses겹까지 한다.
 * 이미지 밖은 투명으로 보지 않는다(시트 가장자리는 이미 flood가 비웠다). 윤곽선 안쪽에 갇힌 흰 영역은 투명과 닿지 않아 그대로다.
 */
export function defringeLightEdge(
  img: PNG,
  maxPasses: number = DEFRINGE_MAX_PASSES,
  threshold: number = FRINGE_LIGHT_THRESHOLD,
): PNG {
  const { width, height } = img
  const out = new PNG({ width, height })
  img.data.copy(out.data)
  const processed = new Uint8Array(width * height)
  const isClear = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && out.data[(y * width + x) * 4 + 3] === 0

  for (let pass = 0; pass < maxPasses; pass++) {
    // 이번 겹의 대상은 겹이 시작할 때의 투명 상태로 정한다(같은 겹 안에서 연쇄로 깎지 않는다).
    const targets: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        if (processed[pixel] || out.data[pixel * 4 + 3] === 0) continue
        if (!NEIGHBORS_4.some(([dx, dy]) => isClear(x + dx, y + dy))) continue
        const i = pixel * 4
        if (Math.min(out.data[i], out.data[i + 1], out.data[i + 2]) >= threshold) targets.push(pixel)
      }
    }
    if (targets.length === 0) break
    for (const pixel of targets) {
      const i = pixel * 4
      const lightest = Math.min(out.data[i], out.data[i + 1], out.data[i + 2])
      const reduced = Math.round((out.data[i + 3] * (255 - lightest)) / (255 - threshold))
      out.data[i + 3] = reduced < DEFRINGE_CLEAR_ALPHA ? 0 : reduced
      processed[pixel] = 1
    }
  }
  return out
}

/**
 * 알파가 0보다 큰 픽셀의 8방향 연결 요소를 찾아 행 우선(위에서 아래, 같은 줄은 왼쪽에서 오른쪽) 순서로 돌려준다.
 * 가장 큰 요소 면적의 minAreaRatio 미만인 조각은 버린다.
 */
export function findComponents(img: PNG, minAreaRatio: number = MIN_AREA_RATIO): Box[] {
  const { width, height } = img
  const visited = new Uint8Array(width * height)
  const found: Box[] = []

  for (let start = 0; start < width * height; start++) {
    if (visited[start] || img.data[start * 4 + 3] === 0) continue

    const members: number[] = []
    const stack = [start]
    visited[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    while (stack.length > 0) {
      const pixel = stack.pop()!
      members.push(pixel)
      const x = pixel % width
      const y = (pixel - x) / width
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (visited[next] || img.data[next * 4 + 3] === 0) continue
        visited[next] = 1
        stack.push(next)
      }
    }
    found.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area: members.length,
      pixels: Int32Array.from(members),
    })
  }

  const largest = found.reduce((max, box) => Math.max(max, box.area), 0)
  const kept = found.filter((box) => box.area >= largest * minAreaRatio)
  return sortRowMajor(kept)
}

/** 세로 중심이 같은 줄 안에 드는 상자끼리 묶어 줄은 위에서 아래, 줄 안은 왼쪽에서 오른쪽으로 정렬한다. */
function sortRowMajor(boxes: Box[]): Box[] {
  const centerY = (box: Box): number => box.y + box.height / 2
  const byCenter = [...boxes].sort((a, b) => centerY(a) - centerY(b))
  const rows: Box[][] = []
  let rowBottom = -Infinity
  for (const box of byCenter) {
    if (rows.length === 0 || centerY(box) > rowBottom) {
      rows.push([box])
      rowBottom = box.y + box.height
    } else {
      rows[rows.length - 1].push(box)
    }
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x))
}

/** 기준 포즈(idle) 상자 높이를 targetHeight로 맞추는 배율. 같은 출연자의 모든 포즈가 이 배율을 같이 쓴다. */
export function scaleForTargetHeight(idle: Box, targetHeight: number): number {
  return targetHeight / idle.height
}

/**
 * 한 포즈를 오린다. fitWidthPx가 있으면 idle 배율 대신 출력 폭을 그 값에 맞춘다.
 * 원본 시트의 인물 크기가 다른 시트와 달라 idle 배율이 맞지 않는 포즈(준 fallen)에만 쓴다.
 */
export function cutPose(img: PNG, box: Box, idleScale: number, fitWidthPx?: number): PNG {
  const scale = fitWidthPx === undefined ? idleScale : fitWidthPx / box.width
  return cropScaled(img, box, scale)
}

/** 요소에 속한 픽셀만 상자 크기로 오려 낸다(상자 안에 걸친 다른 조각은 투명). */
function extractComponent(img: PNG, box: Box): PNG {
  const out = new PNG({ width: box.width, height: box.height })
  for (const pixel of box.pixels) {
    const x = pixel % img.width
    const y = (pixel - x) / img.width
    const from = pixel * 4
    const to = ((y - box.y) * box.width + (x - box.x)) * 4
    out.data[to] = img.data[from]
    out.data[to + 1] = img.data[from + 1]
    out.data[to + 2] = img.data[from + 2]
    out.data[to + 3] = img.data[from + 3]
  }
  return out
}

/** 알파 가중(premultiplied) 면적 평균으로 크기를 바꾼다. 줄일 때도 늘릴 때도 같은 식이다. */
function resizeArea(img: PNG, scale: number): PNG {
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const out = new PNG({ width, height })
  const stepX = img.width / width
  const stepY = img.height / height

  for (let oy = 0; oy < height; oy++) {
    const y0 = oy * stepY
    const y1 = y0 + stepY
    for (let ox = 0; ox < width; ox++) {
      const x0 = ox * stepX
      const x1 = x0 + stepX
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let weightSum = 0
      for (let sy = Math.floor(y0); sy < Math.min(img.height, Math.ceil(y1)); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0)
        for (let sx = Math.floor(x0); sx < Math.min(img.width, Math.ceil(x1)); sx++) {
          const weight = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0))
          const i = (sy * img.width + sx) * 4
          const alpha = img.data[i + 3] / 255
          r += img.data[i] * alpha * weight
          g += img.data[i + 1] * alpha * weight
          b += img.data[i + 2] * alpha * weight
          a += alpha * weight
          weightSum += weight
        }
      }
      const o = (oy * width + ox) * 4
      if (a > 0) {
        out.data[o] = Math.round(r / a)
        out.data[o + 1] = Math.round(g / a)
        out.data[o + 2] = Math.round(b / a)
      }
      out.data[o + 3] = Math.round((a / weightSum) * 255)
    }
  }
  return out
}

function alphaOrZero(img: PNG, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0
  return img.data[(y * img.width + x) * 4 + 3]
}

/**
 * 투명(이미지 밖 포함)과 맞닿은 불투명 픽셀의 알파를 3x3 이웃 평균으로 낮춰 계단 가장자리를 부드럽게 한다.
 * 이미지 밖은 투명으로 본다: 꼭 맞게 오린 그림의 바깥 가장자리 픽셀도 경계로 취급해 알파를 낮춘다.
 */
function blendEdge(img: PNG): PNG {
  const out = new PNG({ width: img.width, height: img.height })
  img.data.copy(out.data)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const alpha = alphaOrZero(img, x, y)
      if (alpha === 0) continue
      const touchesClear = NEIGHBORS_4.some(([dx, dy]) => alphaOrZero(img, x + dx, y + dy) === 0)
      if (!touchesClear) continue
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) sum += alphaOrZero(img, x + dx, y + dy)
      }
      out.data[(y * img.width + x) * 4 + 3] = Math.min(alpha, Math.round(sum / 9))
    }
  }
  return out
}

/** 요소 하나를 오려 배율대로 바꾸고 경계 1px을 블렌딩한 PNG를 돌려준다. */
export function cropScaled(img: PNG, box: Box, scale: number): PNG {
  return blendEdge(resizeArea(extractComponent(img, box), scale))
}

/**
 * 흰 테두리 자체 검사. 투명(알파 0)과 4방향으로 맞닿은 경계 픽셀 중 RGB가 모두 임계값 이상(연한 색)이고
 * 알파가 minAlpha 이상(눈에 보임)인 픽셀의 비율을 경계 픽셀 전체 대비로 돌려준다.
 * 배경 제거 임계값(232)과 따로 FRINGE_LIGHT_THRESHOLD(200)를 기본으로 써서 자기참조 검사가 되지 않게 한다.
 */
export function whiteFringeRatio(
  img: PNG,
  threshold: number = FRINGE_LIGHT_THRESHOLD,
  minAlpha: number = FRINGE_MIN_ALPHA,
): number {
  let edge = 0
  let white = 0
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (alphaOrZero(img, x, y) === 0) continue
      if (!NEIGHBORS_4.some(([dx, dy]) => alphaOrZero(img, x + dx, y + dy) === 0)) continue
      edge++
      if (alphaOrZero(img, x, y) >= minAlpha && isNearWhite(img, y * img.width + x, threshold)) white++
    }
  }
  return edge === 0 ? 0 : white / edge
}
