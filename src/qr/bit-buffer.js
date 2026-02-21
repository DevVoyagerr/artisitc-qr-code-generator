// ─── 비트 단위 쓰기 버퍼 ─────────────────────────────────────────
export class BitBuffer {
  constructor() {
    this.buffer = [];
    this.length = 0;
  }

  // num의 상위 bitLength 비트를 MSB-first로 추가
  put(num, bitLength) {
    for (let i = bitLength - 1; i >= 0; i--) {
      this.putBit(((num >>> i) & 1) === 1);
    }
  }

  putBit(bit) {
    const byteIndex = this.length >>> 3;
    if (this.buffer.length <= byteIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[byteIndex] |= 0x80 >>> (this.length & 7);
    }
    this.length++;
  }

  getLengthInBits() {
    return this.length;
  }

  // Uint8Array로 변환
  toUint8Array() {
    return new Uint8Array(this.buffer);
  }
}
