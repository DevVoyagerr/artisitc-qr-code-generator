// ─── QR 데이터 인코딩 ────────────────────────────────────────────
import { MODE, ALPHANUMERIC_CHARS, getCharCountBits } from './tables.js';
import { BitBuffer } from './bit-buffer.js';

// ─── 입력 분석: 최적 모드 자동 감지 ─────────────────────────────
export function analyzeMode(text) {
  if (/^\d+$/.test(text)) return MODE.NUMERIC;
  if (/^[A-Z0-9 $%*+\-./:]+$/.test(text)) return MODE.ALPHANUMERIC;
  return MODE.BYTE;
}

// ─── 데이터 길이 (모드 기준) ────────────────────────────────────
export function getDataLength(text, mode) {
  if (mode === MODE.BYTE) {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

// ─── Numeric 인코딩 ─────────────────────────────────────────────
function encodeNumeric(buffer, text) {
  let i = 0;
  while (i + 2 < text.length) {
    const num = parseInt(text.substring(i, i + 3), 10);
    buffer.put(num, 10);
    i += 3;
  }
  if (text.length - i === 2) {
    buffer.put(parseInt(text.substring(i, i + 2), 10), 7);
  } else if (text.length - i === 1) {
    buffer.put(parseInt(text.substring(i, i + 1), 10), 4);
  }
}

// ─── Alphanumeric 인코딩 ────────────────────────────────────────
function encodeAlphanumeric(buffer, text) {
  let i = 0;
  while (i + 1 < text.length) {
    const v1 = ALPHANUMERIC_CHARS.indexOf(text[i]);
    const v2 = ALPHANUMERIC_CHARS.indexOf(text[i + 1]);
    buffer.put(v1 * 45 + v2, 11);
    i += 2;
  }
  if (text.length - i === 1) {
    buffer.put(ALPHANUMERIC_CHARS.indexOf(text[i]), 6);
  }
}

// ─── Byte 인코딩 (UTF-8) ────────────────────────────────────────
function encodeByte(buffer, text) {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i++) {
    buffer.put(bytes[i], 8);
  }
}

// ─── 데이터 비트스트림 생성 ─────────────────────────────────────
export function encodeData(text, version, ecLevel, mode) {
  const buffer = new BitBuffer();
  const dataLength = getDataLength(text, mode);
  const ccBits = getCharCountBits(mode, version);

  // 모드 표시 (4비트)
  buffer.put(mode.indicator, 4);

  // 문자 수 표시
  buffer.put(dataLength, ccBits);

  // 데이터 인코딩
  if (mode === MODE.NUMERIC) {
    encodeNumeric(buffer, text);
  } else if (mode === MODE.ALPHANUMERIC) {
    encodeAlphanumeric(buffer, text);
  } else {
    encodeByte(buffer, text);
  }

  return buffer;
}
