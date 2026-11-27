import { Container, Matrix, Sprite, type Texture } from 'pixi.js'
import { STUDIO_PLANES, planeMatrix, type StudioPlaneId } from './backdrop'
import type { IsoTransform } from './geometry'

/** 옆벽(x=0 면)을 뒷벽보다 조금 어둡게 해 두 면이 구분되게 한다(조명이 오른쪽 앞에서 온다고 본다) */
const SIDE_WALL_TINT = 0xb8b8c8

/** 면마다 붙일 그림 텍스처 */
export type StudioBackdropTextures = Readonly<Record<StudioPlaneId, Texture>>

/**
 * 스튜디오 바닥·뒷벽·옆벽에 그림을 입힌다. 쿼터뷰 투영은 평면 위에서 아핀이라
 * 각 면은 Sprite 하나에 아핀 행렬(planeMatrix)을 주면 된다. 크기가 바뀌면 layout만 다시 부른다.
 */
export class StudioBackdrop {
  readonly container = new Container()
  private readonly sprites: ReadonlyArray<{ id: StudioPlaneId; sprite: Sprite }>

  constructor(textures: StudioBackdropTextures) {
    const ids: StudioPlaneId[] = ['backWall', 'sideWall', 'floor']
    this.sprites = ids.map((id) => ({ id, sprite: new Sprite(textures[id]) }))
    for (const { id, sprite } of this.sprites) {
      if (id === 'sideWall') sprite.tint = SIDE_WALL_TINT
      this.container.addChild(sprite)
    }
  }

  layout(transform: IsoTransform): void {
    for (const { id, sprite } of this.sprites) {
      const { a, b, c, d, tx, ty } = planeMatrix(
        STUDIO_PLANES[id],
        sprite.texture.width,
        sprite.texture.height,
        transform,
      )
      sprite.setFromMatrix(new Matrix(a, b, c, d, tx, ty))
    }
  }
}
