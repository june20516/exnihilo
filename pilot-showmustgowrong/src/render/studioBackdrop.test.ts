import { Texture, TextureSource } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { STUDIO_PLANES, planeMatrix } from './backdrop'
import { fitIso } from './geometry'
import { SIDE_WALL_TINT, StudioBackdrop } from './studioBackdrop'

function texture(width: number, height: number): Texture {
  return new Texture({ source: new TextureSource({ width, height }) })
}

const TEXTURES = {
  floor: texture(1228, 768),
  backWall: texture(1376, 215),
  sideWall: texture(1376, 344),
}

describe('StudioBackdrop', () => {
  it('면 3개를 Sprite로 만들고 옆벽만 어둡게 물들인다', () => {
    const backdrop = new StudioBackdrop(TEXTURES)
    expect(backdrop.container.children).toHaveLength(3)
    expect(backdrop.sprite('sideWall').tint).toBe(SIDE_WALL_TINT)
    expect(backdrop.sprite('backWall').tint).toBe(0xffffff)
    expect(backdrop.sprite('floor').tint).toBe(0xffffff)
    expect(backdrop.sprite('floor').texture).toBe(TEXTURES.floor)
  })

  it('layout을 다시 불러도 Sprite는 그대로이고 행렬만 새 transform에 맞게 바뀐다', () => {
    const backdrop = new StudioBackdrop(TEXTURES)
    const before = [...backdrop.container.children]
    for (const transform of [fitIso(960, 540, 16), fitIso(400, 300, 8)]) {
      backdrop.layout(transform)
      expect(backdrop.container.children).toEqual(before)
      for (const id of ['floor', 'backWall', 'sideWall'] as const) {
        const texture = TEXTURES[id]
        const expected = planeMatrix(STUDIO_PLANES[id], texture.width, texture.height, transform)
        const sprite = backdrop.sprite(id)
        sprite.updateLocalTransform()
        const actual = sprite.localTransform
        for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty'] as const) {
          expect(actual[key]).toBeCloseTo(expected[key], 6)
        }
      }
    }
  })
})
