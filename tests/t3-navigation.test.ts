import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chatUrl } from '../src/t3-navigation';

test('chat links use the selected installation and reject remote hosts or path injection', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-navigation-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(join(folder, 'environment-id'), 'environment-123\n');
  const runtime = (host: string, port = 3773) => writeFileSync(join(folder, 'server-runtime.json'), JSON.stringify({ host, port }));
  runtime('127.0.0.1');
  assert.equal(chatUrl(folder, 'chat-456'), 'http://127.0.0.1:3773/environment-123/chat-456');
  runtime('::');
  assert.equal(chatUrl(folder, 'chat-456'), 'http://[::1]:3773/environment-123/chat-456');
  runtime('example.com');
  assert.throws(() => chatUrl(folder, 'chat-456'));
  runtime('127.0.0.1', 0);
  assert.throws(() => chatUrl(folder, 'chat-456'));
  runtime('127.0.0.1');
  for (const id of ['../pair', 'chat?redirect=evil', 'https://example.com', '']) assert.throws(() => chatUrl(folder, id));
  writeFileSync(join(folder, 'environment-id'), '../outside');
  assert.throws(() => chatUrl(folder, 'chat-456'));
});
