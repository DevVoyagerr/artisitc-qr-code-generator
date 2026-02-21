// ─── WebGL QR + 이미지 픽셀 합성 렌더러 ─────────────────────────
import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders.js';

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info);
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

export class WebGLRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!this.gl) throw new Error('WebGL not supported');

    const gl = this.gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(this.program);

    // 풀스크린 쿼드 (2개 삼각형)
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1,
    ]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniform 위치 캐시
    this.loc = {};
    const uniforms = [
      'u_image', 'u_qrMatrix', 'u_moduleCount', 'u_quietZone',
      'u_dotScale', 'u_moduleStyle', 'u_colorMode', 'u_solidColor',
      'u_eyeStyle', 'u_bgOpacity', 'u_dotOpacity', 'u_blendMode',
      'u_adaptiveSize', 'u_finderColor', 'u_useFinderColor',
    ];
    for (const name of uniforms) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }

    // 텍스처 슬롯
    this.imageTexture = null;
    this.qrTexture = null;
  }

  _uploadImageTexture(image) {
    const gl = this.gl;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);

    this.imageTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _uploadDummyImageTexture() {
    const gl = this.gl;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);

    this.imageTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  _uploadQRTexture(qrMatrix) {
    const gl = this.gl;
    if (this.qrTexture) gl.deleteTexture(this.qrTexture);

    const size = qrMatrix.length;
    const data = new Uint8Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        data[r * size + c] = qrMatrix[r][c] ? 255 : 0;
      }
    }

    this.qrTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.qrTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0,
                  gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render({ qrMatrix, image, options }) {
    const {
      size = 500,
      moduleCount,
      quietZone = 0.08,
      dotScale = 0.85,
      moduleStyle = 0,
      colorMode = 0,
      solidColor = [0, 0, 0],
      eyeStyle = 0,
      bgOpacity = 0.7,
      dotOpacity = 0.85,
      blendMode = 0,
      adaptiveSize = 0.5,
      finderColor = [0, 0, 0],
      useFinderColor = 0,
    } = options;

    const gl = this.gl;
    this.canvas.width = size;
    this.canvas.height = size;
    gl.viewport(0, 0, size, size);

    gl.useProgram(this.program);

    if (image) {
      this._uploadImageTexture(image);
    } else {
      this._uploadDummyImageTexture();
    }
    this._uploadQRTexture(qrMatrix);

    gl.uniform1i(this.loc.u_image, 0);
    gl.uniform1i(this.loc.u_qrMatrix, 1);
    gl.uniform1f(this.loc.u_moduleCount, moduleCount || qrMatrix.length);
    gl.uniform1f(this.loc.u_quietZone, quietZone);
    gl.uniform1f(this.loc.u_dotScale, dotScale);
    gl.uniform1f(this.loc.u_moduleStyle, moduleStyle);
    gl.uniform1f(this.loc.u_colorMode, colorMode);
    gl.uniform3fv(this.loc.u_solidColor, solidColor);
    gl.uniform1f(this.loc.u_eyeStyle, eyeStyle);
    gl.uniform1f(this.loc.u_bgOpacity, bgOpacity);
    gl.uniform1f(this.loc.u_dotOpacity, dotOpacity);
    gl.uniform1f(this.loc.u_blendMode, blendMode);
    gl.uniform1f(this.loc.u_adaptiveSize, adaptiveSize);
    gl.uniform3fv(this.loc.u_finderColor, finderColor);
    gl.uniform1f(this.loc.u_useFinderColor, useFinderColor);

    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return this.canvas;
  }

  dispose() {
    const gl = this.gl;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.qrTexture) gl.deleteTexture(this.qrTexture);
    if (this.program) gl.deleteProgram(this.program);
    this.gl = null;
  }
}
