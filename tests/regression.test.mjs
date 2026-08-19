import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(Boolean);
const appScript = inlineScripts.at(-1);

test('embedded application script parses', () => {
  assert.ok(appScript);
  assert.doesNotThrow(() => new Function(appScript));
});

test('a new project creates and persists exactly one initial frame', () => {
  const initProject = appScript.match(/async initProject\([\s\S]*?\n\s*async addFrame\(/)?.[0];
  assert.ok(initProject, 'initProject implementation was not found');
  assert.equal((initProject.match(/ensureFrame\(0\)/g) || []).length, 1);
  assert.doesNotMatch(initProject, /actions\.addFrame\(/);
  assert.match(initProject, /dirtyFrames\.add\(initialFrame\.id\)/);
});

test('unsaved protection covers the whole project', () => {
  assert.match(appScript, /if \(!projectDirty\.value\) return;/);
  assert.match(appScript, /confirmProjectReplacement/);
  assert.match(appScript, /watch\(settings, markProjectDirty, \{ deep: true \}\)/);
  assert.match(appScript, /watch\(\(\) => project\.meta\.fps, markProjectDirty\)/);
});

test('stored frame order survives missing IndexedDB records', () => {
  assert.match(appScript, /const missingIds = frameIds\.filter\(id => !recordsById\.has\(id\)\)/);
  assert.match(appScript, /project\.frames = frameIds\.map\(id =>/);
  assert.match(appScript, /missingIds\.forEach\(id => dirtyFrames\.add\(id\)\)/);
});

test('blank frames do not eagerly allocate every layer canvas', () => {
  const normalizeFrame = appScript.match(/const normalizeFrame = \(frame\) => \{[\s\S]*?\n\s*\};/)?.[0];
  assert.ok(normalizeFrame, 'normalizeFrame implementation was not found');
  assert.doesNotMatch(normalizeFrame, /cellSurface/);
  assert.match(appScript, /DECODE_BYTE_BUDGET/);
});

test('undo image data has a byte budget in addition to its entry limit', () => {
  assert.match(appScript, /const HISTORY_BYTE_BUDGET = 128 \* 1024 \* 1024/);
  assert.match(appScript, /while \(stack\.length > 1 && bytes > HISTORY_BYTE_BUDGET\)/);
});

test('frame eviction uses validated native PNGs and is serialized', () => {
  assert.match(appScript, /const canvasToPngBytes = async/);
  assert.match(appScript, /assertCompletePng\(bytes, width, height\)/);
  assert.match(appScript, /let evictionQueue = Promise\.resolve\(\)/);
  assert.match(appScript, /withEvictionPaused/);
  assert.doesNotMatch(appScript, /callExportWorker\(\{ type: 'png'/);
});

test('onion masks and exports have explicit memory bounds', () => {
  assert.match(appScript, /const ONION_CACHE_LIMIT = 2/);
  assert.match(appScript, /while \(onionMaskCache\.size > ONION_CACHE_LIMIT\)/);
  assert.match(appScript, /if \(transientCells\) releaseCellSet\(cells\)/);
  assert.match(appScript, /MAX_APNG_RGBA_BYTES/);
  assert.match(appScript, /MAX_ZIP_PNG_BYTES/);
	assert.match(appScript, /new fflate\.ZipPassThrough\(name\)/);
  assert.match(appScript, /assertCompletePng\(apng, w, h\)/);
});

test('export worker failures reject pending work instead of hanging', () => {
  assert.match(appScript, /const failExportWorker = \(worker, error\) =>/);
  assert.match(appScript, /for \(const pending of exportPending\.values\(\)\) pending\.reject\(failure\)/);
  assert.match(appScript, /if \(!exportWorker\) \{ reject\(new Error\('Export worker is unavailable\.'/);
});

test('selection fallbacks use the floating bitmap dimensions', () => {
  assert.doesNotMatch(appScript, /ctx\.rect\(startX, startY, w, h\)/);
  assert.match(appScript, /session\.selection\.floatingData\.width/);
});
