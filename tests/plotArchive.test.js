import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { buildPlotArchive, plotStartPayload, PLATE_PATH } from '../server/plotArchive.js';
test('SD archive preserves the exact validated program and both checksums', async () => {
 const program = '; Проба\r\nG28\nG0 Z10 F1200\n';
 const { bytes, md5 } = await buildPlotArchive(program);
 const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
 assert.equal(await zip.file(PLATE_PATH).async('string'), program);
 assert.equal(await zip.file(`${PLATE_PATH}.md5`).async('string'), createHash('md5').update(program).digest('hex').toUpperCase());
 assert.equal(md5, createHash('md5').update(bytes).digest('hex'));
 const payload = plotStartPayload('test.gcode.3mf', md5, '123').print;
 assert.ok(zip.file(payload.param));
 assert.equal(payload.url, 'ftp:///test.gcode.3mf');
 assert.equal(payload.md5, md5);
});
