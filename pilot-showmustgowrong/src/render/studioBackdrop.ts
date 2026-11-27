import { Container, Matrix, Sprite, type Texture } from 'pixi.js'
import { STUDIO_PLANES, planeMatrix, type StudioPlaneId } from './backdrop'
import type { IsoTransform } from './geometry'

/** 옆벽(x=0 면)을 뒷벽보다 조금 어둡게 해 두 면이 구분되게 한다(조명이 오른쪽 앞에서 온다고 본다) */
export const SIDE_WALL_TINT = 0xb8b8c8

/** 그리는 순서(뒤에서 앞): 벽 두 면 다음 바닥 */
const PLANE_ORDER: readonly StudioPlaneId[] = ['backWall', 'sideWall', 'floor']

/** 면마다 붙일 그림 텍스처 */
export type StudioBackdropTextures = Readonly<Record<StudioPlaneId, Texture>>

/**
 * 스튜디오 바닥·뒷벽·옆벽에 그림을 입힌다. 쿼터뷰 투영은 평면 위에서 아핀이라
 * 각 면은 Sprite 하나에 아핀 행렬(planeMatrix)을 주면 된다. 크기가 바뀌면 layout만 다시 부른다
 * (Sprite는 생성 때 한 번만 만든다).
 */
export class StudioBackdrop {
  readonly container = new Container()
  private readonly sprites: ReadonlyMap<StudioPlaneId, Sprite>

  constructor(textures: StudioBackdropTextures) {
    this.sprites = new Map(PLANE_ORDER.map((id) => [id, new Sprite(textures[id])]))
    for (const [id, sprite] of this.sprites) {
      if (id === 'sideWall') sprite.tint = SIDE_WALL_TINT
      this.container.addChild(sprite)
    }
  }

  /** 면의 Sprite. 생성자가 모든 면을 만들므로 항상 있다 */
  sprite(id: StudioPlaneId): Sprite {
    const sprite = this.sprites.get(id)
    if (sprite === undefined) throw new Error(`스튜디오 배경 면이 없습니다: ${id}`)
    return sprite
  }

  layout(transform: IsoTransform): void {
    for (const [id, sprite] of this.sprites) {
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
