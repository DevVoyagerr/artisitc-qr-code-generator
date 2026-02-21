// ─── QR 마스크 패턴 + 패널티 규칙 ────────────────────────────────

// 8개 마스크 조건 함수
const MASK_FUNCTIONS = [
  (row, col) => (row + col) % 2 === 0,
  (row, _) => row % 2 === 0,
  (_, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

// 마스크 적용 (비예약 셀만 XOR)
export function applyMask(maskIndex, matrix, reserved) {
  const size = matrix.length;
  const fn = MASK_FUNCTIONS[maskIndex];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!reserved[row][col] && fn(row, col)) {
        matrix[row][col] ^= 1;
      }
    }
  }
}

// ─── 패널티 규칙 ────────────────────────────────────────────────

// Rule 1: 같은 색 연속 5개 이상 → 3 + (연속수 - 5)
function penalty1(matrix) {
  const size = matrix.length;
  let penalty = 0;

  for (let row = 0; row < size; row++) {
    // 가로
    let count = 1;
    for (let col = 1; col < size; col++) {
      if (matrix[row][col] === matrix[row][col - 1]) {
        count++;
      } else {
        if (count >= 5) penalty += 3 + (count - 5);
        count = 1;
      }
    }
    if (count >= 5) penalty += 3 + (count - 5);
  }

  for (let col = 0; col < size; col++) {
    // 세로
    let count = 1;
    for (let row = 1; row < size; row++) {
      if (matrix[row][col] === matrix[row - 1][col]) {
        count++;
      } else {
        if (count >= 5) penalty += 3 + (count - 5);
        count = 1;
      }
    }
    if (count >= 5) penalty += 3 + (count - 5);
  }

  return penalty;
}

// Rule 2: 2x2 동색 블록 → 3점
function penalty2(matrix) {
  const size = matrix.length;
  let penalty = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const v = matrix[row][col];
      if (v === matrix[row][col + 1] &&
          v === matrix[row + 1][col] &&
          v === matrix[row + 1][col + 1]) {
        penalty += 3;
      }
    }
  }
  return penalty;
}

// Rule 3: 1:1:3:1:1 다크 패턴(+4칸 화이트) → 40점
function penalty3(matrix) {
  const size = matrix.length;
  let penalty = 0;
  // 패턴: 10111010000 또는 00001011101
  const p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size - 11; col++) {
      let match1 = true, match2 = true;
      for (let k = 0; k < 11; k++) {
        if (matrix[row][col + k] !== p1[k]) match1 = false;
        if (matrix[row][col + k] !== p2[k]) match2 = false;
        if (!match1 && !match2) break;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  for (let col = 0; col < size; col++) {
    for (let row = 0; row <= size - 11; row++) {
      let match1 = true, match2 = true;
      for (let k = 0; k < 11; k++) {
        if (matrix[row + k][col] !== p1[k]) match1 = false;
        if (matrix[row + k][col] !== p2[k]) match2 = false;
        if (!match1 && !match2) break;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  return penalty;
}

// Rule 4: 다크 모듈 비율이 50%에서 벗어난 정도 → 10점 단위
function penalty4(matrix) {
  const size = matrix.length;
  let darkCount = 0;
  const total = size * size;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col]) darkCount++;
    }
  }

  const ratio = darkCount / total;
  const prev5 = Math.floor(ratio * 20) * 5;
  const next5 = prev5 + 5;
  return Math.min(
    Math.abs(prev5 - 50) / 5,
    Math.abs(next5 - 50) / 5
  ) * 10;
}

// 총 패널티 점수
function calculatePenalty(matrix) {
  return penalty1(matrix) + penalty2(matrix) + penalty3(matrix) + penalty4(matrix);
}

// 매트릭스 깊은 복사
function cloneMatrix(m) {
  return m.map(row => row.slice());
}

// 최적 마스크 찾기
export function getBestMask(matrix, reserved, applyFormatInfo) {
  let bestMask = 0;
  let bestPenalty = Infinity;

  for (let i = 0; i < 8; i++) {
    const testMatrix = cloneMatrix(matrix);
    applyMask(i, testMatrix, reserved);
    applyFormatInfo(testMatrix, i);
    const penalty = calculatePenalty(testMatrix);

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = i;
    }
  }

  return bestMask;
}
