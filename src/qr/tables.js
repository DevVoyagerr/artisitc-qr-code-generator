// ─── QR 코드 스펙 데이터 테이블 ───────────────────────────────────

// EC 레벨 상수 (비트 패턴)
export const EC_LEVELS = {
  L: { bit: 0b01, ordinal: 0 },
  M: { bit: 0b00, ordinal: 1 },
  Q: { bit: 0b11, ordinal: 2 },
  H: { bit: 0b10, ordinal: 3 },
};

// 인코딩 모드 상수
export const MODE = {
  NUMERIC:      { id: 'Numeric',      indicator: 0b0001, ccBits: [10, 12, 14] },
  ALPHANUMERIC: { id: 'Alphanumeric', indicator: 0b0010, ccBits: [9, 11, 13] },
  BYTE:         { id: 'Byte',         indicator: 0b0100, ccBits: [8, 16, 16] },
};

// Alphanumeric 문자 테이블
export const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// 버전별 Character Count Indicator 비트 수
export function getCharCountBits(mode, version) {
  if (version < 10) return mode.ccBits[0];
  if (version < 27) return mode.ccBits[1];
  return mode.ccBits[2];
}

// 버전별 심볼 크기 (모듈 수)
export function getSymbolSize(version) {
  return version * 4 + 17;
}

// 버전별 총 코드워드 수 (데이터 + EC)
// QR Code specification Table 1
const TOTAL_CODEWORDS = [
  0,    // version 0 (없음)
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,        // v1-10
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,    // v11-20
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, // v21-30
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706, // v31-40
];

// EC 블록 정보: [version][ecLevel] = { ecCodewordsPerBlock, blocks: [{ count, dataCodewords }] }
// 간결하게 [ecPerBlock, block1Count, block1DataCW, block2Count?, block2DataCW?] 형태
const EC_BLOCKS = [
  null, // version 0
  // Version 1
  [[7,1,19], [10,1,16], [13,1,13], [17,1,9]],
  // Version 2
  [[10,1,34], [16,1,28], [22,1,22], [28,1,16]],
  // Version 3
  [[15,1,55], [26,1,44], [18,2,17], [22,2,13]],
  // Version 4
  [[20,1,80], [18,2,32], [26,2,24], [16,4,9]],
  // Version 5
  [[26,1,108], [24,2,43], [18,2,15,2,16], [22,2,11,2,12]],
  // Version 6
  [[18,2,68], [16,4,27], [24,4,19], [28,4,15]],
  // Version 7
  [[20,2,78], [18,4,31], [18,2,14,4,15], [26,4,13,1,14]],
  // Version 8
  [[24,2,97], [22,2,38,2,39], [22,4,18,2,19], [26,4,14,2,15]],
  // Version 9
  [[30,2,116], [22,3,36,2,37], [20,4,16,4,17], [24,4,12,4,13]],
  // Version 10
  [[18,2,68,2,69], [26,4,43,1,44], [24,6,19,2,20], [28,6,15,2,16]],
  // Version 11
  [[20,4,81], [30,1,50,4,51], [28,4,22,4,23], [24,3,12,8,13]],
  // Version 12
  [[24,2,92,2,93], [22,6,36,2,37], [26,4,20,6,21], [28,7,14,4,15]],
  // Version 13
  [[26,4,107], [22,8,37,1,38], [24,8,20,4,21], [22,12,11,4,12]],
  // Version 14
  [[30,3,115,1,116], [24,4,40,5,41], [20,11,16,5,17], [24,11,12,5,13]],
  // Version 15
  [[22,5,87,1,88], [24,5,41,5,42], [30,5,24,7,25], [24,11,12,7,13]],
  // Version 16
  [[24,5,98,1,99], [28,7,45,3,46], [24,15,19,2,20], [30,3,15,13,16]],
  // Version 17
  [[28,1,107,5,108], [28,10,46,1,47], [28,1,22,15,23], [28,2,14,17,15]],
  // Version 18
  [[30,5,120,1,121], [26,9,43,4,44], [28,17,22,1,23], [28,2,14,19,15]],
  // Version 19
  [[28,3,113,4,114], [26,3,44,11,45], [26,17,21,4,22], [26,9,13,16,14]],
  // Version 20
  [[28,3,107,5,108], [26,3,41,13,42], [30,15,24,5,25], [28,15,15,10,16]],
  // Version 21
  [[28,4,116,4,117], [26,17,42], [28,17,22,6,23], [30,19,16,6,17]],
  // Version 22
  [[28,2,111,7,112], [28,17,46], [30,7,24,16,25], [24,34,13]],
  // Version 23
  [[30,4,121,5,122], [28,4,47,14,48], [30,11,24,14,25], [30,16,15,14,16]],
  // Version 24
  [[30,6,117,4,118], [28,6,45,14,46], [30,11,24,16,25], [30,30,16,2,17]],
  // Version 25
  [[26,8,106,4,107], [28,8,47,13,48], [30,7,24,22,25], [30,22,15,13,16]],
  // Version 26
  [[28,10,114,2,115], [28,19,46,4,47], [28,28,22,6,23], [30,33,16,4,17]],
  // Version 27
  [[30,8,122,4,123], [28,22,45,3,46], [30,8,23,26,24], [30,12,15,28,16]],
  // Version 28
  [[30,3,117,10,118], [28,3,45,23,46], [30,4,24,31,25], [30,11,15,31,16]],
  // Version 29
  [[30,7,116,7,117], [28,21,45,7,46], [30,1,23,37,24], [30,19,15,26,16]],
  // Version 30
  [[30,5,115,10,116], [28,19,47,10,48], [30,15,24,25,25], [30,23,15,25,16]],
  // Version 31
  [[30,13,115,3,116], [28,2,46,29,47], [30,42,24,1,25], [30,23,15,28,16]],
  // Version 32
  [[30,17,115], [28,10,46,23,47], [30,10,24,35,25], [30,19,15,35,16]],
  // Version 33
  [[30,17,115,1,116], [28,14,46,21,47], [30,29,24,19,25], [30,11,15,46,16]],
  // Version 34
  [[30,13,115,6,116], [28,14,46,23,47], [30,44,24,7,25], [30,59,16,1,17]],
  // Version 35
  [[30,12,121,7,122], [28,12,47,26,48], [30,39,24,14,25], [30,22,15,41,16]],
  // Version 36
  [[30,6,121,14,122], [28,6,47,34,48], [30,46,24,10,25], [30,2,15,64,16]],
  // Version 37
  [[30,17,122,4,123], [28,29,46,14,47], [30,49,24,10,25], [30,24,15,46,16]],
  // Version 38
  [[30,4,122,18,123], [28,13,46,32,47], [30,48,24,14,25], [30,42,15,32,16]],
  // Version 39
  [[30,20,117,4,118], [28,40,47,7,48], [30,43,24,22,25], [30,10,15,67,16]],
  // Version 40
  [[30,19,118,6,119], [28,18,47,31,48], [30,34,24,34,25], [30,20,15,61,16]],
];

// EC 블록 정보를 파싱하여 반환
export function getECBlockInfo(version, ecLevel) {
  const ordinal = EC_LEVELS[ecLevel].ordinal;
  const raw = EC_BLOCKS[version][ordinal];
  const ecCodewordsPerBlock = raw[0];

  const blocks = [];
  let i = 1;
  while (i < raw.length) {
    const count = raw[i];
    const dataCodewords = raw[i + 1];
    for (let j = 0; j < count; j++) {
      blocks.push({ dataCodewords, totalCodewords: dataCodewords + ecCodewordsPerBlock });
    }
    i += 2;
  }

  return { ecCodewordsPerBlock, blocks };
}

// 데이터 용량 계산 (해당 버전/EC레벨에서 사용 가능한 데이터 비트 수)
export function getDataCapacityBits(version, ecLevel) {
  const { blocks } = getECBlockInfo(version, ecLevel);
  let totalData = 0;
  for (const block of blocks) {
    totalData += block.dataCodewords;
  }
  return totalData * 8;
}

// 모드별 데이터 용량 (문자 수)
export function getDataCapacity(version, ecLevel, mode) {
  const dataBits = getDataCapacityBits(version, ecLevel);
  const ccBits = getCharCountBits(mode, version);
  const availBits = dataBits - 4 - ccBits; // 4비트 모드 표시 제외

  if (mode === MODE.NUMERIC) {
    // 3자리 = 10비트, 2자리 = 7비트, 1자리 = 4비트
    const groups3 = Math.floor(availBits / 10);
    const remain = availBits - groups3 * 10;
    if (remain >= 7) return groups3 * 3 + 2;
    if (remain >= 4) return groups3 * 3 + 1;
    return groups3 * 3;
  }
  if (mode === MODE.ALPHANUMERIC) {
    // 2글자 = 11비트, 1글자 = 6비트
    const pairs = Math.floor(availBits / 11);
    const remain = availBits - pairs * 11;
    if (remain >= 6) return pairs * 2 + 1;
    return pairs * 2;
  }
  // BYTE
  return Math.floor(availBits / 8);
}

// 최적 버전 찾기
export function getBestVersion(dataLength, ecLevel, mode) {
  for (let v = 1; v <= 40; v++) {
    if (getDataCapacity(v, ecLevel, mode) >= dataLength) return v;
  }
  throw new Error('Data too long for QR code');
}

// 총 코드워드 수
export function getTotalCodewords(version) {
  return TOTAL_CODEWORDS[version];
}

// ─── 정렬 패턴 좌표 ──────────────────────────────────────────────
const ALIGNMENT_PATTERN_POSITIONS = [
  null, // version 0
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

// 정렬 패턴 중심 좌표 목록 반환 (Finder 패턴과 겹치는 것 제외)
export function getAlignmentPositions(version) {
  if (version < 2) return [];
  const coords = ALIGNMENT_PATTERN_POSITIONS[version];
  const positions = [];
  const last = coords.length - 1;

  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      // Finder 패턴 3개와 겹치는 위치 제외
      if ((i === 0 && j === 0) ||
          (i === 0 && j === last) ||
          (i === last && j === 0)) continue;
      positions.push({ row: coords[i], col: coords[j] });
    }
  }
  return positions;
}

// ─── BCH 코드 ────────────────────────────────────────────────────
const G15 = 0x537;       // Format info 생성 다항식
const G15_MASK = 0x5412;  // Format info XOR 마스크
const G18 = 0x1F25;       // Version info 생성 다항식

function getBCHDigit(data) {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
}

// Format 정보 인코딩 (EC레벨 + 마스크 패턴 → 15비트)
export function getFormatBits(ecLevel, maskPattern) {
  const data = (EC_LEVELS[ecLevel].bit << 3) | maskPattern;
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
    d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15));
  }
  return ((data << 10) | d) ^ G15_MASK;
}

// Version 정보 인코딩 (버전 7 이상, → 18비트)
export function getVersionBits(version) {
  let d = version << 12;
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
    d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18));
  }
  return (version << 12) | d;
}
