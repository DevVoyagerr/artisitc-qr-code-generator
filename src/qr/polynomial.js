// ─── GF(2^8) 다항식 연산 ─────────────────────────────────────────
import * as GF from './galois-field.js';

// 다항식 곱셈: p1 * p2
export function mul(p1, p2) {
  const result = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= GF.mul(p1[i], p2[j]);
    }
  }
  return result;
}

// 다항식 나머지: dividend mod divisor
export function mod(dividend, divisor) {
  let result = new Uint8Array(dividend);
  while (result.length >= divisor.length && result[0] !== 0) {
    const coeff = result[0];
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= GF.mul(divisor[i], coeff);
    }
    // 선두 0 제거
    let start = 0;
    while (start < result.length && result[start] === 0) start++;
    result = result.slice(start);
  }
  // divisor.length - 1 길이로 맞춤 (선두에 0 패딩)
  const padLen = divisor.length - 1 - result.length;
  if (padLen > 0) {
    const padded = new Uint8Array(divisor.length - 1);
    padded.set(result, padLen);
    return padded;
  }
  return result;
}

// Reed-Solomon EC 생성 다항식
// G(x) = (x - α^0)(x - α^1)...(x - α^(degree-1))
export function generateECPolynomial(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    poly = mul(poly, new Uint8Array([1, GF.exp(i)]));
  }
  return poly;
}
