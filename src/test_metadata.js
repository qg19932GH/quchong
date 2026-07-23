const fs = require('fs');
const path = require('path');
const { getVideoMetadata } = require('./metadata');

// Create a valid minimal MP4 header buffer containing specific duration & resolution
// Based on exact standard version 0 offsets of tkhd:
// size (4), type (4), version/flags (4), creation (4), mod (4), track_ID (4), reserved1 (4), duration (4),
// reserved2 (8), layer (2), group (2), volume (2), reserved3 (2), matrix (36), width (4), height (4)
function createMinimalMp4Buffer(durationSec, width, height) {
  const timescale = 1000;
  const durationVal = durationSec * timescale;

  // Box 1: ftyp (24 bytes)
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0); // size
  ftyp.write('ftyp', 4);    // type
  ftyp.write('mp42', 8);    // major brand
  ftyp.writeUInt32BE(0, 12); // minor version
  ftyp.write('mp42isom', 16); // compatible brands

  // Box 2: mvhd (108 bytes)
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0); // size
  mvhd.write('mvhd', 4);     // type
  mvhd.writeUInt8(0, 8);      // version 0
  mvhd.writeUInt32BE(timescale, 20); // timescale (offset 20)
  mvhd.writeUInt32BE(durationVal, 24); // duration (offset 24)
  mvhd.writeUInt32BE(0x00010000, 28); // rate 1.0
  mvhd.writeUInt16BE(0x0100, 32);     // volume 1.0
  // matrix (36 bytes): identity at offset 44
  mvhd.writeUInt32BE(0x00010000, 44);
  mvhd.writeUInt32BE(0, 48);
  mvhd.writeUInt32BE(0, 52);
  mvhd.writeUInt32BE(0, 56);
  mvhd.writeUInt32BE(0x00010000, 60);
  mvhd.writeUInt32BE(0, 64);
  mvhd.writeUInt32BE(0, 68);
  mvhd.writeUInt32BE(0, 72);
  mvhd.writeUInt32BE(0x40000000, 76);
  mvhd.writeUInt32BE(2, 104);

  // Box 3: tkhd (92 bytes)
  const tkhd = Buffer.alloc(92);
  tkhd.writeUInt32BE(92, 0); // size
  tkhd.write('tkhd', 4);    // type
  tkhd.writeUInt8(0, 8);     // version 0
  tkhd.writeUInt32BE(0x00000f, 8); // flags (enabled, in movie) -> write 4 bytes overwrites version, but we fix version in next line
  tkhd.writeUInt8(0, 8); // restore version 0
  tkhd.writeUInt32BE(1, 20); // track ID (offset 20)
  // skip reserved1 (4 bytes) at 24-27
  tkhd.writeUInt32BE(durationVal, 28); // duration (offset 28)
  // skip reserved2 (8 bytes) at 32-39
  // skip layer/group/volume/reserved3 (8 bytes) at 40-47
  // matrix (36 bytes): identity at offset 48
  tkhd.writeUInt32BE(0x00010000, 48);
  tkhd.writeUInt32BE(0, 52);
  tkhd.writeUInt32BE(0, 56);
  tkhd.writeUInt32BE(0, 60);
  tkhd.writeUInt32BE(0x00010000, 64);
  tkhd.writeUInt32BE(0, 68);
  tkhd.writeUInt32BE(0, 72);
  tkhd.writeUInt32BE(0, 76);
  tkhd.writeUInt32BE(0x40000000, 80);
  // width & height (fixed 16.16) at offset 84 & 88
  tkhd.writeUInt16BE(width, 84); // width integer part
  tkhd.writeUInt16BE(height, 88); // height integer part

  // Box 4: trak wrapper (100 bytes)
  const trak = Buffer.alloc(100);
  trak.writeUInt32BE(100, 0); // size
  trak.write('trak', 4);     // type
  tkhd.copy(trak, 8);        // copy tkhd inside trak at offset 8

  // Box 5: moov wrapper
  const moovHeaderSize = 8;
  const moovTotalSize = moovHeaderSize + mvhd.length + trak.length;
  const moov = Buffer.alloc(moovHeaderSize);
  moov.writeUInt32BE(moovTotalSize, 0); // size
  moov.write('moov', 4);               // type

  // Combine everything
  return Buffer.concat([ftyp, moov, mvhd, trak]);
}

async function runTest() {
  const testFile = path.join(__dirname, '..', 'test_spec.mp4');
  console.log('--- Running MP4 Binary Metadata Parser Test ---');
  
  const duration = 120;
  const w = 1920;
  const h = 1080;
  
  const buffer = createMinimalMp4Buffer(duration, w, h);
  fs.writeFileSync(testFile, buffer);
  console.log(`✅ Generated test MP4 file: ${testFile} (${buffer.length} bytes)`);

  // Parse using our metadata module
  const start = Date.now();
  const meta = await getVideoMetadata(testFile);
  const elapsed = Date.now() - start;

  console.log(`⏱️ Parsing took: ${elapsed} ms`);

  if (meta) {
    console.log(`Parsed Duration: ${meta.duration} seconds (Expected: ${duration})`);
    console.log(`Parsed Resolution: ${meta.resolution} (Expected: ${w}x${h})`);
    
    if (meta.duration === duration && meta.resolution === `${w}x${h}`) {
      console.log('🎉 METADATA PARSER TEST PASSED!');
    } else {
      console.log('❌ METADATA PARSER TEST FAILED: Values mismatch.');
    }
  } else {
    console.log('❌ METADATA PARSER TEST FAILED: Returned null.');
  }

  // Cleanup
  try {
    fs.unlinkSync(testFile);
    console.log('🧹 Cleaned up test MP4 file.');
  } catch (e) {}
}

runTest();
