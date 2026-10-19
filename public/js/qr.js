// QR CODE ENCODER (vendored: a self-contained file we call, but do not need to understand).
//
// Why "vendored": the project may not use outside packages, so this one small file is the whole
// encoder. It is a pure function: text in, a square of dark/light modules out. No page, no network.
// It is checked in test/qr.test.js by turning the result into a picture and reading it back with a
// real QR reader, so we know phones can scan it.
//
// What it does: byte mode (any text), error correction level M (about 15% of the code can be
// damaged and it still reads), versions 1 to 10 (up to 213 characters), best of the 8 masks.
//
//   const qr = makeQr("BK-000012.1780000000.k3Jx...");
//   qr.size      number of modules on a side, e.g. 33
//   qr.dark(x, y)   true when the module at column x, row y is dark
//   qrPath(qr)   the SVG path text that draws every dark module (one <path> is all a page needs)

const MAX_VERSION = 10;
// Error correction level M: codewords per block, and number of blocks, for versions 1..10.
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMAT_BITS_M = 0; // the two bits that mean "level M" inside the format information

// ---- Reed-Solomon over GF(256), polynomial 0x11D ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function eccOf(data, degree) {
  const gen = generator(degree);
  const rest = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rest.shift();
    rest.push(0);
    for (let i = 0; i < degree; i++) rest[i] ^= gfMul(gen[i + 1], factor);
  }
  return rest;
}

// ---- sizes ----
const sizeOf = (version) => 17 + 4 * version;

function rawDataModules(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    n -= (25 * aligns - 10) * aligns - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}
const totalCodewords = (version) => Math.floor(rawDataModules(version) / 8);
const dataCodewords = (version) => totalCodewords(version) - ECC_PER_BLOCK[version] * BLOCKS[version];

function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = sizeOf(version) - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ---- the data, as bytes ----
function encodeBytes(text, version) {
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [];
  const put = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacityBits = dataCodewords(version) * 8;
  put(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; out.length < dataCodewords(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

// Cut the data into blocks, add each block's error-correction codewords, then weave the blocks together.
function withEcc(data, version) {
  const blocks = BLOCKS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const raw = totalCodewords(version);
  const shortCount = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks) - eccLen;
  const parts = [];
  let at = 0;
  for (let i = 0; i < blocks; i++) {
    const len = shortLen + (i < shortCount ? 0 : 1);
    const chunk = data.slice(at, at + len);
    at += len;
    parts.push({ chunk, ecc: eccOf(chunk, eccLen) });
  }
  const out = [];
  for (let i = 0; i <= shortLen; i++) for (const p of parts) if (i < p.chunk.length) out.push(p.chunk[i]);
  for (let i = 0; i < eccLen; i++) for (const p of parts) out.push(p.ecc[i]);
  return out;
}

// ---- the picture ----
function drawFunctionPatterns(version) {
  const size = sizeOf(version);
  const cells = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    cells[y][x] = dark;
    isFunction[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0); // timing patterns
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  const aligns = alignmentPositions(version);
  for (let i = 0; i < aligns.length; i++) {
    for (let j = 0; j < aligns.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === aligns.length - 1) || (i === aligns.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(aligns[i] + dx, aligns[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  // Reserve the format and version areas (drawn properly later).
  drawFormat(0, cells, isFunction, size);
  if (version >= 7) drawVersion(version, cells, isFunction, size);
  return { cells, isFunction, size };
}

function drawFormat(mask, cells, isFunction, size) {
  const data = (FORMAT_BITS_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) !== 0;
  const set = (x, y, v) => {
    cells[y][x] = v;
    isFunction[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the always-dark module
}

function drawVersion(version, cells, isFunction, size) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const v = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    cells[b][a] = v;
    cells[a][b] = v;
    isFunction[b][a] = true;
    isFunction[a][b] = true;
  }
}

function placeData(codewords, cells, isFunction, size) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < codewords.length * 8) {
          cells[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Lower is better: penalises long runs, blocks, finder look-alikes and lopsided dark/light balance.
function penalty(cells, size) {
  let score = 0;
  const runScore = (line) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) s += run - 2;
        run = 1;
      }
    }
    if (run >= 5) s += run - 2;
    return s;
  };
  const finderLike = (line) => {
    let s = 0;
    const pattern = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= line.length; i++) {
      if (!pattern.every((v, k) => line[i + k] === v)) continue;
      const before = [1, 2, 3, 4].every((k) => i - k >= 0 && !line[i - k]);
      const after = [0, 1, 2, 3].every((k) => i + 7 + k < line.length && !line[i + 7 + k]);
      if (before || after) s += 40;
    }
    return s;
  };
  for (let y = 0; y < size; y++) {
    const row = cells[y];
    const col = cells.map((r) => r[y]);
    score += runScore(row) + runScore(col) + finderLike(row) + finderLike(col);
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = cells[y][x];
      if (c === cells[y][x + 1] && c === cells[y + 1][x] && c === cells[y + 1][x + 1]) score += 3;
    }
  }
  const dark = cells.reduce((n, row) => n + row.filter(Boolean).length, 0);
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

export function makeQr(text) {
  if (typeof text !== "string") throw new TypeError("makeQr needs text.");
  const length = new TextEncoder().encode(text).length;
  let version = 1;
  while (version <= MAX_VERSION) {
    const headerBits = 4 + (version <= 9 ? 8 : 16);
    if (headerBits + length * 8 <= dataCodewords(version) * 8) break;
    version++;
  }
  if (version > MAX_VERSION) throw new RangeError(`This text is too long for a QR code here (${length} bytes; the limit is 213).`);

  const codewords = withEcc(encodeBytes(text, version), version);
  const base = drawFunctionPatterns(version);
  const { size, isFunction } = base;

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const cells = base.cells.map((row) => row.slice());
    const flags = isFunction.map((row) => row.slice());
    placeData(codewords, cells, flags, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFunction[y][x] && MASKS[mask](x, y)) cells[y][x] = !cells[y][x];
    drawFormat(mask, cells, flags, size);
    const score = penalty(cells, size);
    if (best === null || score < best.score) best = { score, cells };
  }
  const cells = best.cells;
  return { size, version, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && cells[y][x] };
}

// One SVG path that draws every dark module as a 1 x 1 square. Runs of dark modules in a row are joined,
// so the text stays short. Use it with  viewBox="0 0 size size"  (add a quiet border yourself, see qrViewBox).
export function qrPath(qr, border = 0) {
  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.dark(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < qr.size && qr.dark(x, y)) x++;
      parts.push(`M${start + border} ${y + border}h${x - start}v1h-${x - start}z`);
    }
  }
  return parts.join("");
}

// The quiet zone: a QR reader needs a light margin of 4 modules around the code.
export const QUIET_ZONE = 4;
