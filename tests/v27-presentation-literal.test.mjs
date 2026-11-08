import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAskVisibleText, normalizeAskVisibleProseSanity } from '../app/lib/ai/ask-answer-economy.ts';

test('generated dashes are normalized while quoted text and code remain exact', () => {
  const source = 'Keep  water—then  rest.';
  for (const quote of ['"' + source + '"', '“' + source + '”', "'" + source + "'", '‘' + source + '’', '`' + source + '`']) {
    const result = normalizeAskVisibleText('A—B: ' + quote + ' — understood.');
    assert.ok(result.includes(quote), result);
    assert.equal(result.replace(quote, '').includes('—'), false);
  }
});
test('literal placeholders cannot collide with user text', () => {
  const result = normalizeAskVisibleText('FURVISELITERAL0END — "a — b"');
  assert.match(result, /FURVISELITERAL0END/);
  assert.match(result, /"a — b"/);
});
test('section and safety prose use the same quote-preserving repair', () => {
  const answer = normalizeAskVisibleProseSanity({summary:'One—two',sections:[{heading:'Three—four',items:['"five — six"']}],safetyNote:'Seven—eight'});
  assert.equal(answer.summary,'One, two');
  assert.equal(answer.sections[0].heading,'Three, four');
  assert.equal(answer.sections[0].items[0],'"five — six"');
  assert.equal(answer.safetyNote,'Seven, eight');
});
