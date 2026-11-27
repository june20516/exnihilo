import { Sprite, Texture, TextureSource } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { STUDIO_PLANES, planeMatrix } from './backdrop'
import { fitIso } from './geometry'
import type { StudioPlaneId } from './backdrop'
import { PLANE_ORDER, SIDE_WALL_TINT, StudioBackdrop } from './studioBackdrop'

function texture(width: number, height: number): Texture {
  return new Texture({ source: new TextureSource({ width, height }) })
}

/** 면 id → Sprite. container.children을 그리는 순서(PLANE_ORDER)대로 읽는다 */
function spritesOf(backdrop: StudioBackdrop): Map<StudioPlaneId, Sprite> {
  const sprites = new Map<StudioPlaneId, Sprite>()
  PLANE_ORDER.forEach((id, index) => {
    const child = backdrop.container.children[index]
    if (!(child instanceof Sprite)) throw new Error(`${id} 면이 Sprite가 아닙니다`)
    sprites.set(id, child)
  })
  return sprites
}

function spriteOf(sprites: Map<StudioPlaneId, Sprite>, id: StudioPlaneId): Sprite {
  const sprite = sprites.get(id)
  if (sprite === undefined) throw new Error(`${id} 면이 없습니다`)
  return sprite
}

const TEXTURES = {
  floor: texture(1228, 768),
  backWall: texture(1376, 215),
  sideWall: texture(1376, 344),
}

describe('StudioBackdrop', () => {
  it('면 3개를 Sprite로 만들고 옆벽만 어둡게 물들인다', () => {
    const backdrop = new StudioBackdrop(TEXTURES)
    expect(backdrop.container.children).toHaveLength(PLANE_ORDER.length)
    const sprites = spritesOf(backdrop)
    for (const id of PLANE_ORDER) expect(spriteOf(sprites, id).texture, id).toBe(TEXTURES[id])
    expect(spriteOf(sprites, 'sideWall').tint).toBe(SIDE_WALL_TINT)
    expect(spriteOf(sprites, 'backWall').tint).toBe(0xffffff)
    expect(spriteOf(sprites, 'floor').tint).toBe(0xffffff)
  })

  it('layout을 다시 불러도 Sprite는 그대로이고 행렬만 새 transform에 맞게 바뀐다', () => {
    const backdrop = new StudioBackdrop(TEXTURES)
    const before = spritesOf(backdrop)
    for (const transform of [fitIso(960, 540, 16), fitIso(400, 300, 8)]) {
      backdrop.layout(transform)
      const after = spritesOf(backdrop)
      expect(backdrop.container.children).toHaveLength(PLANE_ORDER.length)
      for (const id of PLANE_ORDER) {
        // 같은 Sprite 객체여야 한다(다시 만들지 않는다)
        expect(spriteOf(after, id), id).toBe(spriteOf(before, id))
        const texture = TEXTURES[id]
        const expected = planeMatrix(STUDIO_PLANES[id], texture.width, texture.height, transform)
        const sprite = spriteOf(after, id)
        sprite.updateLocalTransform()
        const actual = sprite.localTransform
        for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty'] as const) {
          expect(actual[key]).toBeCloseTo(expected[key], 6)
        }
      }
    }
  })
})
