import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContactReport, sendContactReport } from '../app/lib/contact/report.ts';
import { MAX_SCREENSHOT_BYTES, SUPPORT_EMAIL } from '../app/lib/contact/constants.ts';
const report = { email: 'owner@example.com', category: 'Ask did not respond', message: 'I asked a question and saw an error.' };

test('reports validate reply address and description without interpreting owner text', () => {
  assert.deepEqual(parseContactReport(report), report);
  for (const email of ['x\r\nBcc:bad@example.com', 'a@b.com,c@d.com', '']) assert.throws(() => parseContactReport({ ...report, email }));
  assert.throws(() => parseContactReport({ ...report, message: 'x' }));
  assert.throws(() => parseContactReport({ ...report, message: 'x'.repeat(5001) }));
  assert.throws(() => parseContactReport({ ...report, category: 'arbitrary header' }));
});
test('screenshots use validated bytes and generated filenames, never caller URLs or names', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=';
  const parsed = parseContactReport({ ...report, screenshot: png, filename: '../../anything.html' });
  assert.equal(parsed.screenshot.filename, 'screenshot.png');
  for (const screenshot of ['https://example.com/x.png', Buffer.from('<svg onload="alert(1)"/>').toString('base64'), Buffer.alloc(MAX_SCREENSHOT_BYTES + 1).toString('base64')]) assert.throws(() => parseContactReport({ ...report, screenshot }));
});
test('only the support inbox receives the report; identical retries reuse the provider key', async () => {
  const sent = [];
  const transport = async (url, init) => { sent.push({ url, ...init }); return Response.json({ id: 'provider-id' }); };
  const config = { key: 'test-key', from: 'support@verified.example.com' };
  const parsed = parseContactReport({ ...report, to: 'attacker@example.com' });
  const first = await sendContactReport(parsed, config, transport);
  const second = await sendContactReport(parsed, config, transport);
  assert.equal(first, second);
  assert.equal(sent[0].headers['Idempotency-Key'], sent[1].headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(sent[0].body).to, [SUPPORT_EMAIL]);
  assert.equal(JSON.parse(sent[0].body).reply_to, report.email);
  assert.equal(JSON.parse(sent[0].body).html, undefined);
});
test('provider errors and ambiguous responses never become confirmed success', async () => {
  for (const transport of [async () => new Response('', { status: 500 }), async () => Response.json({}), async () => { throw new Error('timeout'); }]) {
    await assert.rejects(sendContactReport(report, { key: 'test', from: 'test' }, transport));
  }
});
