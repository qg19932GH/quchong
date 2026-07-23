const fs = require('fs');
const path = require('path');

const mockDir = path.join(__dirname, '..', 'mock_videos');

if (!fs.existsSync(mockDir)) {
  fs.mkdirSync(mockDir);
}

// Function to generate a valid minimal MP4 header buffer
function createMinimalMp4Buffer(durationSec, width, height) {
  const timescale = 1000;
  const durationVal = durationSec * timescale;

  // Box 1: ftyp (24 bytes)
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4);
  ftyp.write('mp42', 8);
  ftyp.writeUInt32BE(0, 12);
  ftyp.write('mp42isom', 16);

  // Box 2: mvhd (108 bytes)
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4);
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(timescale, 20);
  mvhd.writeUInt32BE(durationVal, 24);
  mvhd.writeUInt32BE(0x00010000, 28);
  mvhd.writeUInt16BE(0x0100, 32);
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
  tkhd.writeUInt32BE(92, 0);
  tkhd.write('tkhd', 4);
  tkhd.writeUInt8(0, 8);
  tkhd.writeUInt32BE(0x00000f, 8);
  tkhd.writeUInt8(0, 8);
  tkhd.writeUInt32BE(1, 20);
  tkhd.writeUInt32BE(durationVal, 28);
  tkhd.writeUInt32BE(0x00010000, 48);
  tkhd.writeUInt32BE(0, 52);
  tkhd.writeUInt32BE(0, 56);
  tkhd.writeUInt32BE(0, 60);
  tkhd.writeUInt32BE(0x00010000, 64);
  tkhd.writeUInt32BE(0, 68);
  tkhd.writeUInt32BE(0, 72);
  tkhd.writeUInt32BE(0, 76);
  tkhd.writeUInt32BE(0x40000000, 80);
  tkhd.writeUInt16BE(width, 84);
  tkhd.writeUInt16BE(height, 88);

  // Box 4: trak wrapper (100 bytes)
  const trak = Buffer.alloc(100);
  trak.writeUInt32BE(100, 0);
  trak.write('trak', 4);
  tkhd.copy(trak, 8);

  // Box 5: moov wrapper
  const moovHeaderSize = 8;
  const moovTotalSize = moovHeaderSize + mvhd.length + trak.length;
  const moov = Buffer.alloc(moovHeaderSize);
  moov.writeUInt32BE(moovTotalSize, 0);
  moov.write('moov', 4);

  return Buffer.concat([ftyp, moov, mvhd, trak]);
}

const mockFiles = [
  // MP4s with valid headers
  { name: '[hjd2048.com]FC2-123456.mp4', size: 1024 * 1024 * 150, isMp4: true, duration: 3600, w: 1280, h: 720 }, // 1h, 720p
  { name: 'SSIS-023-C.mp4', size: 1024 * 1024 * 1200, isMp4: true, duration: 7200, w: 1920, h: 1080 },           // 2h, 1080p
  { name: '[1080p]SSIS-023-HD.mp4', size: 1024 * 1024 * 2200, isMp4: true, duration: 7200, w: 1920, h: 1080 },   // 2h, 1080p
  { name: '[site]MIDE789_un.mp4', size: 1024 * 1024 * 850, isMp4: true, duration: 5400, w: 1920, h: 1080 },      // 1.5h, 1080p
  { name: 'normal_video_without_id.mp4', size: 1024 * 1024 * 50, isMp4: true, duration: 300, w: 640, h: 360 },
  
  // Non-MP4 formats (will fallback to no resolution/duration)
  { name: 'FC2-PTS-123456_HD.mkv', size: 1024 * 1024 * 350, isMp4: false },
  { name: 'www.t66y.com_SSIS-023.avi', size: 1024 * 1024 * 900, isMp4: false },
  { name: 'MIDE789.wmv', size: 1024 * 1024 * 800, isMp4: false },
  { name: '[1080p] abp-456_uncensored.mkv', size: 1024 * 1024 * 1400, isMp4: false },
  { name: 'part-1.mp4', size: 1024 * 1024 * 100, isMp4: true, duration: 600, w: 1280, h: 720 }
];

console.log('Creating mock videos in:', mockDir);

mockFiles.forEach(file => {
  const filePath = path.join(mockDir, file.name);
  try {
    let headerBuffer = Buffer.alloc(0);
    if (file.isMp4 && file.duration) {
      headerBuffer = createMinimalMp4Buffer(file.duration, file.w, file.h);
    }
    
    // Create file
    const fd = fs.openSync(filePath, 'w');
    if (headerBuffer.length > 0) {
      fs.writeSync(fd, headerBuffer);
    }
    fs.closeSync(fd);
    
    // Set virtual size
    const finalSize = Math.max(file.size, headerBuffer.length);
    fs.truncateSync(filePath, finalSize);
    
    console.log(`✅ Created: ${file.name} (${(finalSize / (1024 * 1024)).toFixed(0)} MB) - MP4 Header: ${file.isMp4 && file.duration ? 'YES' : 'NO'}`);
  } catch (err) {
    console.error(`Failed to create ${file.name}:`, err);
  }
});

console.log('\nMock files creation complete! You can run the scan now.');
