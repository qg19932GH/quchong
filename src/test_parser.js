const { extractVideoId } = require('./parser');

const testCases = [
  { input: '[hjd2048.com]FC2-123456.mp4', expected: 'FC2-123456' },
  { input: 'FC2-PTS-987654_HD.mkv', expected: 'FC2-987654' },
  { input: 'FC212345.avi', expected: 'FC2-12345' },
  { input: 'FC2_123456.mp4', expected: 'FC2-123456' },
  { input: 'SSIS-023-C.mp4', expected: 'SSIS-023' },
  { input: '[1080p] abp-456_uncensored.mkv', expected: 'ABP-456' },
  { input: 'MIDE789.wmv', expected: 'MIDE-789' },
  { input: 'T28-123.mp4', expected: 'T28-123' },
  { input: '1PONDO-123456_789.mp4', expected: '1PONDO-123456' },
  { input: '123456-789.mp4', expected: '123456-789' },
  { input: 'heyzo-2345.mp4', expected: 'HEYZO-2345' },
  { input: 'heyzo2345.mkv', expected: 'HEYZO-2345' },
  { input: 'n1024.mp4', expected: 'N1024' },
  { input: 'some_random_video_file.mp4', expected: null },
  { input: 'part-1.mp4', expected: null },
  { input: 'vol-3.mp4', expected: null },
  { input: 'episode-04.mp4', expected: null },
  { input: 'www.t66y.com_video.mp4', expected: null }
];

console.log('--- Running Parser Tests ---');
let passed = 0;
for (const tc of testCases) {
  const result = extractVideoId(tc.input);
  const isMatch = result === tc.expected;
  if (isMatch) {
    passed++;
    console.log(`✅ [PASS] "${tc.input}" -> "${result}"`);
  } else {
    console.log(`❌ [FAIL] "${tc.input}" -> Expected: "${tc.expected}", Got: "${result}"`);
  }
}

console.log(`\nResults: ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
  console.log('🎉 All tests passed successfully!');
} else {
  console.log('⚠️ Some tests failed. Please check logic.');
}
