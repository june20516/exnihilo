import type { TokenId } from './words'

export interface TokenDef {
  readonly name: string
  readonly hp: number
}

export const TOKENS: Record<TokenId, TokenDef> = {
  scarecrow: { name: '허수아비', hp: 8 },
  golem: { name: '돌골렘', hp: 15 },
}
