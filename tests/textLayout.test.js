import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatTextBlock} from '../src/textLayout.js';
test('long paragraphs wrap into a text box rather than shrinking to one line',()=>{const text=formatTextBlock({text:'Привет это длинный текст для проверки переноса слов',object:{w:64}});assert.ok(text.includes('\n'));assert.ok(text.split('\n').every(line=>line.length<=20));assert.equal(text.replace(/\s+/g,' '),'Привет это длинный текст для проверки переноса слов');});
test('numbered list numbers paragraphs, not wrapped lines',()=>{const text=formatTextBlock({text:'Первый длинный пункт\nВторой пункт',listStyle:'numbered',object:{w:50}});assert.ok(text.startsWith('1. '));assert.match(text,/\n2\. /);assert.ok(!text.includes('3. '));});
