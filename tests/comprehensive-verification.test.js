/**
 * Comprehensive Verification — ISO 18004, Print Simulation, Version/EC Coverage
 *
 * 실기기 없이 가능한 모든 소프트웨어 검증:
 * 1. ISO 18004 대비 비율 정량 측정
 * 2. Quiet zone 순수 흰색 검증
 * 3. 인쇄 시뮬레이션 (JPEG 압축, 해상도 축소, 가우시안 블러)
 * 4. QR 버전별 (짧은~긴 데이터) 디코드
 * 5. 오류 정정 레벨별 (L/M/Q/H) 디코드
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readBarcodes } from 'zxing-wasm/reader';
import { WebGLRenderer } from '../src/webgl/renderer.js';
import { generateQR } from '../src/qr/index.js';

// ─── Constants ───────────────────────────────────────────────────
const SIZE = 800;

// ─── Helpers ─────────────────────────────────────────────────────

function createGradientImage(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#ff4400');
  grad.addColorStop(0.33, '#ffcc00');
  grad.addColorStop(0.66, '#00cc44');
  grad.addColorStop(1, '#2244ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function createCheckerImage(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  const block = size / 4;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = colors[(i + j) % 4];
      ctx.fillRect(i * block, j * block, block, block);
    }
  return c;
}

/** WebGL 렌더 → 2D canvas 복사 */
function renderToCanvas(renderer, matrix, image, scannerMode, extra = {}) {
  const mc = matrix.length;
  renderer.render({
    qrMatrix: matrix,
    image,
    options: {
      size: SIZE,
      moduleCount: mc,
      quietZone: 0.08,
      dotScale: 0.85,
      moduleStyle: 1,
      colorMode: 0,
      solidColor: [0, 0, 0],
      eyeStyle: 0,
      bgOpacity: 1.0,
      dotOpacity: 1.0,
      blendMode: 0,
      adaptiveSize: 1.0,
      finderColor: [0, 0, 0],
      useFinderColor: 0,
      scannerMode: scannerMode ? 1 : 0,
      ...extra,
    },
  });
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  c.getContext('2d').drawImage(renderer.canvas, 0, 0);
  return c;
}

function getImageData(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
}

function lum(r, g, b) {
  return 0.299 * (r / 255) + 0.587 * (g / 255) + 0.114 * (b / 255);
}

/** ZXing decode (FixedThreshold = GM72 동등) */
async function decode(imageData, binarizer = 'FixedThreshold') {
  const results = await readBarcodes(imageData, {
    formats: ['QRCode'],
    tryHarder: true,
    tryRotate: false,
    tryInvert: false,
    tryDownscale: false,
    binarizer,
    isPure: false,
  });
  const valid = results.filter(r => r.isValid);
  return valid.length > 0 ? valid[0].text : null;
}

// ─── Degradation helpers (인쇄 시뮬레이션) ───────────────────────

/** JPEG 압축 후 재로딩 */
function degradeJpeg(canvas, quality) {
  return new Promise((resolve) => {
    const url = canvas.toDataURL('image/jpeg', quality);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.src = url;
  });
}

/** 해상도 축소 (downscale → upscale) */
function degradeDownscale(canvas, factor) {
  const sw = Math.round(canvas.width * factor);
  const sh = Math.round(canvas.height * factor);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  small.getContext('2d').drawImage(canvas, 0, 0, sw, sh);

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

/** 가우시안 블러 (잉크 번짐 시뮬레이션) */
function degradeBlur(canvas, px) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** 복합 열화: JPEG + 해상도 축소 + 블러 */
async function degradeCombined(canvas, jpegQuality, scaleFactor, blurPx) {
  const afterJpeg = await degradeJpeg(canvas, jpegQuality);
  const afterScale = degradeDownscale(afterJpeg, scaleFactor);
  return degradeBlur(afterScale, blurPx);
}

// ─── Contrast measurement ────────────────────────────────────────

/** data 영역 모듈의 평균 dark/light luminance 측정 */
function measureContrast(imageData, matrix) {
  const mc = matrix.length;
  const qz = imageData.width * 0.08;
  const cell = (imageData.width - qz * 2) / mc;
  const w = imageData.width;
  const d = imageData.data;

  const darkLums = [];
  const lightLums = [];

  for (let r = 9; r < mc - 9; r++) {
    for (let c = 9; c < mc - 9; c++) {
      const px = Math.floor(qz + c * cell + cell / 2);
      const py = Math.floor(qz + r * cell + cell / 2);
      const idx = (py * w + px) * 4;
      const l = lum(d[idx], d[idx + 1], d[idx + 2]);
      if (matrix[r][c]) darkLums.push(l);
      else lightLums.push(l);
    }
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgDark = avg(darkLums);
  const avgLight = avg(lightLums);

  return {
    avgDark,
    avgLight,
    ratio: avgLight / Math.max(avgDark, 0.001),
    pcs: avgLight - avgDark,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Comprehensive Verification', () => {
  let renderer;
  let gradientImg;
  let checkerImg;

  // 기본 매트릭스 (https://example.com, EC H)
  let matrix;
  const TEXT = 'https://example.com';

  beforeAll(() => {
    renderer = new WebGLRenderer();
    matrix = generateQR(TEXT, { errorCorrectionLevel: 'H' });
    gradientImg = createGradientImage(SIZE);
    checkerImg = createCheckerImage(SIZE);
  });

  afterAll(() => {
    renderer.dispose();
  });

  // ═══════════════════════════════════════════════════════════════
  // 1. ISO 18004 대비 비율 정량 측정
  // ═══════════════════════════════════════════════════════════════
  describe('1. ISO 18004 Contrast Ratio', () => {

    it('scanner ON: contrast ratio ≥ 3.0 (ISO 최소)', () => {
      const canvas = renderToCanvas(renderer, matrix, gradientImg, true);
      const { ratio, avgDark, avgLight } = measureContrast(getImageData(canvas), matrix);
      expect(ratio, `ratio=${ratio.toFixed(2)} (dark=${avgDark.toFixed(3)}, light=${avgLight.toFixed(3)})`)
        .toBeGreaterThanOrEqual(3.0);
    });

    it('scanner ON: contrast ratio ≥ 4.0 (ISO 권장)', () => {
      const canvas = renderToCanvas(renderer, matrix, gradientImg, true);
      const { ratio } = measureContrast(getImageData(canvas), matrix);
      expect(ratio, `ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.0);
    });

    it('scanner ON: PCS ≥ 0.37 (Print Contrast Signal)', () => {
      const canvas = renderToCanvas(renderer, matrix, gradientImg, true);
      const { pcs } = measureContrast(getImageData(canvas), matrix);
      expect(pcs, `PCS=${pcs.toFixed(3)}`).toBeGreaterThanOrEqual(0.37);
    });

    it('scanner ON contrast > scanner OFF contrast', () => {
      const canvasOn = renderToCanvas(renderer, matrix, gradientImg, true);
      const canvasOff = renderToCanvas(renderer, matrix, gradientImg, false);
      const on = measureContrast(getImageData(canvasOn), matrix);
      const off = measureContrast(getImageData(canvasOff), matrix);
      expect(on.ratio, `ON=${on.ratio.toFixed(2)} vs OFF=${off.ratio.toFixed(2)}`)
        .toBeGreaterThan(off.ratio);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. Quiet Zone 검증
  // ═══════════════════════════════════════════════════════════════
  describe('2. Quiet Zone — Pure White', () => {

    it('scanner ON: quiet zone 전체 luminance ≥ 0.99', () => {
      const canvas = renderToCanvas(renderer, matrix, gradientImg, true);
      const imgData = getImageData(canvas);
      const d = imgData.data;
      const qz = Math.floor(SIZE * 0.08);
      let minLum = 1.0;

      // 상단 quiet zone
      for (let y = 0; y < qz - 1; y++) {
        for (let x = 0; x < SIZE; x++) {
          const idx = (y * SIZE + x) * 4;
          const l = lum(d[idx], d[idx + 1], d[idx + 2]);
          minLum = Math.min(minLum, l);
        }
      }
      expect(minLum, `min luminance in top QZ = ${minLum.toFixed(4)}`).toBeGreaterThanOrEqual(0.99);
    });

    it('scanner OFF: quiet zone도 순수 흰색 (기존 동작 유지)', () => {
      const canvas = renderToCanvas(renderer, matrix, gradientImg, false);
      const imgData = getImageData(canvas);
      const d = imgData.data;
      const qz = Math.floor(SIZE * 0.08);
      let minLum = 1.0;

      // 좌측 quiet zone
      for (let y = qz; y < SIZE - qz; y++) {
        for (let x = 0; x < qz - 1; x++) {
          const idx = (y * SIZE + x) * 4;
          const l = lum(d[idx], d[idx + 1], d[idx + 2]);
          minLum = Math.min(minLum, l);
        }
      }
      expect(minLum, `min luminance in left QZ = ${minLum.toFixed(4)}`).toBeGreaterThanOrEqual(0.99);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. 인쇄 시뮬레이션
  // ═══════════════════════════════════════════════════════════════
  describe('3. Print Simulation', () => {
    let qrCanvas;

    beforeAll(() => {
      qrCanvas = renderToCanvas(renderer, matrix, gradientImg, true);
    });

    it('JPEG 70% 품질 → 디코드 성공', async () => {
      const degraded = await degradeJpeg(qrCanvas, 0.7);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'JPEG 70% failed').toBe(TEXT);
    });

    it('JPEG 50% 품질 → 디코드 성공', async () => {
      const degraded = await degradeJpeg(qrCanvas, 0.5);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'JPEG 50% failed').toBe(TEXT);
    });

    it('해상도 50% 축소 (300→150 dpi) → 디코드 성공', async () => {
      const degraded = degradeDownscale(qrCanvas, 0.5);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'Downscale 50% failed').toBe(TEXT);
    });

    it('해상도 25% 축소 (300→75 dpi) → 디코드 성공', async () => {
      const degraded = degradeDownscale(qrCanvas, 0.25);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'Downscale 25% failed').toBe(TEXT);
    });

    it('가우시안 블러 1px (잉크 번짐) → 디코드 성공', async () => {
      const degraded = degradeBlur(qrCanvas, 1);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'Blur 1px failed').toBe(TEXT);
    });

    it('가우시안 블러 2px → 디코드 성공', async () => {
      const degraded = degradeBlur(qrCanvas, 2);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'Blur 2px failed').toBe(TEXT);
    });

    it('복합 열화: JPEG 70% + 해상도 50% + 블러 1px → 디코드 성공', async () => {
      const degraded = await degradeCombined(qrCanvas, 0.7, 0.5, 1);
      const decoded = await decode(getImageData(degraded));
      expect(decoded, 'Combined degradation failed').toBe(TEXT);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. QR 버전별 (데이터 길이별)
  // ═══════════════════════════════════════════════════════════════
  describe('4. QR Versions — Various Data Lengths', () => {
    const testData = [
      { name: 'short (Version 1~2)', text: 'Hi' },
      { name: 'medium (Version 3~4)', text: 'https://example.com' },
      { name: 'long (Version 7+)', text: 'https://www.example.com/products/category/item-12345?ref=qrcode&utm_source=print&campaign=2024' },
    ];

    for (const { name, text } of testData) {
      it(`${name}: "${text.substring(0, 30)}..." → 디코드 성공`, async () => {
        const m = generateQR(text, { errorCorrectionLevel: 'H' });
        const canvas = renderToCanvas(renderer, m, gradientImg, true, {
          moduleCount: m.length,
        });
        const decoded = await decode(getImageData(canvas));
        expect(decoded, `${name} failed to decode`).toBe(text);
      });
    }

    it('모든 버전에서 JPEG 70% 인쇄 시뮬레이션 통과', async () => {
      let passed = 0;
      for (const { text } of testData) {
        const m = generateQR(text, { errorCorrectionLevel: 'H' });
        const canvas = renderToCanvas(renderer, m, gradientImg, true, {
          moduleCount: m.length,
        });
        const degraded = await degradeJpeg(canvas, 0.7);
        const decoded = await decode(getImageData(degraded));
        if (decoded === text) passed++;
      }
      expect(passed, `${passed}/${testData.length} versions passed JPEG test`)
        .toBe(testData.length);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. 오류 정정 레벨별
  // ═══════════════════════════════════════════════════════════════
  describe('5. Error Correction Levels', () => {
    const levels = ['L', 'M', 'Q', 'H'];

    for (const ec of levels) {
      it(`EC ${ec} → 디코드 성공`, async () => {
        const m = generateQR(TEXT, { errorCorrectionLevel: ec });
        const canvas = renderToCanvas(renderer, m, gradientImg, true, {
          moduleCount: m.length,
        });
        const decoded = await decode(getImageData(canvas));
        expect(decoded, `EC ${ec} failed`).toBe(TEXT);
      });
    }

    it('모든 EC 레벨에서 복합 열화 통과', async () => {
      let passed = 0;
      for (const ec of levels) {
        const m = generateQR(TEXT, { errorCorrectionLevel: ec });
        const canvas = renderToCanvas(renderer, m, gradientImg, true, {
          moduleCount: m.length,
        });
        const degraded = await degradeCombined(canvas, 0.7, 0.5, 1);
        const decoded = await decode(getImageData(degraded));
        if (decoded === TEXT) passed++;
      }
      expect(passed, `${passed}/${levels.length} EC levels passed combined degradation`)
        .toBe(levels.length);
    });
  });
});
