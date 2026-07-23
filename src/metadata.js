const fs = require('fs');
const path = require('path');

/**
 * Fast, lightweight binary parser to extract metadata (duration, resolution) from MP4/M4V files.
 * Does not require external binaries. Falls back to null on failure or unsupported formats.
 */
function getMp4Metadata(filePath) {
  return new Promise((resolve) => {
    let fd;
    try {
      fd = fs.openSync(filePath, 'r');
    } catch (e) {
      return resolve(null);
    }

    const fileStats = fs.fstatSync(fd);
    const fileSize = fileStats.size;

    // Buffer to read chunks (512 KB)
    const chunkSize = Math.min(512 * 1024, fileSize);
    if (chunkSize === 0) {
      fs.closeSync(fd);
      return resolve(null);
    }

    const buffer = Buffer.alloc(chunkSize);
    let bytesRead = 0;

    // Try reading header first
    try {
      bytesRead = fs.readSync(fd, buffer, 0, chunkSize, 0);
    } catch (e) {
      fs.closeSync(fd);
      return resolve(null);
    }

    let metadata = parseMp4Buffer(buffer, bytesRead);

    // If metadata not found in header, it might be at the end of the file (web-optimized moov at end)
    if ((!metadata || !metadata.resolution || !metadata.duration) && fileSize > chunkSize) {
      const tailOffset = fileSize - chunkSize;
      try {
        bytesRead = fs.readSync(fd, buffer, 0, chunkSize, tailOffset);
        const tailMetadata = parseMp4Buffer(buffer, bytesRead);
        if (tailMetadata) {
          metadata = {
            duration: metadata?.duration || tailMetadata.duration,
            resolution: metadata?.resolution || tailMetadata.resolution
          };
        }
      } catch (e) {
        // Ignore and use header metadata if any
      }
    }

    fs.closeSync(fd);
    resolve(metadata);
  });
}

/**
 * Parses raw MP4 buffer to extract mvhd (duration) and tkhd (resolution).
 */
function parseMp4Buffer(buffer, length) {
  let moovOffset = -1;
  let moovSize = -1;

  // Find moov box
  let offset = 0;
  while (offset + 8 < length) {
    const size = buffer.readUInt32BE(offset);
    if (size <= 0 || offset + size > length + 1024 * 1024) { // safety guard
      break;
    }
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'moov') {
      moovOffset = offset;
      moovSize = size;
      break;
    }
    offset += size;
  }

  // Fallback raw search for 'moov'
  if (moovOffset === -1) {
    const moovIdx = buffer.indexOf('moov');
    if (moovIdx > 4) {
      moovOffset = moovIdx - 4;
      moovSize = buffer.readUInt32BE(moovOffset);
    }
  }

  if (moovOffset === -1) {
    return null;
  }

  let duration = null;
  let timescale = null;
  let width = null;
  let height = null;

  // Search 'mvhd' inside 'moov'
  const mvhdIdx = buffer.indexOf('mvhd', moovOffset);
  if (mvhdIdx !== -1) {
    const boxStart = mvhdIdx - 4;
    if (boxStart >= 0 && boxStart + 24 < length) {
      const version = buffer.readUInt8(boxStart + 8);
      if (version === 1) {
        if (boxStart + 44 < length) {
          timescale = buffer.readUInt32BE(boxStart + 28);
          const durHigh = buffer.readUInt32BE(boxStart + 32);
          const durLow = buffer.readUInt32BE(boxStart + 36);
          const totalDur = durHigh * 4294967296 + durLow;
          if (timescale > 0) duration = totalDur / timescale;
        }
      } else {
        if (boxStart + 28 < length) {
          timescale = buffer.readUInt32BE(boxStart + 20);
          const totalDur = buffer.readUInt32BE(boxStart + 24);
          if (timescale > 0) duration = totalDur / timescale;
        }
      }
    }
  }

  // Search 'tkhd' instances inside 'moov' to find resolution
  let searchStart = moovOffset;
  const moovEnd = Math.min(moovOffset + moovSize, length);
  
  while (searchStart < moovEnd) {
    const tkhdIdx = buffer.indexOf('tkhd', searchStart);
    if (tkhdIdx === -1 || tkhdIdx > moovEnd) break;

    const boxStart = tkhdIdx - 4;
    if (boxStart >= 0 && boxStart + 8 < length) {
      const version = buffer.readUInt8(boxStart + 8);
      const widthOffset = boxStart + (version === 1 ? 96 : 84);
      if (widthOffset + 8 <= length) {
        // Read 16.16 fixed-point width & height (we read the integer part which is the first 16 bits of 32 bits)
        const wInt = buffer.readUInt16BE(widthOffset);
        const hInt = buffer.readUInt16BE(widthOffset + 4);
        if (wInt > 100 && hInt > 100) {
          if (width === null || wInt > width) {
            width = wInt;
            height = hInt;
          }
        }
      }
    }
    searchStart = tkhdIdx + 4;
  }

  if (duration !== null || width !== null) {
    return {
      duration: duration ? Math.round(duration) : null,
      resolution: width && height ? `${width}x${height}` : null
    };
  }

  return null;
}

/**
 * Main exposed function that resolves video file metadata.
 * Dispatches based on file extension and format.
 */
async function getVideoMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') {
    try {
      const meta = await getMp4Metadata(filePath);
      if (meta) return meta;
    } catch (e) {
      console.warn(`Failed parsing MP4 metadata for: ${filePath}`, e);
    }
  }

  // Graceful fallback for other formats
  return {
    duration: null,
    resolution: null
  };
}

module.exports = {
  getVideoMetadata
};
