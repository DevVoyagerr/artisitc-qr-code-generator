// ─── GF(2^8) 유한체 산술 ─────────────────────────────────────────
// 원시다항식: x^8 + x^4 + x^3 + x^2 + 1 = 0x11D

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

// 테이블 초기화
let x = 1;
for (let i = 0; i < 255; i++) {
  EXP_TABLE[i] = x;
  LOG_TABLE[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11D;
}
// 순환을 위해 EXP_TABLE을 복제 (modulo 없이 접근 가능)
for (let i = 255; i < 512; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 255];
}

export function exp(n) {
  return EXP_TABLE[n];
}

export function log(n) {
  if (n === 0) throw new Error('log(0) is undefined in GF(2^8)');
  return LOG_TABLE[n];
}

export function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}
