import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuPlacement } from '../src/menu-layout';
import { headingToSubmenu } from '../src/menu-pointer';

test('submenu intent protects diagonal travel on either side and rejects movement away', () => {
  const origin = {x:260,y:200}, right = {left:280,right:520,top:100,bottom:350};
  assert.equal(headingToSubmenu(origin, origin, {x:270,y:240}, right, 'right'), true);
  assert.equal(headingToSubmenu(origin, {x:270,y:220}, {x:265,y:230}, right, 'right'), false);
  assert.equal(headingToSubmenu(origin, origin, {x:270,y:400}, right, 'right'), false);
  const leftOrigin = {x:280,y:200}, left = {left:20,right:260,top:100,bottom:350};
  assert.equal(headingToSubmenu(leftOrigin, leftOrigin, {x:270,y:240}, left, 'left'), true);
  assert.equal(headingToSubmenu(leftOrigin, {x:270,y:220}, {x:275,y:230}, left, 'left'), false);
});

test('context menu and submenu fit edges, narrow monitors, and negative monitor coordinates', () => {
  for (const area of [{x:0,y:0,width:1920,height:1080}, {x:-1280,y:-300,width:1280,height:720}, {x:0,y:0,width:320,height:480}, {x:0,y:0,width:600,height:480}]) {
    for (const x of [area.x, area.x + area.width / 2, area.x + area.width]) for (const y of [area.y, area.y + area.height]) {
      const { bounds, main, sub } = menuPlacement(area, {x,y}, {main:350,sub:300,top:220});
      assert.ok(bounds.x >= area.x && bounds.y >= area.y);
      assert.ok(bounds.x + bounds.width <= area.x + area.width);
      assert.ok(bounds.y + bounds.height <= area.y + area.height);
      for (const panel of [main, sub]) {
        assert.ok(panel);
        assert.ok(bounds.x + panel.x >= area.x);
        assert.ok(bounds.y + panel.y >= area.y);
        assert.ok(bounds.x + panel.x + panel.width <= area.x + area.width);
        assert.ok(bounds.y + panel.y + panel.height <= area.y + area.height);
      }
    }
  }
});
test('opening a submenu preserves the primary popup position when there is room beside it', () => {
  const area = {x:0,y:0,width:1920,height:1080}, point = {x:1800,y:1000};
  const initial = menuPlacement(area, point, {main:300,sub:0,top:170});
  const expanded = menuPlacement(area, point, {main:300,sub:270,top:170});
  assert.equal(initial.bounds.x + initial.main.x, expanded.bounds.x + expanded.main.x);
  assert.equal(initial.bounds.y + initial.main.y, expanded.bounds.y + expanded.main.y);
  assert.equal(expanded.side, 'left');
  assert.deepEqual(initial.bounds, expanded.bounds);
});
test('UI source and documentation do not contain corrupted punctuation sequences', () => {
  for (const file of ['src/main.ts', 'src/renderer/menu.html', 'README.md', 'DESIGN.md']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\u00c2\u00b7|\u00e2\u20ac|\u00c3\u0192/, file);
  }
});
