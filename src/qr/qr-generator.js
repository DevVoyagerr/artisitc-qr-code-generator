// ─── QR 코드 생성기 (오케스트레이터) ─────────────────────────────
import { BitBuffer } from './bit-buffer.js';
import { analyzeMode, getDataLength, encodeData } from './data-encoder.js';
import { encode as rsEncode } from './reed-solomon.js';
import {
  EC_LEVELS, getSymbolSize, getBestVersion, getDataCapacityBits,
  getECBlockInfo, getTotalCodewords,
  getAlignmentPositions, getFormatBits, getVersionBits,
} from './tables.js';
import { applyMask, getBestMask } from './mask.js';

// ─── 매트릭스 초기화 ────────────────────────────────────────────
function createMatrix(size) {
  const matrix = [];
  const reserved = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array(size).fill(0));
    reserved.push(new Array(size).fill(false));
  }
  return { matrix, reserved };
}

// ─── Finder Pattern 배치 (7x7) ──────────────────────────────────
function placeFinderPattern(matrix, reserved, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr < 0 || mr >= matrix.length || mc < 0 || mc >= matrix.length) continue;

      if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
        matrix[mr][mc] = 1;
      } else {
        matrix[mr][mc] = 0;
      }
      reserved[mr][mc] = true;
    }
  }
}

function placeFinderPatterns(matrix, reserved) {
  const size = matrix.length;
  // 좌상
  placeFinderPattern(matrix, reserved, 0, 0);
  // 우상
  placeFinderPattern(matrix, reserved, 0, size - 7);
  // 좌하
  placeFinderPattern(matrix, reserved, size - 7, 0);
}

// ─── Timing Pattern 배치 ────────────────────────────────────────
function placeTimingPatterns(matrix, reserved) {
  const size = matrix.length;
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    // 가로 (row 6)
    if (!reserved[6][i]) {
      matrix[6][i] = bit;
      reserved[6][i] = true;
    }
    // 세로 (col 6)
    if (!reserved[i][6]) {
      matrix[i][6] = bit;
      reserved[i][6] = true;
    }
  }
}

// ─── Alignment Pattern 배치 (5x5) ──────────────────────────────
function placeAlignmentPatterns(matrix, reserved, version) {
  const positions = getAlignmentPositions(version);
  for (const { row, col } of positions) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr < 0 || mr >= matrix.length || mc < 0 || mc >= matrix.length) continue;
        if (reserved[mr][mc]) continue; // Finder와 겹치면 skip

        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          matrix[mr][mc] = 1;
        } else {
          matrix[mr][mc] = 0;
        }
        reserved[mr][mc] = true;
      }
    }
  }
}

// ─── Format 정보 영역 예약 ──────────────────────────────────────
function reserveFormatArea(matrix, reserved) {
  const size = matrix.length;
  // 좌상 Finder 옆
  for (let i = 0; i <= 8; i++) {
    if (i < size) reserved[8][i] = true;
    if (i < size) reserved[i][8] = true;
  }
  // 우상
  for (let i = 0; i <= 7; i++) {
    reserved[8][size - 1 - i] = true;
  }
  // 좌하
  for (let i = 0; i <= 7; i++) {
    reserved[size - 1 - i][8] = true;
  }
  // Dark module (항상 다크)
  matrix[size - 8][8] = 1;
  reserved[size - 8][8] = true;
}

// ─── Version 정보 영역 예약 + 배치 ─────────────────────────────
function placeVersionInfo(matrix, reserved, version) {
  if (version < 7) return;

  const bits = getVersionBits(version);
  const size = matrix.length;

  for (let i = 0; i < 18; i++) {
    const bit = (bits >> i) & 1;
    const row = Math.floor(i / 3);
    const col = (size - 11) + (i % 3);

    // 좌하
    matrix[col][row] = bit;
    reserved[col][row] = true;

    // 우상
    matrix[row][col] = bit;
    reserved[row][col] = true;
  }
}

// ─── Format 정보 배치 ───────────────────────────────────────────
// ISO 18004 Annex C: position i=0 에 MSB(bit 14), position i=14 에 LSB(bit 0)
function placeFormatInfo(matrix, ecLevel, maskPattern) {
  const bits = getFormatBits(ecLevel, maskPattern);
  const size = matrix.length;

  // Copy 1 위치 (좌상 Finder 주변)
  const copy1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  // Copy 2 위치 (좌하 세로 + 우상 가로)
  const copy2 = [
    [size-1, 8], [size-2, 8], [size-3, 8], [size-4, 8],
    [size-5, 8], [size-6, 8], [size-7, 8],
    [8, size-8], [8, size-7], [8, size-6], [8, size-5],
    [8, size-4], [8, size-3], [8, size-2], [8, size-1],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> (14 - i)) & 1; // MSB first
    matrix[copy1[i][0]][copy1[i][1]] = bit;
    matrix[copy2[i][0]][copy2[i][1]] = bit;
  }

  // Dark module (항상 1)
  matrix[size - 8][8] = 1;
}

// ─── 데이터 코드워드 생성 ───────────────────────────────────────
function createCodewords(text, version, ecLevel, mode) {
  const buffer = encodeData(text, version, ecLevel, mode);
  const totalDataBits = getDataCapacityBits(version, ecLevel);

  // 터미네이터 추가 (최대 4비트)
  const remainBits = totalDataBits - buffer.getLengthInBits();
  const terminatorLen = Math.min(4, remainBits);
  buffer.put(0, terminatorLen);

  // 바이트 경계 맞춤
  while (buffer.getLengthInBits() % 8 !== 0) {
    buffer.putBit(false);
  }

  // 패딩 바이트 (0xEC, 0x11 교대)
  const totalDataBytes = totalDataBits / 8;
  const padPatterns = [0xEC, 0x11];
  let padIdx = 0;
  while (buffer.getLengthInBits() / 8 < totalDataBytes) {
    buffer.put(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  const data = buffer.toUint8Array();

  // EC 블록으로 분할 + Reed-Solomon
  const { ecCodewordsPerBlock, blocks } = getECBlockInfo(version, ecLevel);
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (const block of blocks) {
    const blockData = data.slice(offset, offset + block.dataCodewords);
    dataBlocks.push(blockData);
    ecBlocks.push(rsEncode(blockData, ecCodewordsPerBlock));
    offset += block.dataCodewords;
  }

  // 인터리빙: 데이터 블록들에서 1바이트씩 번갈아 추출
  const totalCodewords = getTotalCodewords(version);
  const result = new Uint8Array(totalCodewords);
  let idx = 0;

  // 데이터 인터리빙
  const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result[idx++] = block[i];
    }
  }

  // EC 인터리빙
  for (let i = 0; i < ecCodewordsPerBlock; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) result[idx++] = block[i];
    }
  }

  return result;
}

// ─── 데이터 비트 배치 ───────────────────────────────────────────
function placeData(matrix, reserved, codewords) {
  const size = matrix.length;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  // 오른쪽에서 왼쪽으로, 2열씩 처리
  // col 6 (timing)은 건너뜀
  let col = size - 1;
  while (col > 0) {
    if (col === 6) col--; // timing column skip

    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const curCol = col - c;
        if (curCol < 0) continue;

        // 아래→위 또는 위→아래 방향 결정
        const isUpward = ((size - 1 - col) >> 1) % 2 === 0;
        const actualRow = isUpward ? size - 1 - row : row;

        if (reserved[actualRow][curCol]) continue;

        if (bitIndex < totalBits) {
          const byteIdx = bitIndex >>> 3;
          const bitIdx = 7 - (bitIndex & 7);
          matrix[actualRow][curCol] = (codewords[byteIdx] >>> bitIdx) & 1;
          bitIndex++;
        }
        // 남는 셀은 0으로 유지
      }
    }
    col -= 2;
  }
}

// ─── 메인 생성 함수 ─────────────────────────────────────────────
export function generateQR(text, options = {}) {
  const { errorCorrectionLevel = 'H' } = options;
  const ecLevel = errorCorrectionLevel;

  if (!EC_LEVELS[ecLevel]) {
    throw new Error(`Invalid EC level: ${ecLevel}`);
  }
  if (!text || text.length === 0) {
    throw new Error('Text cannot be empty');
  }

  // 1. 입력 분석
  const mode = analyzeMode(text);
  const dataLength = getDataLength(text, mode);

  // 2. 최적 버전 결정
  const version = getBestVersion(dataLength, ecLevel, mode);
  const size = getSymbolSize(version);

  // 3. 매트릭스 생성
  const { matrix, reserved } = createMatrix(size);

  // 4. Function 패턴 배치
  placeFinderPatterns(matrix, reserved);
  placeTimingPatterns(matrix, reserved);
  placeAlignmentPatterns(matrix, reserved, version);
  reserveFormatArea(matrix, reserved);
  placeVersionInfo(matrix, reserved, version);

  // 5. 데이터 코드워드 생성 (인코딩 + RS + 인터리빙)
  const codewords = createCodewords(text, version, ecLevel, mode);

  // 6. 데이터 배치
  placeData(matrix, reserved, codewords);

  // 7. 최적 마스크 찾기 + 적용
  const bestMask = getBestMask(matrix, reserved, (testMatrix, mask) => {
    placeFormatInfo(testMatrix, ecLevel, mask);
  });

  applyMask(bestMask, matrix, reserved);
  placeFormatInfo(matrix, ecLevel, bestMask);

  // 8. boolean[][] 반환
  return matrix.map(row => row.map(v => v === 1));
}
