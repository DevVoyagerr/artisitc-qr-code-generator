import { useState, useRef, useCallback } from 'react';
import { useArtisticQR } from '../hooks/useArtisticQR';
import './ArtisticQRGenerator.css';

const DEFAULT_OPTIONS = {
  size: 800,
  moduleStyle: 'rounded',      // 둥근 도트
  errorCorrection: 'H',
  dotScale: 1.0,               // 셀 전체 채움
  eyeStyle: 'circle',          // 원형 파인더
  colorMode: 'image',          // 'image' | 'solid'
  solidDarkColor: '#000000',
  bgOpacity: 1.0,              // 배경 노출도 100%
  dotOpacity: 1.0,
  blendMode: 'overlay',        // 'multiply' | 'overlay' | 'darken'
  adaptiveSize: 1.0,           // 전체 적응형 도트 크기
  finderColor: '#cc0000',
  useFinderColor: false,
};

export default function ArtisticQRGenerator() {
  const canvasRef = useRef(null);
  const { generate } = useArtisticQR();

  const [text, setText] = useState('https://example.com');
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleLogoChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setLogoImg(img);
      // 이미지 긴 변 기준, 최소 800px
      const naturalSize = Math.max(img.naturalWidth, img.naturalHeight);
      const autoSize = Math.min(Math.max(naturalSize, 800), 4096);
      setOptions(prev => ({ ...prev, size: Math.round(autoSize / 50) * 50 }));
    };
    img.src = url;
  }, []);

  const handleOptionChange = useCallback((key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    try {
      generate({ canvas: canvasRef.current, text: text.trim(), logoImg, options });
      setGenerated(true);
    } catch (err) {
      console.error('QR 생성 실패:', err);
      alert('QR 코드 생성에 실패했습니다: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [text, logoImg, options, generate]);

  const handleDownload = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'artistic-qr.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    handleLogoChange({ target: { files: [file] } });
  }, [handleLogoChange]);

  return (
    <div className="aqr-container">
      <h1 className="aqr-title">Artistic QR Code Generator</h1>
      <p className="aqr-subtitle">QR 코드와 이미지를 합성하여 아티스틱 QR을 만드세요</p>

      <div className="aqr-layout">
        {/* ── 설정 패널 ── */}
        <div className="aqr-panel">

          {/* URL */}
          <div className="aqr-section">
            <label className="aqr-label">QR 코드 내용 (URL 또는 텍스트)</label>
            <input
              className="aqr-input"
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="https://your-website.com"
            />
          </div>

          {/* 배경 이미지 업로드 */}
          <div className="aqr-section">
            <label className="aqr-label">배경 이미지</label>
            <div
              className={`aqr-dropzone ${logoPreview ? 'has-image' : ''}`}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('logo-input').click()}
            >
              {logoPreview ? (
                <img src={logoPreview} alt="배경 미리보기" className="aqr-preview-img" />
              ) : (
                <div className="aqr-dropzone-placeholder">
                  <span className="aqr-upload-icon">🖼</span>
                  <p>클릭하거나 이미지를 드래그하세요</p>
                  <p className="aqr-hint">PNG, JPG, SVG 지원</p>
                </div>
              )}
              <input id="logo-input" type="file" accept="image/*"
                style={{ display: 'none' }} onChange={handleLogoChange} />
            </div>
          </div>

          {/* 도트 모양 */}
          <div className="aqr-section">
            <label className="aqr-label">도트 모양</label>
            <div className="aqr-btn-group">
              {['circle', 'rounded', 'square'].map(s => (
                <button key={s}
                  className={`aqr-style-btn ${options.moduleStyle === s ? 'active' : ''}`}
                  onClick={() => handleOptionChange('moduleStyle', s)}>
                  {s === 'circle' ? '● 원형' : s === 'rounded' ? '▢ 둥근' : '■ 사각형'}
                </button>
              ))}
            </div>
          </div>

          {/* 눈 스타일 */}
          <div className="aqr-section">
            <label className="aqr-label">파인더(눈) 스타일</label>
            <div className="aqr-btn-group">
              {['circle', 'square'].map(s => (
                <button key={s}
                  className={`aqr-style-btn ${options.eyeStyle === s ? 'active' : ''}`}
                  onClick={() => handleOptionChange('eyeStyle', s)}>
                  {s === 'circle' ? '○ 원형' : '□ 사각형'}
                </button>
              ))}
            </div>
          </div>

          {/* 파인더 색상 */}
          <div className="aqr-section">
            <label className="aqr-label">파인더 색상</label>
            <div className="aqr-btn-group">
              <button
                className={`aqr-style-btn ${!options.useFinderColor ? 'active' : ''}`}
                onClick={() => handleOptionChange('useFinderColor', false)}>
                자동 (이미지)
              </button>
              <button
                className={`aqr-style-btn ${options.useFinderColor ? 'active' : ''}`}
                onClick={() => handleOptionChange('useFinderColor', true)}>
                사용자 지정
              </button>
            </div>
            {options.useFinderColor && (
              <div className="aqr-color-row">
                <label>파인더 색상</label>
                <input type="color" value={options.finderColor}
                  onChange={e => handleOptionChange('finderColor', e.target.value)} />
              </div>
            )}
          </div>

          {/* 색상 모드 */}
          <div className="aqr-section">
            <label className="aqr-label">색상 모드</label>
            <div className="aqr-btn-group">
              <button
                className={`aqr-style-btn ${options.colorMode === 'image' ? 'active' : ''}`}
                onClick={() => handleOptionChange('colorMode', 'image')}>
                이미지 자동
              </button>
              <button
                className={`aqr-style-btn ${options.colorMode === 'solid' ? 'active' : ''}`}
                onClick={() => handleOptionChange('colorMode', 'solid')}>
                단색
              </button>
            </div>
            {options.colorMode === 'solid' && (
              <div className="aqr-color-row">
                <label>QR 색상</label>
                <input type="color" value={options.solidDarkColor}
                  onChange={e => handleOptionChange('solidDarkColor', e.target.value)} />
              </div>
            )}
          </div>

          {/* 블렌드 모드 — 이미지 모드일 때만 */}
          {options.colorMode === 'image' && (
            <div className="aqr-section">
              <label className="aqr-label">블렌드 모드</label>
              <div className="aqr-btn-group">
                {['multiply', 'overlay', 'darken'].map(m => (
                  <button key={m}
                    className={`aqr-style-btn ${options.blendMode === m ? 'active' : ''}`}
                    onClick={() => handleOptionChange('blendMode', m)}>
                    {m === 'multiply' ? 'Multiply' : m === 'overlay' ? 'Overlay' : 'Darken'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 배경 노출도 */}
          <div className="aqr-section">
            <label className="aqr-label">
              배경 노출도: <strong>{Math.round(options.bgOpacity * 100)}%</strong>
            </label>
            <p className="aqr-desc">
              밝은 영역에서 이미지 노출도. 낮을수록 QR 인식이 잘 됩니다.
            </p>
            <input type="range" min="0" max="1" step="0.05"
              value={options.bgOpacity}
              onChange={e => handleOptionChange('bgOpacity', parseFloat(e.target.value))}
              className="aqr-range" />
          </div>

          {/* 도트 강도 */}
          <div className="aqr-section">
            <label className="aqr-label">
              도트 강도: <strong>{Math.round(options.dotOpacity * 100)}%</strong>
            </label>
            <p className="aqr-desc">
              QR 도트의 불투명도를 조절합니다. 낮을수록 이미지가 더 많이 비칩니다.
            </p>
            <input type="range" min="0.3" max="1" step="0.05"
              value={options.dotOpacity}
              onChange={e => handleOptionChange('dotOpacity', parseFloat(e.target.value))}
              className="aqr-range" />
          </div>

          {/* 도트 크기 */}
          <div className="aqr-section">
            <label className="aqr-label">
              도트 크기: <strong>{Math.round(options.dotScale * 100)}%</strong>
            </label>
            <input type="range" min="0.5" max="1" step="0.05"
              value={options.dotScale}
              onChange={e => handleOptionChange('dotScale', parseFloat(e.target.value))}
              className="aqr-range" />
          </div>

          {/* 적응형 도트 크기 — 이미지 모드일 때만 */}
          {options.colorMode === 'image' && (
            <div className="aqr-section">
              <label className="aqr-label">
                적응형 도트 크기: <strong>{Math.round(options.adaptiveSize * 100)}%</strong>
              </label>
              <p className="aqr-desc">
                이미지 밝기에 따라 도트 크기를 자동 조절합니다.
                밝은 영역은 작은 도트, 어두운 영역은 큰 도트로 표시됩니다.
              </p>
              <input type="range" min="0" max="1" step="0.05"
                value={options.adaptiveSize}
                onChange={e => handleOptionChange('adaptiveSize', parseFloat(e.target.value))}
                className="aqr-range" />
            </div>
          )}

          {/* 오류 정정 */}
          <div className="aqr-section">
            <label className="aqr-label">오류 정정 수준</label>
            <select className="aqr-select" value={options.errorCorrection}
              onChange={e => handleOptionChange('errorCorrection', e.target.value)}>
              <option value="L">L - 낮음 (7%)</option>
              <option value="M">M - 보통 (15%)</option>
              <option value="Q">Q - 높음 (25%)</option>
              <option value="H">H - 최고 (30%)</option>
            </select>
          </div>

          {/* 출력 크기 */}
          <div className="aqr-section">
            <label className="aqr-label">
              출력 크기: <strong>{options.size}px</strong>
            </label>
            <input type="range" min="200" max="4096" step="50"
              value={options.size}
              onChange={e => handleOptionChange('size', parseInt(e.target.value))}
              className="aqr-range" />
          </div>

          <button className="aqr-generate-btn" onClick={handleGenerate}
            disabled={!text.trim() || isGenerating}>
            {isGenerating ? '생성 중...' : 'QR 코드 생성'}
          </button>
        </div>

        {/* ── 미리보기 ── */}
        <div className="aqr-preview">
          <div className="aqr-canvas-wrapper">
            <canvas ref={canvasRef}
              style={{ maxWidth: '100%', display: generated ? 'block' : 'none' }} />
            {!generated && (
              <div className="aqr-canvas-placeholder">
                <p>텍스트를 입력하고<br />QR 코드를 생성하세요</p>
              </div>
            )}
          </div>
          {generated && (
            <button className="aqr-download-btn" onClick={handleDownload}>
              PNG 다운로드
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
