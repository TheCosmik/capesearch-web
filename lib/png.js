// Minimal, dependency-free PNG encoder/decoder for Minecraft skins.
//
// Encoder: 8-bit RGBA, no interlace (used to build the claim-challenge skin).
// Decoder: 8-bit, non-interlaced, colour types 0 (gray), 2 (RGB), 3 (palette), 4 (gray+alpha),
//          6 (RGBA) - everything Mojang's texture server and skin editors produce.
// Output is always a flat RGBA Buffer. Anything unsupported throws.

const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DIMENSION = 256;           // skins are 64x32, 64x64 or (HD) up to 128
const MAX_INFLATED_BYTES = 4 * 1024 * 1024;

// ── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// ── encoder ──────────────────────────────────────────────────────────────────
function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error('rgba length mismatch');
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA, no interlace
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── decoder ──────────────────────────────────────────────────────────────────
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a png');

  let pos = 8, ihdr = null, palette = null, trns = null;
  const idat = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const start = pos + 8, end = start + len;
    if (end + 4 > buf.length) throw new Error('truncated png');
    const data = buf.subarray(start, end);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], colorType: data[9], interlace: data[12],
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos = end + 4; // skip CRC
  }

  if (!ihdr || !idat.length) throw new Error('missing png chunks');
  const { width, height, depth, colorType, interlace } = ihdr;
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error('png dimensions out of range');
  if (depth !== 8) throw new Error('unsupported bit depth');
  if (interlace !== 0) throw new Error('interlaced png unsupported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported colour type');
  if (colorType === 3 && !palette) throw new Error('missing palette');

  const inflated = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: MAX_INFLATED_BYTES });
  const stride = width * channels;
  if (inflated.length < (stride + 1) * height) throw new Error('png data too short');

  // undo scanline filters
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? px[dst + x - channels] : 0;
      const up = y > 0 ? px[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? px[dst - stride + x - channels] : 0;
      let v = inflated[src + x];
      switch (filter) {
        case 0: break;
        case 1: v += left; break;
        case 2: v += up; break;
        case 3: v += (left + up) >> 1; break;
        case 4: v += paeth(left, up, upLeft); break;
        default: throw new Error('bad png filter');
      }
      px[dst + x] = v & 0xff;
    }
  }

  // expand to RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4, s = i * channels;
    if (colorType === 6) { rgba[o] = px[s]; rgba[o + 1] = px[s + 1]; rgba[o + 2] = px[s + 2]; rgba[o + 3] = px[s + 3]; }
    else if (colorType === 2) { rgba[o] = px[s]; rgba[o + 1] = px[s + 1]; rgba[o + 2] = px[s + 2]; rgba[o + 3] = 255; }
    else if (colorType === 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]; rgba[o + 3] = 255; }
    else if (colorType === 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]; rgba[o + 3] = px[s + 1]; }
    else { // palette
      const idx = px[s];
      if (idx * 3 + 2 >= palette.length) throw new Error('bad palette index');
      rgba[o] = palette[idx * 3]; rgba[o + 1] = palette[idx * 3 + 1]; rgba[o + 2] = palette[idx * 3 + 2];
      rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }
  return { width, height, rgba };
}

module.exports = { encodePng, decodePng, crc32 };
