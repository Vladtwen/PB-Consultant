const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'js/page-loader.js'), 'utf8');

function fixture(decode) {
  const classes = new Set(['pb-loading']);
  const timers = [];
  let removed = false;
  const loader = {classList: {add() {}}, remove() {removed = true;}};
  const document = {
    documentElement: {classList: {contains: x => classes.has(x), remove: x => classes.delete(x), add: x => classes.add(x)}},
    getElementById: () => loader,
    querySelector: () => ({decode})
  };
  const context = {document, window: {matchMedia: () => ({matches:false})}, setTimeout: fn => timers.push(fn)};
  return {context, classes, timers, removed: () => removed};
}

test('hero decode releases loader without waiting for offscreen images', async () => {
  const f = fixture(() => Promise.resolve());
  vm.runInNewContext(code, f.context);
  await new Promise(setImmediate);
  f.timers.forEach(fn => fn());
  assert.equal(f.classes.has('pb-loading'), false);
  assert.equal(f.removed(), true);
});

test('broken hero image still releases page', async () => {
  const f = fixture(() => Promise.reject(new Error('image unavailable')));
  vm.runInNewContext(code, f.context);
  await new Promise(setImmediate);
  f.timers.forEach(fn => fn());
  assert.equal(f.classes.has('pb-loading'), false);
});

test('inline fallback reveals content when external loader never loads', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const f = fixture(() => new Promise(() => {}));
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], f.context);
  assert.ok(f.timers.length);
  f.timers.forEach(fn => fn());
  assert.equal(f.classes.has('pb-loading'), false);
});
