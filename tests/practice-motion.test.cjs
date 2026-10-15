"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// This harness checks timeline/state behavior without depending on browser paint.
// Browser visual checks remain necessary for the final composed page.
const staged = fs.existsSync(path.join(__dirname, "practice-motion.js"));
const source = fs.readFileSync(path.join(__dirname, staged ? "practice-motion.js" : "../js/practice-motion.js"), "utf8");
const fragments = JSON.parse(fs.readFileSync(path.join(__dirname, staged ? "practice-svg-fragments.json" : "../tools/practice-svg-fragments.json"), "utf8"));
if (!staged) {
    const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
    fragments.corporate = html.match(/data-practice="corporate">\s*(<svg[\s\S]*?<\/svg>)/)[1];
}

function harness({ fine = true, reduced = false } = {}) {
    let now = 0;
    let nextFrame = 1;
    const frames = new Map();
    const docEvents = {};
    const winEvents = {};
    const media = (matches) => ({ matches, events: {}, addEventListener(type, fn) { this.events[type] = fn; } });
    const pointer = media(fine);
    const preference = media(reduced);
    const rows = Object.entries(fragments).map(([key, fragment]) => {
        const parts = {};
        for (const match of fragment.matchAll(/<[^>]+data-motion-part="([^"]+)"[^>]*>/g)) {
            const attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
            parts[match[1]] = { attrs, setAttribute(name, value) { attrs[name] = value; } };
        }
        const svg = { parts, querySelector(selector) { return parts[selector.match(/="([^"]+)"/)[1]]; } };
        return {
            dataset: { practice: key }, svg, focus: false, events: {},
            querySelector() { return svg; },
            matches() { return this.focus; },
            addEventListener(type, fn) { this.events[type] = fn; }
        };
    });
    const document = { hidden: false, querySelectorAll() { return rows; }, addEventListener(type, fn) { docEvents[type] = fn; } };
    const window = {
        matchMedia(query) { return query.includes("reduced-motion") ? preference : pointer; },
        requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
        addEventListener(type, fn) { winEvents[type] = fn; }
    };
    vm.runInNewContext(source, { window, document, performance: { now: () => now }, queueMicrotask: (fn) => fn() });
    return {
        row: (key) => rows.find((row) => row.dataset.practice === key),
        frames, pointer, preference, document, docEvents,
        advance(ms) {
            now += ms;
            const pending = [...frames.entries()];
            pending.forEach(([id]) => frames.delete(id));
            pending.forEach(([, callback]) => callback(now));
        }
    };
}
const enter = (row) => row.events.pointerenter({ pointerType: "mouse" });
const attr = (row, part, name) => row.svg.parts[part].attrs[name];

test("corporate children grow from the parent, settle, and reset safely", () => {
    const h = harness();
    const row = h.row("corporate");
    const initial = JSON.stringify(row.svg.parts);
    enter(row);
    h.advance(320);
    assert.equal(attr(row, "child-left", "opacity"), "0");
    assert.match(attr(row, "child-left", "transform"), /^translate\(40 18\) scale\(0.08\)/);
    h.advance(480);
    assert.ok(Number(attr(row, "child-left", "opacity")) > Number(attr(row, "child-right", "opacity")));
    h.advance(1000);
    assert.equal(attr(row, "child-left", "opacity"), "1");
    assert.match(attr(row, "child-right", "transform"), /^translate\(63 60\) scale\(1\)/);
    assert.equal(h.frames.size, 0);
    row.events.pointerleave();
    h.advance(500);
    assert.equal(JSON.stringify(row.svg.parts), initial);
    for (const settings of [{fine:false}, {reduced:true}]) {
        const staticView = harness(settings);
        enter(staticView.row("corporate"));
        assert.equal(staticView.frames.size, 0);
        assert.equal(attr(staticView.row("corporate"), "child-right", "opacity"), "1");
    }
});

test("commercial spindle shrinks and rotates while only that component is animated", () => {
    const h = harness();
    const row = h.row("commercial");
    enter(row);
    h.advance(620);
    assert.match(attr(row, "spindle", "transform"), /rotate\([1-9]/);
    h.advance(1000);
    assert.match(attr(row, "spindle", "transform"), /rotate\(720\) scale\(0.44\)/);
    assert.equal(h.frames.size, 0, "hover animation must settle, not run forever");
    row.events.pointerleave();
    h.advance(400);
    assert.match(attr(row, "spindle", "transform"), /rotate\(0\) scale\(1\)/);
});

test("contract clauses meet before the seal finishes appearing", () => {
    const h = harness();
    const row = h.row("contracts");
    enter(row);
    h.advance(600);
    assert.equal(attr(row, "seal", "opacity"), "0");
    h.advance(800);
    assert.equal(attr(row, "party-left", "transform"), "translate(5 -2)");
    assert.equal(attr(row, "party-right", "transform"), "translate(-5 2)");
    assert.equal(attr(row, "seal", "opacity"), "1");
});

test("project lead first penetrates straight lines, then pulls three nested curves", () => {
    const h = harness();
    const row = h.row("projects");
    const initial = attr(row, "arch-outer", "d");
    enter(row);
    h.advance(375);
    assert.equal(attr(row, "lead", "d"), "M40 57v12");
    assert.equal(attr(row, "arch-outer", "d"), initial);
    h.advance(1500);
    assert.equal(attr(row, "lead", "d"), "M40 10v12");
    assert.match(attr(row, "arch-outer", "d"), /^M12 64 C.*40 26 /);
    assert.match(attr(row, "arch-middle", "d"), /^M20 64 C.*40 38 /);
    assert.match(attr(row, "arch-inner", "d"), /^M28 64 C.*40 50 /);
    assert.equal(h.frames.size, 0);
});

test("land plots finish separated and remain still throughout the hover", () => {
    const h = harness();
    const row = h.row("land");
    enter(row);
    h.advance(1000);
    assert.equal(attr(row, "plot-first", "transform"), "translate(-11 -11)");
    assert.equal(attr(row, "plot-second", "transform"), "translate(11 11)");
    assert.equal(h.frames.size, 0);
    h.advance(10000);
    assert.equal(attr(row, "plot-second", "transform"), "translate(11 11)");
});

test("water rings vanish, reappear tiny, travel, and return to full circles", () => {
    const h = harness();
    const row = h.row("water");
    enter(row);
    h.advance(300);
    for (const part of Object.values(row.svg.parts)) assert.equal(part.attrs.opacity, "0");
    h.advance(220);
    assert.ok(Number(attr(row, "bubble-top", "r")) < 2);
    assert.ok(Number(attr(row, "bubble-top", "opacity")) > 0);
    assert.notEqual(attr(row, "bubble-top", "cx"), "40");
    h.advance(1500);
    assert.equal(attr(row, "bubble-top", "cx"), "40");
    assert.equal(attr(row, "bubble-top", "cy"), "28");
    assert.equal(attr(row, "bubble-top", "r"), "20");
    assert.equal(attr(row, "bubble-top", "opacity"), "1");
});

test("rapid enter/leave keeps one frame and reset restores the exact start", () => {
    const h = harness();
    const row = h.row("projects");
    const initial = JSON.stringify(row.svg.parts);
    for (let i = 0; i < 7; i++) {
        enter(row);
        h.advance(100);
        row.events.pointerleave();
        h.advance(40);
        assert.ok(h.frames.size <= 1);
    }
    h.advance(500);
    assert.equal(h.frames.size, 0);
    assert.equal(JSON.stringify(row.svg.parts), initial);
});

test("coarse input, touch events, and reduced motion never start animation", () => {
    for (const settings of [{ fine: false }, { reduced: true }]) {
        const h = harness(settings);
        const row = h.row("land");
        enter(row);
        row.focus = true;
        row.events.focusin();
        assert.equal(h.frames.size, 0);
        assert.equal(attr(row, "plot-first", "transform"), "translate(0 0)");
    }
    const h = harness();
    h.row("water").events.pointerenter({ pointerType: "touch" });
    assert.equal(h.frames.size, 0);
});

test("keyboard focus plays and retains animation until focus leaves", () => {
    const h = harness();
    const row = h.row("land");
    row.focus = true;
    row.events.focusin();
    h.advance(800);
    row.events.pointerleave();
    assert.equal(h.frames.size, 0);
    assert.equal(attr(row, "plot-first", "transform"), "translate(-11 -11)");
    row.focus = false;
    row.events.focusout();
    h.advance(500);
    assert.equal(attr(row, "plot-first", "transform"), "translate(0 0)");
});

test("a preference change or hidden document cancels every pending frame", () => {
    const h = harness();
    for (const key of Object.keys(fragments)) enter(h.row(key));
    h.advance(500);
    h.preference.matches = true;
    h.preference.events.change();
    assert.equal(h.frames.size, 0);
    assert.equal(attr(h.row("water"), "bubble-top", "r"), "20");
    h.preference.matches = false;
    h.preference.events.change();
    assert.equal(h.frames.size, Object.keys(fragments).length);
    h.document.hidden = true;
    h.docEvents.visibilitychange();
    assert.equal(h.frames.size, 0);
});
