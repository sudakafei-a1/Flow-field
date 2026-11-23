import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecordingFilename,
  formatRecordingDuration,
  selectBestVideoMimeType,
} from './videoRecorder';

test('selectBestVideoMimeType prefers VP9+Opus when audio is present and falls back cleanly', () => {
  const withVp9 = selectBestVideoMimeType(
    (mime) => mime === 'video/webm;codecs=vp9,opus' || mime === 'video/webm',
    true,
  );
  assert.deepEqual(withVp9, { mimeType: 'video/webm;codecs=vp9,opus', fileExt: 'webm' });

  const mp4Only = selectBestVideoMimeType((mime) => mime === 'video/mp4', true);
  assert.deepEqual(mp4Only, { mimeType: 'video/mp4', fileExt: 'mp4' });

  const videoOnly = selectBestVideoMimeType((mime) => mime === 'video/webm;codecs=vp8', false);
  assert.deepEqual(videoOnly, { mimeType: 'video/webm;codecs=vp8', fileExt: 'webm' });

  const unsupported = selectBestVideoMimeType(() => false, true);
  assert.equal(unsupported, null);
});

test('formatRecordingDuration formats milliseconds as MM:SS safely', () => {
  assert.equal(formatRecordingDuration(0), '00:00');
  assert.equal(formatRecordingDuration(4900), '00:04');
  assert.equal(formatRecordingDuration(65000), '01:05');
  assert.equal(formatRecordingDuration(-100), '00:00');
  assert.equal(formatRecordingDuration(Number.NaN), '00:00');
});

test('buildRecordingFilename sanitizes flow mode and applies matching file extension', () => {
  assert.equal(
    buildRecordingFilename('heartPlanet', 'webm', 1700000000000),
    'particle-flow-heartPlanet-1700000000000.webm',
  );
  assert.equal(
    buildRecordingFilename('nebula/../bad', 'mp4', 12345),
    'particle-flow-nebulabad-12345.mp4',
  );
});
