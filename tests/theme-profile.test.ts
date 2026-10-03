import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { t3ProfileDirectory } from '../src/t3-theme';

test('profile selection uses desktop identities, independently of the status-data folder', t => {
  const root = mkdtempSync(join(tmpdir(), 't3pet-profile-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(t3ProfileDirectory(root), join(root, 't3code'));
  mkdirSync(join(root, 't3code-dev'));
  assert.equal(t3ProfileDirectory(root), join(root, 't3code-dev'));
  // A stable profile takes precedence when both channels have been installed.
  mkdirSync(join(root, 't3code'));
  mkdirSync(join(root, 'status-data', 'dev'), { recursive: true });
  assert.equal(t3ProfileDirectory(root), join(root, 't3code'));
  mkdirSync(join(root, 'T3 Code (Alpha)'));
  assert.equal(t3ProfileDirectory(root), join(root, 'T3 Code (Alpha)'));
});

test('a development-only installation honors its legacy profile', t => {
  const root = mkdtempSync(join(tmpdir(), 't3pet-profile-dev-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'T3 Code (Dev)'));
  mkdirSync(join(root, 't3code-dev'));
  assert.equal(t3ProfileDirectory(root), join(root, 'T3 Code (Dev)'));
});
