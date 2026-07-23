const fs = require('fs').promises;
const path = require('path');
const { extractVideoId } = require('./parser');
const { getVideoMetadata } = require('./metadata');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.rmvb', '.m4v', '.ts', '.3gp', '.mpeg', '.mpg'
]);

async function runScannerTest() {
  console.log('--- Running Scanner Integration Test ---');
  const mockDir = path.join(__dirname, '..', 'mock_videos');
  
  if (!require('fs').existsSync(mockDir)) {
    console.error('❌ Error: mock_videos folder does not exist. Please run node src/create_mock_files.js first.');
    return;
  }

  let scannedCount = 0;
  let matchedCount = 0;
  const filesById = new Map();

  async function traverse(currentDir) {
    let entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          scannedCount++;
          const videoId = extractVideoId(entry.name);
          if (videoId) {
            matchedCount++;
            const stat = await fs.stat(fullPath);
            const meta = await getVideoMetadata(fullPath);
            if (!filesById.has(videoId)) {
              filesById.set(videoId, []);
            }
            filesById.get(videoId).push({
              path: fullPath,
              name: entry.name,
              size: stat.size,
              mtime: stat.mtimeMs,
              duration: meta ? meta.duration : null,
              resolution: meta ? meta.resolution : null
            });
          }
        }
      }
    }
  }

  const start = Date.now();
  await traverse(mockDir);
  const elapsed = Date.now() - start;

  console.log(`⏱️ Scanning completed in: ${elapsed} ms`);
  console.log(`Total scanned videos: ${scannedCount} (Expected: 10)`);
  console.log(`Total matched IDs: ${matchedCount} (Expected: 8, since normal_video and part-1 don't have IDs)`);

  const duplicates = [];
  for (const [key, files] of filesById.entries()) {
    if (files.length > 1) {
      files.sort((a, b) => b.size - a.size);
      duplicates.push({ key, files });
    }
  }
  duplicates.sort((a, b) => b.files.length - a.files.length || a.key.localeCompare(b.key));

  console.log(`\nDuplicate groups found: ${duplicates.length} (Expected: 3 - SSIS-023, FC2-123456, MIDE-789)`);

  let testPassed = true;

  // Verify group 1: SSIS-023
  const ssisGroup = duplicates.find(g => g.key === 'SSIS-023');
  if (ssisGroup) {
    console.log('✅ Found SSIS-023 duplicate group:');
    console.log(`  - Duplicate count: ${ssisGroup.files.length} (Expected: 3)`);
    console.log(`  - Largest file (best to keep): ${ssisGroup.files[0].name} (${(ssisGroup.files[0].size / 1024 / 1024).toFixed(0)} MB)`);
    console.log(`  - Resolution: ${ssisGroup.files[0].resolution} (Expected: 1920x1080)`);
    console.log(`  - Duration: ${ssisGroup.files[0].duration}s (Expected: 7200s)`);
    
    if (ssisGroup.files.length !== 3) testPassed = false;
    if (ssisGroup.files[0].name !== '[1080p]SSIS-023-HD.mp4') testPassed = false;
  } else {
    console.log('❌ Failed to find SSIS-023 duplicate group');
    testPassed = false;
  }

  // Verify group 2: FC2-123456
  const fc2Group = duplicates.find(g => g.key === 'FC2-123456');
  if (fc2Group) {
    console.log('✅ Found FC2-123456 duplicate group:');
    console.log(`  - Duplicate count: ${fc2Group.files.length} (Expected: 2)`);
    console.log(`  - Largest file: ${fc2Group.files[0].name} (${(fc2Group.files[0].size / 1024 / 1024).toFixed(0)} MB)`);
    // FC2-PTS-123456_HD.mkv has no MP4 header, should show duration/resolution as null (fallback)
    console.log(`  - Largest file metadata (MKV format): Resolution: ${fc2Group.files[0].resolution}, Duration: ${fc2Group.files[0].duration} (Expected: null, null due to fallback)`);
    
    if (fc2Group.files.length !== 2) testPassed = false;
    if (fc2Group.files[0].name !== 'FC2-PTS-123456_HD.mkv') testPassed = false;
    if (fc2Group.files[0].resolution !== null) testPassed = false;
  } else {
    console.log('❌ Failed to find FC2-123456 duplicate group');
    testPassed = false;
  }

  // Verify group 3: MIDE-789
  const mideGroup = duplicates.find(g => g.key === 'MIDE-789');
  if (mideGroup) {
    console.log('✅ Found MIDE-789 duplicate group:');
    console.log(`  - Duplicate count: ${mideGroup.files.length} (Expected: 2)`);
    console.log(`  - Largest file: ${mideGroup.files[0].name}`);
    if (mideGroup.files.length !== 2) testPassed = false;
    if (mideGroup.files[0].name !== '[site]MIDE789_un.mp4') testPassed = false; // 850MB vs 800MB (MIDE789.wmv)
  } else {
    console.log('❌ Failed to find MIDE-789 duplicate group');
    testPassed = false;
  }

  // Verify non-duplicate: ABP-456 is single, so should NOT be in duplicates list
  const abpGroup = duplicates.find(g => g.key === 'ABP-456');
  if (abpGroup) {
    console.log('❌ ABP-456 (single file) was incorrectly listed as duplicate!');
    testPassed = false;
  } else {
    console.log('✅ ABP-456 (single file) was correctly excluded from duplicates.');
  }

  if (testPassed) {
    console.log('\n🎉 SCANNER CORE ALGORITHM INTEGRATION TEST PASSED!');
  } else {
    console.log('\n❌ SCANNER CORE ALGORITHM INTEGRATION TEST FAILED!');
  }
}

runScannerTest();
