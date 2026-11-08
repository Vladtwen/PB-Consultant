const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// These interaction checks model disclosure behaviour, not responsive geometry.
const source = fs.readFileSync(path.join(__dirname, '../js/navigation.js'), 'utf8');
class Target extends EventTarget {
  emit(type, properties = {}) {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
    this.dispatchEvent(event);
    return event;
  }
}
function fixture() {
  const document = new Target();
  const window = new Target();
  Object.assign(window, { innerWidth: 390, scrollY: 0 });
  const header = new Target();
  const button = new Target();
  const menu = new Target();
  const link = new Target();
  const outside = new Target();
  const attributes = {};
  const classes = new Map();
  header.classList = { toggle: (name, value) => classes.set(name, value) };
  header.contains = target => [header, button, menu, link].includes(target);
  button.hidden = true;
  button.setAttribute = (name, value) => { attributes[name] = value; };
  button.focus = () => { document.activeElement = button; document.emit('focusin', { target: button }); };
  menu.hidden = true;
  menu.querySelectorAll = () => [link];
  document.querySelector = selector => selector === '.header' ? header : button;
  document.getElementById = () => menu;
  vm.runInNewContext(source, { document, window });
  return { document, window, header, button, menu, link, outside, attributes, classes };
}

test('menu starts collapsed and toggles a matching label and visible symbol', () => {
  const f = fixture();
  assert.equal(f.button.hidden, false);
  assert.equal(f.menu.hidden, true);
  assert.equal(f.attributes['aria-expanded'], 'false');
  assert.equal(f.button.textContent, '☰');
  f.button.emit('click');
  assert.equal(f.menu.hidden, false);
  assert.equal(f.attributes['aria-expanded'], 'true');
  assert.equal(f.attributes['aria-label'], 'Закрыть меню');
  assert.equal(f.button.textContent, '×');
  f.button.emit('click');
  assert.equal(f.menu.hidden, true);
  assert.equal(f.attributes['aria-label'], 'Открыть меню');
  assert.equal(f.button.textContent, '☰');
});

test('Escape restores focus; outside clicks and focus close without stealing focus', () => {
  const f = fixture();
  f.button.emit('click');
  const escape = f.document.emit('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.menu.hidden, true);
  assert.equal(f.document.activeElement, f.button);
  f.button.emit('click');
  f.document.emit('click', { target: f.link });
  assert.equal(f.menu.hidden, false, 'interactions inside the header do not count as outside');
  f.document.activeElement = f.outside;
  f.document.emit('click', { target: f.outside });
  assert.equal(f.menu.hidden, true);
  assert.equal(f.document.activeElement, f.outside);
  f.button.emit('click');
  f.document.emit('focusin', { target: f.outside });
  assert.equal(f.menu.hidden, true);
  assert.equal(f.document.activeElement, f.outside);
  assert.equal(f.document.emit('keydown', { key: 'Escape' }).defaultPrevented, false);
});

test('following a link closes the menu and rotating beyond 900px resets it', () => {
  const f = fixture();
  f.button.emit('click');
  f.link.emit('click');
  assert.equal(f.menu.hidden, true);
  f.button.emit('click');
  f.window.innerWidth = 900;
  f.window.emit('resize');
  assert.equal(f.menu.hidden, false, '900px is still the mobile layout');
  f.window.innerWidth = 901;
  f.window.emit('resize');
  assert.equal(f.menu.hidden, true, 'desktop navigation must not retain an open mobile panel');
  assert.equal(f.attributes['aria-expanded'], 'false');
  f.window.innerWidth = 390;
  f.window.emit('resize');
  assert.equal(f.menu.hidden, true, 'returning to a phone does not reopen an old panel');
});

test('scroll state remains available and pages without a header do not fail', () => {
  const f = fixture();
  assert.equal(f.classes.get('scrolled'), false);
  f.window.scrollY = 50;
  f.window.emit('scroll');
  assert.equal(f.classes.get('scrolled'), true);
  assert.doesNotThrow(() => vm.runInNewContext(source, {
    document: { querySelector: () => null, getElementById: () => null }
  }));
});
