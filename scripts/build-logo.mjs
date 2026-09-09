/**
 * Genera el logo que usa la interfaz a partir del ícono grande del sitio.
 *
 * El favicon viene con el fondo casi blanco pegado al arte, así que acá lo
 * recortamos: se calcula la transparencia por distancia al color de fondo, se
 * despega ese fondo de los bordes suavizados, se ajusta el encuadre al dibujo
 * y se baja la resolución a algo razonable para mostrar a 36 px.
 *
 * Si algún día cambia el ícono, se vuelve a correr:
 *   node scripts/build-logo.mjs
 *
 * Sin dependencias: PNG y zlib alcanzan.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SOURCE = new URL('../public/android-chrome-512x512.png', import.meta.url);
const TARGET = new URL('../src/assets/logo.png', import.meta.url);
/** Lado del PNG final. A 36 px de pantalla cubre hasta pantallas 3x de sobra. */
const SIZE = 256;
/** Margen alrededor del dibujo, como fracción del lado. */
const PADDING = 0.06;
/** Por debajo de este contraste contra el fondo el píxel es fondo puro. */
const CLEAR = 6;
/** A partir de acá el píxel es dibujo puro; en el medio, borde suavizado. */
const SOLID = 26;

// --------------------------------------------------------------- PNG: leer

function readPng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('El archivo no es un PNG.');
  let offset = 8;
  let header = null;
  const parts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      parts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error('El PNG no trae cabecera.');
  if (header.depth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    throw new Error('Solo sé leer PNG RGBA de 8 bits sin entrelazar.');
  }
  return { ...header, pixels: unfilter(inflateSync(Buffer.concat(parts)), header.width, header.height) };
}

/** Deshace los filtros por línea que define el formato PNG. */
function unfilter(raw, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const type = raw[cursor];
    cursor += 1;
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? line[x - bpp] : 0;
      const up = previous[x];
      const upLeft = x >= bpp ? previous[x - bpp] : 0;
      if (type === 1) line[x] = (line[x] + left) & 255;
      else if (type === 2) line[x] = (line[x] + up) & 255;
      else if (type === 3) line[x] = (line[x] + ((left + up) >> 1)) & 255;
      else if (type === 4) line[x] = (line[x] + paeth(left, up, upLeft)) & 255;
    }
    line.copy(out, y * stride);
    previous = line;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// -------------------------------------------------------------- PNG: escribir

function writePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Filtro 1 (izquierda): con dibujos planos comprime mejor que sin filtro.
    raw[y * (stride + 1)] = 1;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const dest = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      raw[dest + x] = (row[x] - (x >= 4 ? row[x - 4] : 0)) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}

// ------------------------------------------------------------------ proceso

const clamp = (value) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/** Convierte el fondo liso en transparencia y devuelve el color real del dibujo. */
function keyOutBackground({ width, height, pixels }) {
  const corner = (x, y) => {
    const at = (y * width + x) * 4;
    return [pixels[at], pixels[at + 1], pixels[at + 2]];
  };
  const samples = [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)];
  const background = [0, 1, 2].map((c) => samples.reduce((sum, s) => sum + s[c], 0) / samples.length);

  const out = Buffer.alloc(pixels.length);
  for (let index = 0; index < width * height; index += 1) {
    const at = index * 4;
    const rgb = [pixels[at], pixels[at + 1], pixels[at + 2]];
    const distance = Math.max(...rgb.map((value, c) => Math.abs(value - background[c])));
    const alpha = Math.min(1, Math.max(0, (distance - CLEAR) / (SOLID - CLEAR))) * (pixels[at + 3] / 255);
    if (alpha <= 0) continue;
    // El píxel es una mezcla de dibujo y fondo: despejamos el dibujo.
    for (let c = 0; c < 3; c += 1) out[at + c] = clamp(background[c] + (rgb[c] - background[c]) / alpha);
    out[at + 3] = Math.round(alpha * 255);
  }
  return { width, height, pixels: out, background };
}

/** Recorta al dibujo y lo centra en un cuadrado con margen. */
function frame({ width, height, pixels }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('No encontré dibujo después de sacar el fondo.');

  const side = Math.max(maxX - minX + 1, maxY - minY + 1);
  const box = Math.ceil(side / (1 - PADDING * 2));
  const originX = Math.round(minX + (maxX - minX + 1) / 2 - box / 2);
  const originY = Math.round(minY + (maxY - minY + 1) / 2 - box / 2);

  const out = Buffer.alloc(box * box * 4);
  for (let y = 0; y < box; y += 1) {
    const sourceY = originY + y;
    if (sourceY < 0 || sourceY >= height) continue;
    for (let x = 0; x < box; x += 1) {
      const sourceX = originX + x;
      if (sourceX < 0 || sourceX >= width) continue;
      pixels.copy(out, (y * box + x) * 4, (sourceY * width + sourceX) * 4, (sourceY * width + sourceX) * 4 + 4);
    }
  }
  return { width: box, height: box, pixels: out, crop: { minX, minY, maxX, maxY, box } };
}

/** Reduce con promedio de área, multiplicando por alfa para no ensuciar los bordes. */
function resize({ width, height, pixels }, size) {
  const out = Buffer.alloc(size * size * 4);
  const scale = width / size;
  for (let y = 0; y < size; y += 1) {
    const fromY = Math.floor(y * scale);
    const toY = Math.min(height, Math.ceil((y + 1) * scale));
    for (let x = 0; x < size; x += 1) {
      const fromX = Math.floor(x * scale);
      const toX = Math.min(width, Math.ceil((x + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = fromY; sy < toY; sy += 1) {
        for (let sx = fromX; sx < toX; sx += 1) {
          const at = (sy * width + sx) * 4;
          const alpha = pixels[at + 3] / 255;
          r += pixels[at] * alpha;
          g += pixels[at + 1] * alpha;
          b += pixels[at + 2] * alpha;
          a += alpha;
          count += 1;
        }
      }
      const at = (y * size + x) * 4;
      if (a > 0) {
        out[at] = clamp(r / a);
        out[at + 1] = clamp(g / a);
        out[at + 2] = clamp(b / a);
      }
      out[at + 3] = clamp((a / count) * 255);
    }
  }
  return { width: size, height: size, pixels: out };
}

const source = readPng(readFileSync(SOURCE));
const keyed = keyOutBackground(source);
const framed = frame(keyed);
const final = resize(framed, SIZE);
const png = writePng(final.width, final.height, final.pixels);
writeFileSync(TARGET, png);

console.log(`Fondo detectado: rgb(${keyed.background.map((v) => Math.round(v)).join(', ')})`);
console.log(`Dibujo en ${source.width}px: x ${framed.crop.minX}-${framed.crop.maxX}, y ${framed.crop.minY}-${framed.crop.maxY}`);
console.log(`Encuadre cuadrado: ${framed.crop.box}px → ${SIZE}px`);
console.log(`Escrito ${TARGET.pathname} (${(png.length / 1024).toFixed(1)} kB)`);
