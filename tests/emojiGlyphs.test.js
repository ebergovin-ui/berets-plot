import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emojiGlyphs,normalizeEmojiText} from '../src/emojiGlyphs.js';
import {readFileSync} from 'node:fs';
test('simple emoji convert to finite paths and variation selectors are ignored',()=>{
 assert.equal(normalizeEmojiText('❤️ ☺️'),'❤ ☺');
 for(const paths of Object.values(emojiGlyphs))for(const path of paths){assert.ok(path.length>=2);assert.ok(path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
});
test('Caveat handwriting contains uppercase and lowercase Cyrillic',()=>{
 const font=JSON.parse(readFileSync(new URL('../src/standardFonts.json',import.meta.url))).caveat;
 for(const char of 'ПриветЁёжизнь')assert.ok(font[char].paths.length);
});
