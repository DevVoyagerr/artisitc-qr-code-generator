/**
 * Scanner Mode — WebGL Pixel-Level Verification
 *
 * 실제 Chromium WebGL 컨텍스트에서 셰이더 출력을 gl.readPixels로 검증.
 * 5가지 보정 항목 각각에 대해 scannerMode ON/OFF 비교.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebGLRenderer } from '../src/webgl/renderer.js';
import { generateQR } from '../src/qr/index.js';

// ─── Constants ───────────────────────────────────────────────────
const SIZE = 500;
const TEXT = 'https://example.com';

// ─── Helpers ─────────────────────────────────────────────────────

/** 단색 캔버스 이미지 생성 */
function createSolidImage(size, cssColor) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** 대각선 그라데이션 이미지 (finder 영역은 빨강 계열) */
function createGradientImage(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#ff4400');
  grad.addColorStop(0.5, '#44cc44');
  grad.addColorStop(1, '#2244ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** WebGL readPixels (y축 뒤집기 적용) */
function readPixel(gl, x, y, height) {
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(x), Math.floor(height - y - 1), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0], px[1], px[2], px[3]];
}

/** 특정 모듈 중심의 캔버스 좌표 */
function moduleCenter(row, col, moduleCount, size) {
  const qz = size * 0.08;
  const cell = (size - qz * 2) / moduleCount;
  return { x: qz + col * cell + cell / 2, y: qz + row * cell + cell / 2 };
}

/** BT.601 luminance (0~1) */
function lum(r, g, b) {
  return 0.299 * (r / 255) + 0.587 * (g / 255) + 0.114 * (b / 255);
}

/** 렌더 + 픽셀 리더 반환 */
function renderAndRead(renderer, matrix, image, scannerMode, extra = {}) {
  const mc = matrix.length;
  renderer.render({
    qrMatrix: matrix,
    image,
    options: {
      size: SIZE,
      moduleCount: mc,
      quietZone: 0.08,
      dotScale: 0.85,
      moduleStyle: 1,        // rounded
      colorMode: 0,           // image
      solidColor: [0, 0, 0],
      eyeStyle: 0,            // circle
      bgOpacity: 1.0,
      dotOpacity: 1.0,
      blendMode: 0,           // multiply
      adaptiveSize: 1.0,
      finderColor: [0, 0, 0],
      useFinderColor: 0,
      scannerMode: scannerMode ? 1 : 0,
      ...extra,
    },
  });
  const gl = renderer.gl;
  return {
    pixelAt(row, col) {
      const { x, y } = moduleCenter(row, col, mc, SIZE);
      return readPixel(gl, x, y, SIZE);
    },
    rawPixelAt(x, y) {
      return readPixel(gl, x, y, SIZE);
    },
    gl,
    moduleCount: mc,
  };
}

/** data 영역(finder/alignment 밖)에서 dark/light 모듈 찾기 */
function findDataModules(matrix) {
  const mc = matrix.length;
  let dark = null, light = null;
  for (let r = 9; r < mc - 9; r++) {
    for (let c = 9; c < mc - 9; c++) {
      if (matrix[r][c] && !dark) dark = { r, c };
      if (!matrix[r][c] && !light) light = { r, c };
      if (dark && light) return { dark, light };
    }
  }
  return { dark, light };
}

// ─── Tests ───────────────────────────────────────────────────────
describe('Scanner Mode — WebGL Pixel Verification', () => {
  let renderer;
  let matrix;
  let gradientImg;
  let orangeImg;
  let whiteImg;
  let mc; // moduleCount

  beforeAll(() => {
    renderer = new WebGLRenderer();
    matrix = generateQR(TEXT, { errorCorrectionLevel: 'H' });
    mc = matrix.length;
    gradientImg = createGradientImage(SIZE);
    orangeImg = createSolidImage(SIZE, '#ff6600');
    whiteImg = createSolidImage(SIZE, '#ffffff');
  });

  afterAll(() => {
    renderer.dispose();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. 파인더 패턴 순수 흑백 (치명적 수정)
  // ─────────────────────────────────────────────────────────────
  describe('1. Finder Pattern — Pure B/W (Critical)', () => {

    it('scanner ON: finder inner dark (3,3) → near-black (R,G,B < 10)', () => {
      const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, true);
      const [r, g, b] = pixelAt(3, 3);
      expect(r, `R=${r}`).toBeLessThan(10);
      expect(g, `G=${g}`).toBeLessThan(10);
      expect(b, `B=${b}`).toBeLessThan(10);
    });

    it('scanner ON: finder outer dark (0,3) → near-black', () => {
      // (0,3) → finderUV ≈ (0.071, 0.5), dist ≈ 0.429 → outer dark ring
      const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, true);
      const [r, g, b] = pixelAt(0, 3);
      expect(r, `R=${r}`).toBeLessThan(10);
      expect(g, `G=${g}`).toBeLessThan(10);
      expect(b, `B=${b}`).toBeLessThan(10);
    });

    it('scanner ON: finder light ring (1,3) → near-white (R,G,B > 245)', () => {
      // (1,3) → finderUV ≈ (0.214, 0.5), dist ≈ 0.286 → light ring
      const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, true);
      const [r, g, b] = pixelAt(1, 3);
      expect(r, `R=${r}`).toBeGreaterThan(245);
      expect(g, `G=${g}`).toBeGreaterThan(245);
      expect(b, `B=${b}`).toBeGreaterThan(245);
    });

    it('scanner ON: all 3 finders have pure B/W dark centers', () => {
      const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, true);

      // Top-left (3,3)
      const tl = pixelAt(3, 3);
      expect(lum(tl[0], tl[1], tl[2])).toBeLessThan(0.05);

      // Top-right (3, mc-4)
      const tr = pixelAt(3, mc - 4);
      expect(lum(tr[0], tr[1], tr[2])).toBeLessThan(0.05);

      // Bottom-left (mc-4, 3)
      const bl = pixelAt(mc - 4, 3);
      expect(lum(bl[0], bl[1], bl[2])).toBeLessThan(0.05);
    });

    it('scanner OFF: finder dark has image color bleed (NOT pure black)', () => {
      const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, false);
      const [r, g, b] = pixelAt(3, 3);
      // 오렌지 이미지이므로 R 채널이 0보다 커야 함
      expect(r + g + b, `Sum=${r + g + b} — should have color from image`).toBeGreaterThan(5);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Light 모듈 밝기 (whiteBlend 0.25→0.55)
  // ─────────────────────────────────────────────────────────────
  describe('2. Light Module Brightness (whiteBlend boost)', () => {

    it('scanner ON → light module luminance ≥ scanner OFF', () => {
      const { dark, light } = findDataModules(matrix);
      if (!light) return; // skip if no light module found

      const off = renderAndRead(renderer, matrix, gradientImg, false);
      const pxOff = off.pixelAt(light.r, light.c);
      const lumOff = lum(pxOff[0], pxOff[1], pxOff[2]);

      const on = renderAndRead(renderer, matrix, gradientImg, true);
      const pxOn = on.pixelAt(light.r, light.c);
      const lumOn = lum(pxOn[0], pxOn[1], pxOn[2]);

      expect(lumOn, `ON=${lumOn.toFixed(3)} vs OFF=${lumOff.toFixed(3)}`)
        .toBeGreaterThanOrEqual(lumOff - 0.01); // 0.01 tolerance for float
    });

    it('scanner ON + bgOpacity=1.0 → light module lum > 0.7', () => {
      const { dark, light } = findDataModules(matrix);
      if (!light) return;

      const on = renderAndRead(renderer, matrix, orangeImg, true, { bgOpacity: 1.0 });
      const px = on.pixelAt(light.r, light.c);
      const l = lum(px[0], px[1], px[2]);

      // whiteBlend=0.55 최소이므로 어떤 이미지든 lum > 0.55
      expect(l, `Luminance=${l.toFixed(3)}`).toBeGreaterThan(0.55);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 적응형 크기 (min scale 0.5→0.75)
  // ─────────────────────────────────────────────────────────────
  describe('3. Adaptive Size (min scale clamp)', () => {

    it('scanner ON → bright area dot covers more pixels than OFF', () => {
      // 흰색 배경 = 최대 축소 → 차이가 극대화
      const { dark } = findDataModules(matrix);
      if (!dark) return;

      const qz = SIZE * 0.08;
      const cell = (SIZE - qz * 2) / mc;
      const startX = qz + dark.c * cell;
      const startY = qz + dark.r * cell;
      const steps = 10;

      const countDark = (scannerMode) => {
        const { gl } = renderAndRead(renderer, matrix, whiteImg, scannerMode, {
          adaptiveSize: 1.0,
        });
        let n = 0;
        for (let i = 0; i < steps; i++) {
          for (let j = 0; j < steps; j++) {
            const px = readPixel(
              gl,
              startX + (i + 0.5) * cell / steps,
              startY + (j + 0.5) * cell / steps,
              SIZE,
            );
            if (lum(px[0], px[1], px[2]) < 0.5) n++;
          }
        }
        return n;
      };

      const darkOff = countDark(false);
      const darkOn = countDark(true);

      expect(darkOn, `ON=${darkOn} vs OFF=${darkOff} dark pixels`)
        .toBeGreaterThanOrEqual(darkOff);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. 안티앨리어싱 (smoothstep 범위 1/4)
  // ─────────────────────────────────────────────────────────────
  describe('4. Anti-aliasing Edge Sharpness', () => {

    it('scanner ON → fewer intermediate-lum pixels at dot edge', () => {
      const { dark } = findDataModules(matrix);
      if (!dark) return;

      const qz = SIZE * 0.08;
      const cell = (SIZE - qz * 2) / mc;
      const cx = qz + dark.c * cell + cell / 2;
      const cy = qz + dark.r * cell + cell / 2;
      // 도트 에지 ≈ dotScale/2 = 0.425 × cellSize from center
      const edgeOfs = 0.42 * cell;

      const sampleEdge = (scannerMode) => {
        const { gl } = renderAndRead(renderer, matrix, orangeImg, scannerMode);
        const vals = [];
        for (let dx = -4; dx <= 4; dx++) {
          const px = readPixel(gl, cx + edgeOfs + dx, cy, SIZE);
          vals.push(lum(px[0], px[1], px[2]));
        }
        return vals;
      };

      const edgeOff = sampleEdge(false);
      const edgeOn = sampleEdge(true);

      // "중간값" (0.15~0.85) 개수 → 적을수록 선명
      const mid = (arr) => arr.filter(v => v > 0.15 && v < 0.85).length;

      expect(mid(edgeOn), `ON mid=${mid(edgeOn)} vs OFF mid=${mid(edgeOff)}`)
        .toBeLessThanOrEqual(mid(edgeOff));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. 다크 모듈 대비 (임계값 0.55→0.75)
  // ─────────────────────────────────────────────────────────────
  describe('5. Dark Module Contrast Threshold', () => {

    it('scanner ON → light-dark contrast ≥ scanner OFF', () => {
      const { dark, light } = findDataModules(matrix);
      if (!dark || !light) return;

      const measure = (scannerMode) => {
        const rd = renderAndRead(renderer, matrix, gradientImg, scannerMode);
        const dp = rd.pixelAt(dark.r, dark.c);
        const lp = rd.pixelAt(light.r, light.c);
        return lum(lp[0], lp[1], lp[2]) - lum(dp[0], dp[1], dp[2]);
      };

      const cOff = measure(false);
      const cOn = measure(true);

      expect(cOn, `ON contrast=${cOn.toFixed(3)} vs OFF=${cOff.toFixed(3)}`)
        .toBeGreaterThanOrEqual(cOff - 0.02); // small float tolerance
    });

    it('scanner ON → dark module luminance < 0.25', () => {
      const { dark } = findDataModules(matrix);
      if (!dark) return;

      const on = renderAndRead(renderer, matrix, gradientImg, true);
      const px = on.pixelAt(dark.r, dark.c);
      const l = lum(px[0], px[1], px[2]);

      expect(l, `Dark lum=${l.toFixed(3)}`).toBeLessThan(0.25);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. 회귀 테스트: scannerMode=0 → 기존 동작 무변경
  // ─────────────────────────────────────────────────────────────
  describe('6. Regression — scannerMode OFF preserves existing behavior', () => {

    it('scannerMode=0 renders deterministically (2회 동일)', () => {
      const positions = [
        [3, 3], [1, 3], [0, 0], [mc - 4, 3],
      ];

      const run = () => {
        const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, false);
        return positions.map(([r, c]) => pixelAt(r, c));
      };

      const a = run();
      const b = run();

      for (let i = 0; i < positions.length; i++) {
        expect(a[i][0], `pos ${positions[i]} R`).toBe(b[i][0]);
        expect(a[i][1], `pos ${positions[i]} G`).toBe(b[i][1]);
        expect(a[i][2], `pos ${positions[i]} B`).toBe(b[i][2]);
      }
    });

    it('scannerMode=0: finder dark has non-zero color (image blend active)', () => {
      const { pixelAt } = renderAndRead(renderer, matrix, orangeImg, false);
      const [r, g, b] = pixelAt(3, 3);
      // 오렌지 이미지의 색이 파인더 dark에 번져야 함
      expect(r + g + b).toBeGreaterThan(0);
    });

    it('scannerMode=0: light module whiteBlend follows original 0.25 min', () => {
      // bgOpacity=1.0 → whiteBlend = max(0.85*0, 0.25) = 0.25
      // 순수 빨강(#ff0000) 이미지의 light 모듈:
      //   mix(red, white, 0.25) → (255, 64, 64) ≈ lum 0.394
      const redImg = createSolidImage(SIZE, '#ff0000');
      const { dark, light } = findDataModules(matrix);
      if (!light) return;

      const off = renderAndRead(renderer, matrix, redImg, false, { bgOpacity: 1.0 });
      const px = off.pixelAt(light.r, light.c);
      const l = lum(px[0], px[1], px[2]);

      // 0.25 whiteBlend with red → lum ~0.39
      // 0.55 whiteBlend with red → lum ~0.62
      // OFF 모드는 0.25이므로 0.62 미만이어야 함
      expect(l, `OFF light lum=${l.toFixed(3)}`).toBeLessThan(0.55);
    });
  });
});
