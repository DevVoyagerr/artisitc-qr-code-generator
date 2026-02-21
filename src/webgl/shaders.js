// ─── WebGL 셰이더 소스 ──────────────────────────────────────────

export const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = (a_position + 1.0) / 2.0;
  v_texCoord.y = 1.0 - v_texCoord.y;
}
`;

export const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_texCoord;

uniform sampler2D u_image;
uniform sampler2D u_qrMatrix;
uniform float u_moduleCount;
uniform float u_quietZone;
uniform float u_dotScale;
uniform float u_moduleStyle;    // 0=circle, 1=rounded, 2=square
uniform float u_colorMode;      // 0=image, 1=solid
uniform vec3 u_solidColor;
uniform float u_eyeStyle;       // 0=circle, 1=square

uniform float u_bgOpacity;      // 0~1: 밝은 모듈에서 이미지 노출도
uniform float u_dotOpacity;     // 0.3~1: 어두운 도트 불투명도
uniform float u_blendMode;      // 0=multiply, 1=overlay, 2=darken

// 새 uniform
uniform float u_adaptiveSize;   // 0=비활성, 1=전체 적응형 도트 크기
uniform vec3 u_finderColor;     // 사용자 지정 finder 색상
uniform float u_useFinderColor; // 0=이미지 자동, 1=사용자 지정

// ─── 밝기 계산 ─────────────────────────────────────────────
float getLuminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}


// ─── SDF 모듈 형태 ─────────────────────────────────────────
float moduleSDF(vec2 cellUV, float style, float dotScale) {
  vec2 center = vec2(0.5);
  vec2 d = abs(cellUV - center);
  float halfDot = dotScale * 0.5;

  if (style < 0.5) {
    // circle
    return length(cellUV - center) - halfDot;
  } else if (style < 1.5) {
    // rounded rect
    float radius = halfDot * 0.45;
    vec2 q = d - vec2(halfDot - radius);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  } else {
    // square
    return max(d.x, d.y) - halfDot;
  }
}

// ─── Finder 패턴 판별 ──────────────────────────────────────
int getFinderIndex(vec2 cell, float mc) {
  if (cell.x >= 0.0 && cell.x <= 6.0 && cell.y >= 0.0 && cell.y <= 6.0)
    return 0;
  if (cell.x >= mc - 7.0 && cell.x <= mc - 1.0 && cell.y >= 0.0 && cell.y <= 6.0)
    return 1;
  if (cell.x >= 0.0 && cell.x <= 6.0 && cell.y >= mc - 7.0 && cell.y <= mc - 1.0)
    return 2;
  return -1;
}

// ─── Finder 패턴 내부 렌더링 (순수 흑백) ─────────────────────
vec4 renderFinder(vec2 cellIndex, vec2 cellUV, float mc, float eyeStyle) {
  vec2 localCell;
  int idx = getFinderIndex(cellIndex, mc);
  if (idx == 0) {
    localCell = cellIndex;
  } else if (idx == 1) {
    localCell = vec2(cellIndex.x - (mc - 7.0), cellIndex.y);
  } else {
    localCell = vec2(cellIndex.x, cellIndex.y - (mc - 7.0));
  }

  vec2 finderUV = (localCell + cellUV) / 7.0;
  vec2 center = vec2(0.5);
  vec2 diff = finderUV - center;

  // 순수 흑백 (사용자 커스텀 색상 지원)
  vec3 finderDark;
  if (u_useFinderColor > 0.5) {
    finderDark = u_finderColor;
  } else {
    finderDark = vec3(0.0);  // 순수 검정
  }
  vec3 finderLight = vec3(1.0);  // 순수 흰색

  float dist;
  if (eyeStyle < 0.5) {
    // Circle 스타일 — 1:1:3:1:1 비율 (3.5/7, 2.5/7, 1.5/7)
    dist = length(diff);
    if (dist > 0.5) return vec4(finderLight, 1.0);
    if (dist > 0.357) return vec4(finderDark, 1.0);
    if (dist > 0.214) return vec4(finderLight, 1.0);
    return vec4(finderDark, 1.0);
  } else {
    // Square 스타일 — 1:1:3:1:1 비율
    vec2 ad = abs(diff);
    float boxDist = max(ad.x, ad.y);
    if (boxDist > 0.5) return vec4(finderLight, 1.0);
    if (boxDist > 0.357) return vec4(finderDark, 1.0);
    if (boxDist > 0.214) return vec4(finderLight, 1.0);
    return vec4(finderDark, 1.0);
  }
}

void main() {
  vec2 uv = v_texCoord;

  float qzStart = u_quietZone;
  float qzEnd = 1.0 - u_quietZone;

  // 이미지 색상 샘플링 (quiet zone 포함 전체에서 사용)
  vec3 imageColor = texture2D(u_image, uv).rgb;

  // quiet zone 바깥 → 순수 흰색 (QR 스캐너 인식 필수)
  if (uv.x < qzStart || uv.x > qzEnd || uv.y < qzStart || uv.y > qzEnd) {
    gl_FragColor = vec4(1.0);
    return;
  }

  // QR 그리드 좌표
  vec2 qrUV = (uv - qzStart) / (qzEnd - qzStart);
  vec2 cellPos = qrUV * u_moduleCount;
  vec2 cellIndex = floor(cellPos);
  vec2 cellUV = fract(cellPos);

  // ─── Finder 패턴 처리 (이미지 블렌딩) ────────────────────
  int finderIdx = getFinderIndex(cellIndex, u_moduleCount);
  if (finderIdx >= 0) {
    vec4 fc = renderFinder(cellIndex, cellUV, u_moduleCount, u_eyeStyle);
    float fcLum = getLuminance(fc.rgb);

    vec3 finderResult;
    if (fcLum < 0.5) {
      // dark 부분: 이미지 색상 유지하되 매우 어둡게 (파인더는 스캐너 감지 핵심)
      float fMaxC = max(max(imageColor.r, imageColor.g), imageColor.b);
      float fMinC = min(min(imageColor.r, imageColor.g), imageColor.b);
      vec3 fVivid = imageColor;
      if (fMaxC > 0.01 && fMaxC - fMinC > 0.01) {
        fVivid = imageColor - vec3(fMinC * 0.85);
        float fNewMax = max(max(fVivid.r, fVivid.g), fVivid.b);
        fVivid = fVivid * (fMaxC / fNewMax);
        fVivid = clamp(fVivid, 0.0, 1.0);
      }
      // 파인더 dark는 항상 밝기 0.25 이하로 강제 (스캐너 인식 보장)
      float fVividLum = getLuminance(fVivid);
      if (fVividLum > 0.01) {
        float fMaxLum = 0.25;
        if (fVividLum > fMaxLum) {
          fVivid = fVivid * (fMaxLum / fVividLum);
        }
      } else {
        fVivid = vec3(0.0);
      }
      finderResult = clamp(fVivid, 0.0, 1.0);
    } else {
      // light 부분: 최소 30% 흰색 (파인더 light는 약간 더 밝게)
      finderResult = mix(imageColor, vec3(1.0), max(0.85 * (1.0 - u_bgOpacity), 0.30));
    }

    gl_FragColor = vec4(finderResult, 1.0);
    return;
  }

  // ─── QR 매트릭스 샘플링 ──────────────────────────────────
  vec2 qrSampleUV = (cellIndex + 0.5) / u_moduleCount;
  float isDark = texture2D(u_qrMatrix, qrSampleUV).r;

  // ─── Light 모듈: 이미지를 흰색 방향으로 블렌딩 ──────────────
  // bgOpacity=0 → 85% 흰색, bgOpacity=1 → 최소 25% 흰색
  float whiteBlend = max(0.85 * (1.0 - u_bgOpacity), 0.25);
  vec3 lightColor = mix(imageColor, vec3(1.0), whiteBlend);

  if (isDark < 0.5) {
    gl_FragColor = vec4(lightColor, 1.0);
    return;
  }

  // ─── Dark 모듈: 이미지를 어둡게 ─────────────────────────────

  // 적응형 도트 크기
  float cellLum = getLuminance(imageColor);
  float scaleFactor = mix(1.0, mix(1.15, 0.7, cellLum), u_adaptiveSize);
  float adaptedScale = clamp(u_dotScale * scaleFactor, 0.5, 1.0);

  float sdf = moduleSDF(cellUV, u_moduleStyle, adaptedScale);

  // 안티앨리어싱
  float pixelSize = 1.0 / (u_moduleCount * (qzEnd - qzStart));
  float aa = smoothstep(pixelSize, -pixelSize, sdf);

  // 도트 바깥(갭) = light 색상
  if (aa <= 0.0) {
    gl_FragColor = vec4(lightColor, 1.0);
    return;
  }

  // 도트 색상 (이미지 원본 색상의 선명한 버전)
  vec3 dotColor;
  float lightLum = getLuminance(lightColor);
  if (u_colorMode > 0.5) {
    dotColor = u_solidColor;
  } else {
    // HSV 방식 채도 부스트: 색상(hue) 유지, 채도만 극대화
    float maxC = max(max(imageColor.r, imageColor.g), imageColor.b);
    float minC = min(min(imageColor.r, imageColor.g), imageColor.b);

    vec3 vivid = imageColor;
    if (maxC > 0.01 && maxC - minC > 0.01) {
      // 회색 성분 제거 → 순수한 색상만 남김
      vivid = imageColor - vec3(minC * 0.85);
      float newMax = max(max(vivid.r, vivid.g), vivid.b);
      vivid = vivid * (maxC / newMax); // 최대 밝기 유지
      vivid = clamp(vivid, 0.0, 1.0);
    }

    // 밝기 조절: lightColor와 최소 대비 0.55 확보
    float vividLum = getLuminance(vivid);
    if (lightLum - vividLum < 0.55 && vividLum > 0.01) {
      float targetLum = max(lightLum - 0.55, 0.05);
      vivid = vivid * (targetLum / vividLum);
    }
    dotColor = clamp(vivid, 0.0, 1.0);
  }

  // 도트를 light 위에 렌더링
  vec3 result = mix(lightColor, dotColor, aa * u_dotOpacity);
  gl_FragColor = vec4(result, 1.0);
}
`;
