import type { StatusKind } from '@/kit/core/entity'

/** 상태의 화면 이름(한 곳에서만 정한다). 세계관 이름은 docs/lab/naming에서 정한다. */
export const STATUS_NAMES: Readonly<Record<StatusKind, string>> = {
  block: '보호',
  poison: '독',
  freeze: '빙결',
  strength: '힘',
  weak: '약화',
  vulnerable: '취약',
}
