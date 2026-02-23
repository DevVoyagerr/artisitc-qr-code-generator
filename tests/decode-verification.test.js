/**
 * Decode Verification — ZXing WASM + jsQR 이중 디코더 검증
 *
 * GM72 산업용 스캐너를 소프트웨어로 시뮬레이션:
 * - ZXing (FixedThreshold binarizer) → GM72와 동일한 단순 임계값 이진화
 * - ZXing (GlobalHistogram binarizer) → 글로벌 히스토그램 기반 이진화
 * - jsQR → 독립 디코더로 교차 검증
 *
 * 실제 Chromium WebGL에서 렌더링 → ImageData 추출 → 디코드 검증
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readBarcodes } from 'zxing-wasm/reader';
import jsQR from 'jsqr';
import { WebGLRenderer } from '../src/webgl/renderer.js';
import { generateQR } from '../src/qr/index.js';

// ─── Constants ───────────────────────────────────────────────────
const SIZE = 600;
const TEXT = 'https://example.com';

// ─── Helpers ─────────────────────────────────────────────────────

function createSolidImage(size, cssColor) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, size, size);
  return c;
}

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

/** 고채도 패턴 이미지 — 스캐너에 가장 불리한 조건 */
function createCheckerImage(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  const blockSize = size / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = colors[(i + j) % colors.length];
      ctx.fillRect(i * blockSize, j * blockSize, blockSize, blockSize);
    }
  }
  return c;
}

/** WebGL 렌더링 후 ImageData 추출 */
function renderToImageData(renderer, matrix, image, scannerMode, extra = {}) {
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

  // WebGL canvas → 2D canvas → ImageData
  const c2d = document.createElement('canvas');
  c2d.width = SIZE;
  c2d.height = SIZE;
  const ctx = c2d.getContext('2d');
  ctx.drawImage(renderer.canvas, 0, 0);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

// ─── Decoder wrappers ────────────────────────────────────────────

/** ZXing decode (특정 binarizer) */
async function decodeZXing(imageData, binarizer = 'LocalAverage') {
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

/** jsQR decode */
function decodeJsQR(imageData) {
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result ? result.data : null;
}

// ─── Tests ───────────────────────────────────────────────────────
describe('Decode Verification — ZXing + jsQR', () => {
  let renderer;
  let matrix;
  let gradientImg;
  let orangeImg;
  let checkerImg;

  beforeAll(() => {
    renderer = new WebGLRenderer();
    matrix = generateQR(TEXT, { errorCorrectionLevel: 'H' });
    gradientImg = createGradientImage(SIZE);
    orangeImg = createSolidImage(SIZE, '#ff6600');
    checkerImg = createCheckerImage(SIZE);
  });

  afterAll(() => {
    renderer.dispose();
  });

  // ─────────────────────────────────────────────────────────────
  // A. Scanner Mode ON — 반드시 디코드 성공
  // ─────────────────────────────────────────────────────────────
  describe('A. Scanner ON — Must Decode', () => {

    it('ZXing (FixedThreshold) + gradient image → 디코드 성공', async () => {
      const imageData = renderToImageData(renderer, matrix, gradientImg, true);
      const decoded = await decodeZXing(imageData, 'FixedThreshold');
      expect(decoded, 'ZXing FixedThreshold failed to decode').toBe(TEXT);
    });

    it('ZXing (GlobalHistogram) + gradient image → 디코드 성공', async () => {
      const imageData = renderToImageData(renderer, matrix, gradientImg, true);
      const decoded = await decodeZXing(imageData, 'GlobalHistogram');
      expect(decoded, 'ZXing GlobalHistogram failed to decode').toBe(TEXT);
    });

    it('jsQR + square dots 100% scale → 디코드 성공', () => {
      // jsQR은 rounded dots + gap에 약함 (아티스틱 스타일 특성)
      // square 100% scale = 가장 전통적 QR 형태 → jsQR에서도 디코드
      const imageData = renderToImageData(renderer, matrix, orangeImg, true, {
        moduleStyle: 2,  // square
        dotScale: 1.0,   // no gap
      });
      const decoded = decodeJsQR(imageData);
      expect(decoded, 'jsQR failed even with square 100% dots').toBe(TEXT);
    });

    it('ZXing (FixedThreshold) + checker pattern → 디코드 성공', async () => {
      const imageData = renderToImageData(renderer, matrix, checkerImg, true);
      const decoded = await decodeZXing(imageData, 'FixedThreshold');
      expect(decoded, 'ZXing FixedThreshold failed on checker').toBe(TEXT);
    });

    it('ZXing (FixedThreshold) + solid orange → 디코드 성공', async () => {
      const imageData = renderToImageData(renderer, matrix, orangeImg, true);
      const decoded = await decodeZXing(imageData, 'FixedThreshold');
      expect(decoded, 'ZXing FixedThreshold failed on orange').toBe(TEXT);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // B. 모듈 스타일별 호환성
  // ─────────────────────────────────────────────────────────────
  describe('B. Module Styles — Scanner ON', () => {
    const styles = [
      { name: 'circle', value: 0 },
      { name: 'rounded', value: 1 },
      { name: 'square', value: 2 },
    ];

    for (const { name, value } of styles) {
      it(`ZXing (FixedThreshold) + ${name} dots → 디코드 성공`, async () => {
        const imageData = renderToImageData(renderer, matrix, gradientImg, true, {
          moduleStyle: value,
        });
        const decoded = await decodeZXing(imageData, 'FixedThreshold');
        expect(decoded, `${name} style failed`).toBe(TEXT);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // C. Eye 스타일별 호환성
  // ─────────────────────────────────────────────────────────────
  describe('C. Eye Styles — Scanner ON', () => {
    const eyeStyles = [
      { name: 'circle', value: 0 },
      { name: 'square', value: 1 },
    ];

    for (const { name, value } of eyeStyles) {
      it(`ZXing (FixedThreshold) + ${name} eye → 디코드 성공`, async () => {
        const imageData = renderToImageData(renderer, matrix, gradientImg, true, {
          eyeStyle: value,
        });
        const decoded = await decodeZXing(imageData, 'FixedThreshold');
        expect(decoded, `${name} eye failed`).toBe(TEXT);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // D. Scanner ON vs OFF 비교 — 핵심 가치 증명
  // ─────────────────────────────────────────────────────────────
  describe('D. Scanner ON vs OFF — Value Proof', () => {

    it('FixedThreshold: ON 디코드 성공 횟수 ≥ OFF', async () => {
      const images = [gradientImg, orangeImg, checkerImg];
      let onSuccess = 0;
      let offSuccess = 0;

      for (const img of images) {
        const imgOn = renderToImageData(renderer, matrix, img, true);
        const imgOff = renderToImageData(renderer, matrix, img, false);

        const decOn = await decodeZXing(imgOn, 'FixedThreshold');
        const decOff = await decodeZXing(imgOff, 'FixedThreshold');

        if (decOn === TEXT) onSuccess++;
        if (decOff === TEXT) offSuccess++;
      }

      expect(onSuccess, `ON=${onSuccess} vs OFF=${offSuccess}`)
        .toBeGreaterThanOrEqual(offSuccess);

      // scanner ON은 최소 2/3 이상 성공해야
      expect(onSuccess, `ON only decoded ${onSuccess}/3`).toBeGreaterThanOrEqual(2);
    });

    it('GlobalHistogram: ON 디코드 성공 횟수 ≥ OFF', async () => {
      const images = [gradientImg, orangeImg, checkerImg];
      let onSuccess = 0;
      let offSuccess = 0;

      for (const img of images) {
        const imgOn = renderToImageData(renderer, matrix, img, true);
        const imgOff = renderToImageData(renderer, matrix, img, false);

        const decOn = await decodeZXing(imgOn, 'GlobalHistogram');
        const decOff = await decodeZXing(imgOff, 'GlobalHistogram');

        if (decOn === TEXT) onSuccess++;
        if (decOff === TEXT) offSuccess++;
      }

      expect(onSuccess, `ON=${onSuccess} vs OFF=${offSuccess}`)
        .toBeGreaterThanOrEqual(offSuccess);
    });

    it('jsQR: ON 디코드 성공 횟수 ≥ OFF', () => {
      const images = [gradientImg, orangeImg, checkerImg];
      let onSuccess = 0;
      let offSuccess = 0;

      for (const img of images) {
        const imgOn = renderToImageData(renderer, matrix, img, true);
        const imgOff = renderToImageData(renderer, matrix, img, false);

        const decOn = decodeJsQR(imgOn);
        const decOff = decodeJsQR(imgOff);

        if (decOn === TEXT) onSuccess++;
        if (decOff === TEXT) offSuccess++;
      }

      expect(onSuccess, `ON=${onSuccess} vs OFF=${offSuccess}`)
        .toBeGreaterThanOrEqual(offSuccess);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // E. 극한 조건: bgOpacity + adaptiveSize 최대
  // ─────────────────────────────────────────────────────────────
  describe('E. Stress Test — Worst Case Scenarios', () => {

    it('bgOpacity=1.0 + adaptiveSize=1.0 + checker → Scanner ON 디코드', async () => {
      const imageData = renderToImageData(renderer, matrix, checkerImg, true, {
        bgOpacity: 1.0,
        adaptiveSize: 1.0,
      });
      const decoded = await decodeZXing(imageData, 'FixedThreshold');
      expect(decoded, 'Stress test: FixedThreshold failed').toBe(TEXT);
    });

    it('모든 binarizer에서 Scanner ON + gradient 디코드 성공', async () => {
      const imageData = renderToImageData(renderer, matrix, gradientImg, true);
      const binarizers = ['LocalAverage', 'GlobalHistogram', 'FixedThreshold', 'BoolCast'];
      const results = {};

      for (const b of binarizers) {
        results[b] = await decodeZXing(imageData, b);
      }

      // 최소 3/4 binarizer에서 성공
      const successCount = Object.values(results).filter(r => r === TEXT).length;
      expect(successCount, `${successCount}/4 binarizers succeeded: ${JSON.stringify(results)}`)
        .toBeGreaterThanOrEqual(3);
    });
  });
});
