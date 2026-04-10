// Minimal ID3v2 tag parser (supports v2.2, v2.3, v2.4)
// Only parses text frames needed for display: title, artist, album, track.

function readSynchsafeInt(bytes, offset) {
  return ((bytes[offset]     & 0x7f) << 21) |
         ((bytes[offset + 1] & 0x7f) << 14) |
         ((bytes[offset + 2] & 0x7f) <<  7) |
          (bytes[offset + 3] & 0x7f);
}

function readInt32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) |
          (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readInt24(bytes, offset) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function readTextFrame(bytes, offset, size) {
  if (size < 1) return '';
  const encoding = bytes[offset];
  const textBytes = bytes.slice(offset + 1, offset + size);
  try {
    let text;
    switch (encoding) {
      case 0:  text = new TextDecoder('iso-8859-1').decode(textBytes); break;
      case 1:  text = new TextDecoder('utf-16').decode(textBytes);     break;
      case 2:  text = new TextDecoder('utf-16be').decode(textBytes);   break;
      case 3:
      default: text = new TextDecoder('utf-8').decode(textBytes);      break;
    }
    // Trim null terminators and surrounding whitespace
    return text.replace(/\0.*$/, '').trim();
  } catch (e) {
    return '';
  }
}

/**
 * Parse ID3v2 tags from an ArrayBuffer.
 * Returns an object with title/artist/album/track, or null if no ID3 tag found.
 */
export function parseID3(buffer) {
  const bytes = new Uint8Array(buffer);

  // Validate "ID3" magic bytes
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

  const version = bytes[3]; // major version: 2, 3, or 4
  if (version < 2 || version > 4) return null;

  const flags  = bytes[5];
  const tagSize = readSynchsafeInt(bytes, 6) + 10; // +10 for the 10-byte header itself

  let offset = 10;

  // Skip extended header if present (flag bit 6)
  if (flags & 0x40) {
    const extSize = version === 4
      ? readSynchsafeInt(bytes, offset)
      : readInt32(bytes, offset);
    offset += extSize;
  }

  const result = {};

  if (version === 2) {
    // ID3v2.2: 3-char frame ID + 3-byte size, no flags
    while (offset + 6 <= Math.min(tagSize, bytes.length)) {
      if (bytes[offset] === 0) break; // padding
      const frameId  = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
      const frameSize = readInt24(bytes, offset + 3);
      offset += 6;
      if (frameSize <= 0 || offset + frameSize > bytes.length) break;

      if (frameId[0] === 'T') {
        const text = readTextFrame(bytes, offset, frameSize);
        if (frameId === 'TT2') result.title  = text;
        else if (frameId === 'TP1') result.artist = text;
        else if (frameId === 'TAL') result.album  = text;
        else if (frameId === 'TRK') result.track  = text;
      }
      offset += frameSize;
    }
  } else {
    // ID3v2.3/v2.4: 4-char frame ID + 4-byte size + 2-byte flags
    // v2.4 uses synchsafe integers for frame sizes; v2.3 uses plain int32
    while (offset + 10 <= Math.min(tagSize, bytes.length)) {
      if (bytes[offset] === 0) break; // padding
      const frameId  = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const frameSize = version === 4
        ? readSynchsafeInt(bytes, offset + 4)
        : readInt32(bytes, offset + 4);
      offset += 10;
      if (frameSize <= 0 || offset + frameSize > bytes.length) break;

      // Only parse text frames (skip TXXX which has a description prefix)
      if (frameId[0] === 'T' && frameId !== 'TXXX') {
        const text = readTextFrame(bytes, offset, frameSize);
        if (frameId === 'TIT2') result.title  = text;
        else if (frameId === 'TPE1') result.artist = text;
        else if (frameId === 'TALB') result.album  = text;
        else if (frameId === 'TRCK') result.track  = text;
      }
      offset += frameSize;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}
