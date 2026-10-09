import {test} from 'node:test';
import assert from 'node:assert/strict';
import mammoth from 'mammoth';
import path from 'node:path';
test('Word converter reads Cyrillic paragraphs without losing text',async()=>{const result=await mammoth.convertToHtml({path:path.resolve('tests/fixtures/editor-import.docx')});assert.match(result.value,/Привет, мир!/);assert.match(result.value,/Документ для плоттера/);assert.equal((result.value.match(/<p>/g)||[]).length,2);});
