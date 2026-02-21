// ─── Reed-Solomon 인코더 ─────────────────────────────────────────
import { generateECPolynomial, mod } from './polynomial.js';

// 데이터 코드워드에 EC 코드워드를 생성하여 반환
export function encode(data, ecCount) {
  const genPoly = generateECPolynomial(ecCount);

  // data를 ecCount만큼 왼쪽 시프트 (뒤에 0 패딩)
  const padded = new Uint8Array(data.length + ecCount);
  padded.set(data, 0);

  // 나머지 = EC 코드워드
  const remainder = mod(padded, genPoly);
  return remainder;
}
