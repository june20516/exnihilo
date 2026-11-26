/**
 * 문형 토큰: {target}, {reasons}, 조사가 붙은 {target:을}·{reasons:에} 등.
 * g 플래그라 lastIndex 상태를 가진다. exec·test로 직접 쓰지 말고 matchAll·replace에 넘기거나
 * new RegExp(TEMPLATE_TOKEN.source)로 복사해서 쓴다.
 */
export const TEMPLATE_TOKEN = /\{(target|reasons)(?::(을|에|와|에게))?\}/g
