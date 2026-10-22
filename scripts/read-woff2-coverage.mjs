/**
 * Read the characters a WOFF2 font file contains.
 *
 * The WOFF2 container stores every table in one brotli stream, preceded by
 * a compact directory. This parser walks that directory, inflates the
 * stream, and returns the code points the `cmap` table maps.
 *
 * Only the tables MuktoDwar ships are handled: `cmap` is never transformed,
 * so its bytes are copied through unchanged.
 */

import { brotliDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/** The tags the WOFF2 directory may reference by index instead of by name. */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/** Read a UIntBase128 value, as the WOFF2 directory encodes lengths. */
function readBase128(buffer, cursor) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buffer[cursor.offset];
    cursor.offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('malformed UIntBase128 in the WOFF2 directory');
}

/**
 * Parse a WOFF2 file.
 *
 * Returns the code points its `cmap` table maps.
 */
export function woff2CodePoints(path) {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`${path} is not a WOFF2 file`);

  const numTables = buffer.readUInt16BE(12);
  const totalCompressedSize = buffer.readUInt32BE(20);

  // The directory follows the 48-byte header.
  const cursor = { offset: 48 };
  const tables = [];

  for (let i = 0; i < numTables; i += 1) {
    const flags = buffer[cursor.offset];
    cursor.offset += 1;

    const tagIndex = flags & 0x3f;
    let tag;
    if (tagIndex === 0x3f) {
      tag = buffer.toString('ascii', cursor.offset, cursor.offset + 4);
      cursor.offset += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex];
    }

    // Bits 6-7 hold the transform version. Version 0 is the null transform
    // for every table except glyf and loca, where version 3 is.
    const transformVersion = flags >> 6;
    const transformed = tag === 'glyf' || tag === 'loca' ? transformVersion !== 3 : transformVersion !== 0;

    const originalLength = readBase128(buffer, cursor);

    // The length of the table as it sits in the brotli stream. For a
    // transformed table this is the transform length, which is what the
    // stream is laid out by, not the original length.
    let streamLength = originalLength;
    if (transformed) {
      streamLength = readBase128(buffer, cursor);
    }

    tables.push({ tag, length: streamLength, originalLength });
  }

  // Everything after the directory is one brotli stream holding the tables
  // back to back, in directory order.
  const compressed = buffer.subarray(cursor.offset, cursor.offset + totalCompressedSize);
  const inflated = brotliDecompressSync(compressed);

  let position = 0;
  for (const table of tables) {
    if (table.tag === 'cmap') {
      return parseCmap(inflated.subarray(position, position + table.length));
    }
    position += table.length;
  }

  throw new Error(`${path} has no cmap table`);
}

/**
 * Read the code points a `cmap` table maps.
 *
 * Only the format 4 and format 12 subtables are needed: format 4 covers the
 * basic multilingual plane and format 12 covers everything above it.
 */
function parseCmap(cmap) {
  const numSubtables = cmap.readUInt16BE(2);
  const points = new Set();

  for (let i = 0; i < numSubtables; i += 1) {
    const record = 4 + i * 8;
    const subtableOffset = cmap.readUInt32BE(record + 4);
    const format = cmap.readUInt16BE(subtableOffset);

    if (format === 4) {
      const segCountX2 = cmap.readUInt16BE(subtableOffset + 6);
      const segCount = segCountX2 / 2;
      const endBase = subtableOffset + 14;
      const startBase = endBase + segCountX2 + 2;
      for (let seg = 0; seg < segCount; seg += 1) {
        const end = cmap.readUInt16BE(endBase + seg * 2);
        const start = cmap.readUInt16BE(startBase + seg * 2);
        if (start === 0xffff) continue;
        for (let code = start; code <= end; code += 1) points.add(code);
      }
    } else if (format === 12) {
      const groupCount = cmap.readUInt32BE(subtableOffset + 12);
      for (let g = 0; g < groupCount; g += 1) {
        const group = subtableOffset + 16 + g * 12;
        const start = cmap.readUInt32BE(group);
        const end = cmap.readUInt32BE(group + 4);
        for (let code = start; code <= end; code += 1) points.add(code);
      }
    }
  }

  return points;
}
