import { useCallback, useRef, useEffect } from 'react';
import { generateQR } from '../qr/index.js';
import { WebGLRenderer } from '../webgl/renderer.js';

// ─── moduleStyle 문자열 → 숫자 변환 ─────────────────────────────
function moduleStyleToNum(style) {
  if (style === 'circle') return 0;
  if (style === 'rounded') return 1;
  return 2; // square
}

// ─── blendMode 문자열 → 숫자 변환 ───────────────────────────────
function blendModeToNum(mode) {
  if (mode === 'multiply') return 0;
  if (mode === 'overlay') return 1;
  return 2; // darken
}

// ─── hex color → [r, g, b] 정규화 (0~1) ────────────────────────
function hexToNormalized(hex) {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

// ─── Canvas 2D 폴백 렌더링 (WebGL 불가 시) ───────────────────────
function renderWithCanvas2D(ctx, matrix, image, options) {
  const {
    size, qrSize, quietZone, cellSize, dotScale, moduleStyle,
    colorMode, solidDarkColor, bgOpacity, dotOpacity,
  } = options;

  // 배경: 흰색
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // 이미지가 있으면 전체 배경에 그리기
  if (image) {
    ctx.globalAlpha = bgOpacity;
    ctx.drawImage(image, 0, 0, size, size);
    ctx.globalAlpha = 1.0;
  }

  const dotRadius = (cellSize * dotScale) / 2;

  for (let row = 0; row < qrSize; row++) {
    for (let col = 0; col < qrSize; col++) {
      if (!matrix[row][col]) continue;

      // Finder 패턴은 별도 처리
      if ((row < 7 && col < 7) ||
          (row < 7 && col >= qrSize - 7) ||
          (row >= qrSize - 7 && col < 7)) {
        continue;
      }

      const x = quietZone + col * cellSize;
      const y = quietZone + row * cellSize;
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;

      ctx.globalAlpha = dotOpacity;
      ctx.fillStyle = solidDarkColor;

      if (moduleStyle === 'circle') {
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (moduleStyle === 'rounded') {
        const pad = cellSize * (1 - dotScale) / 2;
        const r = dotRadius * 0.45;
        const w = cellSize * dotScale;
        ctx.beginPath();
        ctx.moveTo(x + pad + r, y + pad);
        ctx.lineTo(x + pad + w - r, y + pad);
        ctx.quadraticCurveTo(x + pad + w, y + pad, x + pad + w, y + pad + r);
        ctx.lineTo(x + pad + w, y + pad + w - r);
        ctx.quadraticCurveTo(x + pad + w, y + pad + w, x + pad + w - r, y + pad + w);
        ctx.lineTo(x + pad + r, y + pad + w);
        ctx.quadraticCurveTo(x + pad, y + pad + w, x + pad, y + pad + w - r);
        ctx.lineTo(x + pad, y + pad + r);
        ctx.quadraticCurveTo(x + pad, y + pad, x + pad + r, y + pad);
        ctx.closePath();
        ctx.fill();
      } else {
        const pad = cellSize * (1 - dotScale) / 2;
        ctx.fillRect(x + pad, y + pad, cellSize * dotScale, cellSize * dotScale);
      }
    }
  }

  // Finder 패턴 (간단 Canvas 2D)
  const finderPositions = [
    [0, 0], [0, qrSize - 7], [qrSize - 7, 0],
  ];
  for (const [sr, sc] of finderPositions) {
    const fx = quietZone + sc * cellSize;
    const fy = quietZone + sr * cellSize;
    const sz = 7 * cellSize;

    ctx.globalAlpha = dotOpacity;
    ctx.fillStyle = solidDarkColor;

    // 외곽
    ctx.strokeStyle = solidDarkColor;
    ctx.lineWidth = cellSize;
    ctx.strokeRect(fx + cellSize / 2, fy + cellSize / 2, sz - cellSize, sz - cellSize);

    // 내부 빈 공간은 배경색
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 1.0;
    ctx.fillRect(fx + cellSize, fy + cellSize, cellSize * 5, cellSize * 5);

    // 중앙 점
    ctx.fillStyle = solidDarkColor;
    ctx.globalAlpha = dotOpacity;
    ctx.fillRect(fx + cellSize * 2, fy + cellSize * 2, cellSize * 3, cellSize * 3);
  }

  ctx.globalAlpha = 1.0;
}

// ─── 메인 훅 ─────────────────────────────────────────────────────
export function useArtisticQR() {
  const webglRef = useRef(null);
  const webglSupported = useRef(null);

  useEffect(() => {
    try {
      webglRef.current = new WebGLRenderer();
      webglSupported.current = true;
    } catch {
      webglSupported.current = false;
    }
    return () => {
      webglRef.current?.dispose();
    };
  }, []);

  const generate = useCallback(({ canvas, text, logoImg, options = {} }) => {
    if (!canvas || !text) return;

    const {
      size = 500,
      moduleStyle = 'circle',
      errorCorrection = 'H',
      dotScale = 0.85,
      eyeStyle = 'circle',
      colorMode = 'image',
      solidDarkColor = '#000000',
      bgOpacity = 0.7,
      dotOpacity = 0.85,
      blendMode = 'multiply',
      adaptiveSize = 0.5,
      finderColor = '#000000',
      useFinderColor = false,
    } = options;

    // 1. QR 매트릭스 생성 (직접 구현 엔진)
    const matrix = generateQR(text, { errorCorrectionLevel: errorCorrection });
    const qrSize = matrix.length;

    // 모듈당 최소 8px 보장 (스캔 신뢰도)
    const minPxPerModule = 8;
    const minSize = Math.ceil(qrSize * minPxPerModule / 0.84);
    const actualSize = Math.max(size, minSize);

    canvas.width = actualSize;
    canvas.height = actualSize;
    const ctx = canvas.getContext('2d');

    // 흰 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, actualSize, actualSize);

    const quietZone = actualSize * 0.08;
    const qrDrawSize = actualSize - quietZone * 2;
    const cellSize = qrDrawSize / qrSize;

    // 2. QR + 이미지 픽셀 합성
    if (webglSupported.current && webglRef.current) {
      // ── WebGL 경로: 이미지를 캔버스 크기로 리사이즈
      let imageForTexture = null;
      if (logoImg) {
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = actualSize;
        tmpCanvas.height = actualSize;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.fillStyle = '#ffffff';
        tmpCtx.fillRect(0, 0, actualSize, actualSize);

        // 비율 유지 + QR 영역 내에 전체 이미지 배치 (quiet zone 제외)
        const imgW = logoImg.naturalWidth;
        const imgH = logoImg.naturalHeight;
        const qzPx = actualSize * 0.08;
        const qrArea = actualSize - qzPx * 2; // QR 모듈이 실제로 그려지는 영역
        const scale = Math.min(qrArea / imgW, qrArea / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const drawX = qzPx + (qrArea - drawW) / 2;
        const drawY = qzPx + (qrArea - drawH) / 2;
        tmpCtx.drawImage(logoImg, drawX, drawY, drawW, drawH);

        imageForTexture = tmpCanvas;
      }

      const webglCanvas = webglRef.current.render({
        qrMatrix: matrix,
        image: imageForTexture,
        options: {
          size: actualSize,
          moduleCount: qrSize,
          quietZone: 0.08,
          dotScale,
          moduleStyle: moduleStyleToNum(moduleStyle),
          colorMode: colorMode === 'solid' ? 1 : 0,
          solidColor: hexToNormalized(solidDarkColor),
          eyeStyle: eyeStyle === 'circle' ? 0 : 1,
          bgOpacity,
          dotOpacity,
          blendMode: blendModeToNum(blendMode),
          adaptiveSize,
          finderColor: hexToNormalized(finderColor),
          useFinderColor: useFinderColor ? 1 : 0,
        },
      });

      ctx.drawImage(webglCanvas, 0, 0);
    } else {
      // ── Canvas 2D 폴백
      renderWithCanvas2D(ctx, matrix, logoImg, {
        size: actualSize, qrSize, quietZone, cellSize, dotScale, moduleStyle,
        colorMode, solidDarkColor, bgOpacity, dotOpacity,
      });
    }
  }, []);

  return { generate };
}
