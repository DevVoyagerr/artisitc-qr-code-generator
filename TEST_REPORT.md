# Scanner Mode Test Report

## 테스트 환경

| 항목 | 값 |
|------|-----|
| 테스트 프레임워크 | Vitest 4.0.18 (Browser Mode) |
| 브라우저 | Playwright Chromium 145.0.7632.6 |
| QR 디코더 | ZXing WASM 2.2.4, jsQR 1.4.0 |
| 렌더링 | WebGL (실제 GPU, preserveDrawingBuffer) |
| QR 텍스트 | `https://example.com` |
| 오류 정정 | H (30%) |
| 출력 크기 | 500px (pixel tests), 600px (decode tests) |

## 테스트 방식

### 1. 픽셀 레벨 셰이더 검증 (`scanner-mode.test.js`)

WebGL `gl.readPixels()`로 렌더링 결과의 특정 좌표 픽셀값을 직접 읽어 검증.

- **입력**: QR 매트릭스 + 테스트 이미지 (단색/그라데이션/흰색)
- **방법**: scannerMode ON/OFF 두 조건으로 렌더링 후 동일 좌표의 RGB 비교
- **측정 지표**: RGB값, BT.601 luminance, dark pixel 개수, 중간값 픽셀 수

### 2. 디코더 기반 디코딩 검증 (`decode-verification.test.js`)

실제 QR 디코더로 렌더링된 이미지를 디코딩하여 원본 텍스트 복원 여부 확인.

- **입력**: WebGL canvas → 2D canvas → `ImageData` 추출
- **ZXing Binarizer 4종**: `FixedThreshold`(GM72 동등), `GlobalHistogram`, `LocalAverage`, `BoolCast`
- **jsQR**: 독립 JS 디코더로 교차 검증
- **이미지 3종**: 대각선 그라데이션, 단색 오렌지(#ff6600), 고채도 체커 패턴

## 테스트 결과

```
 ✓ tests/scanner-mode.test.js     (14 tests)  159ms
 ✓ tests/decode-verification.test.js (15 tests) 656ms

 Test Files  2 passed (2)
       Tests  29 passed (29)
    Duration  3.79s
```

### 1. 픽셀 레벨 검증 (14/14 PASS)

#### 1-1. 파인더 패턴 순수 흑백 (Critical)

| 테스트 | 조건 | 기준 | 결과 |
|--------|------|------|------|
| finder inner dark (3,3) | scanner ON + orange | R,G,B < 10 | **PASS** |
| finder outer dark (0,3) | scanner ON + orange | R,G,B < 10 | **PASS** |
| finder light ring (1,3) | scanner ON + orange | R,G,B > 245 | **PASS** |
| 3개 finder 모두 | scanner ON + orange | luminance < 0.05 | **PASS** |
| finder dark 이미지 블렌딩 | scanner OFF + orange | RGB sum > 5 | **PASS** |

#### 1-2. Light 모듈 밝기

| 테스트 | 기준 | 결과 |
|--------|------|------|
| ON luminance ≥ OFF luminance | data 영역 light 모듈 비교 | **PASS** |
| ON + bgOpacity=1.0 → lum > 0.55 | 최소 밝기 보장 | **PASS** |

#### 1-3. 적응형 도트 크기

| 테스트 | 기준 | 결과 |
|--------|------|------|
| ON dark pixel count ≥ OFF | 흰색 배경 + adaptiveSize=1.0 | **PASS** |

#### 1-4. 안티앨리어싱 엣지

| 테스트 | 기준 | 결과 |
|--------|------|------|
| ON 중간값 픽셀 수 ≤ OFF | 도트 에지 ±4px 샘플링, lum 0.15~0.85 | **PASS** |

#### 1-5. 다크 모듈 대비

| 테스트 | 기준 | 결과 |
|--------|------|------|
| ON contrast ≥ OFF contrast | light-dark luminance 차이 | **PASS** |
| ON dark lum < 0.25 | 다크 모듈 밝기 상한 | **PASS** |

#### 1-6. 회귀 테스트

| 테스트 | 기준 | 결과 |
|--------|------|------|
| scannerMode=0 2회 렌더 동일 | 4개 위치 RGB 완전 일치 | **PASS** |
| OFF finder에 이미지 색상 존재 | RGB sum > 0 | **PASS** |
| OFF light whiteBlend = 0.25 | lum < 0.55 (0.55 min 아님 확인) | **PASS** |

### 2. 디코더 디코딩 검증 (15/15 PASS)

#### 2-A. Scanner ON 필수 디코드

| 이미지 | 디코더 | Binarizer | 결과 |
|--------|--------|-----------|------|
| gradient | ZXing | **FixedThreshold** | **PASS** |
| gradient | ZXing | GlobalHistogram | **PASS** |
| checker | ZXing | FixedThreshold | **PASS** |
| solid orange | ZXing | FixedThreshold | **PASS** |
| solid orange (square 100%) | jsQR | 자체 | **PASS** |

#### 2-B. 모듈 스타일별

| 스타일 | 디코더 | 결과 |
|--------|--------|------|
| circle dots | ZXing FixedThreshold | **PASS** |
| rounded dots | ZXing FixedThreshold | **PASS** |
| square dots | ZXing FixedThreshold | **PASS** |

#### 2-C. Eye 스타일별

| 스타일 | 디코더 | 결과 |
|--------|--------|------|
| circle eye | ZXing FixedThreshold | **PASS** |
| square eye | ZXing FixedThreshold | **PASS** |

#### 2-D. Scanner ON vs OFF 비교

| 디코더 | Binarizer | ON 성공 ≥ OFF 성공 | 결과 |
|--------|-----------|---------------------|------|
| ZXing | FixedThreshold | 3개 이미지 비교 | **PASS** |
| ZXing | GlobalHistogram | 3개 이미지 비교 | **PASS** |
| jsQR | 자체 | 3개 이미지 비교 | **PASS** |

#### 2-E. 극한 조건

| 조건 | 디코더 | 결과 |
|------|--------|------|
| bgOpacity=1.0 + adaptiveSize=1.0 + checker | ZXing FixedThreshold | **PASS** |
| gradient + 4개 binarizer 전부 | ZXing ALL | **≥3/4 PASS** |

## 발견 사항

### ZXing FixedThreshold = GM72 시뮬레이션

ZXing의 `FixedThreshold` binarizer는 GM72 산업용 스캐너와 동일한 **단순 임계값 이진화** 알고리즘을 사용합니다. 이 binarizer에서 scanner mode ON이 **모든 이미지·스타일 조합에서 100% 디코드 성공**했습니다.

### jsQR의 한계

jsQR은 rounded dots + 85% scale 같은 아티스틱 스타일에서 디코드 실패합니다. 이는 scanner mode의 문제가 아니라 **jsQR 디코더가 비표준 도트 형태에 약한 것**입니다. square dots 100% scale에서는 정상 디코드됩니다.

### 실기기 테스트 필요

소프트웨어 디코더 검증은 실기기 테스트를 **대체하지 못합니다**. 인쇄 품질, 용지 재질, 조명 조건, GM72 펌웨어 특성 등은 소프트웨어로 시뮬레이션할 수 없습니다. 단, ZXing FixedThreshold 전수 통과는 **실기기 성공 가능성이 높다**는 근거입니다.

## 테스트 실행 방법

```bash
# 의존성 설치 (최초 1회)
npm install
npx playwright install chromium

# 테스트 실행
npm test
```
