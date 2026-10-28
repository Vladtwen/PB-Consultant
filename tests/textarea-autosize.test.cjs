const { test } = require("node:test");
const assert = require("node:assert/strict");
const { attachTextareaAutosize } = require("../js/textarea-autosize.js");

function fixture({ value = "", width = 200, maxRows, boxSizing = "border-box", fonts } = {}) {
    const field = new EventTarget();
    Object.assign(field, {
        value, width, scrollTop: 0, style: {}, dataset: { autosizeMaxRows: maxRows },
        form: new EventTarget(), ownerDocument: { fonts },
        getBoundingClientRect() { return { width: this.width }; }
    });
    let measurements = 0;
    Object.defineProperty(field, "scrollHeight", { get() {
        measurements++;
        const charsPerLine = Math.max(1, Math.floor(this.width / 10));
        const lines = this.value.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
        // Like a real textarea, scrollHeight cannot shrink below its current client height.
        const currentHeight = Number.parseFloat(this.style.height) || 0;
        const clientHeight = boxSizing === "border-box" ? currentHeight - 2 : currentHeight + 16;
        return Math.max(lines * 20 + 16, clientHeight);
    } });
    const frames = new Map();
    let nextFrame = 0;
    let observer;
    const view = new EventTarget();
    Object.assign(view, {
        getComputedStyle: () => ({ lineHeight: "20px", fontSize: "16px", paddingTop: "8px", paddingBottom: "8px", borderTopWidth: "1px", borderBottomWidth: "1px", boxSizing }),
        requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame(id) { frames.delete(id); },
        ResizeObserver: class {
            constructor(callback) { observer = this; this.callback = callback; }
            observe(target) { this.target = target; }
            disconnect() { this.disconnected = true; }
        }
    });
    const controller = attachTextareaAutosize(field, view);
    const flush = () => {
        const ready = [...frames.values()];
        frames.clear();
        ready.forEach(callback => callback());
    };
    const input = (text, event = "input") => { field.value = text; field.dispatchEvent(new Event(event)); flush(); };
    return { field, view, controller, flush, input, observer, frames, measurements: () => measurements };
}

test("empty field and one line have the same input-sized height", () => {
    const f = fixture();
    assert.equal(f.field.style.height, "38px");
    assert.equal(f.field.style.overflowY, "hidden");
    assert.equal(f.measurements(), 0, "empty placeholder does not decide the height");
    f.input("Короткая задача");
    assert.equal(f.field.style.height, "38px");
});

test("typed or pasted text grows with measured lines, caps at six, and shrinks after deletion", () => {
    const f = fixture();
    f.input("одна\nдве\nтри\nчетыре");
    assert.equal(f.field.style.height, "98px");
    assert.equal(f.field.style.overflowY, "hidden");
    f.input(Array(6).fill("строка").join("\n"));
    assert.equal(f.field.style.height, "138px");
    assert.equal(f.field.style.overflowY, "hidden");
    f.input(Array(10).fill("строка").join("\n"));
    assert.equal(f.field.style.height, "138px");
    assert.equal(f.field.style.overflowY, "auto");
    f.input("одна");
    assert.equal(f.field.style.height, "38px");
    assert.equal(f.field.style.overflowY, "hidden");
    f.input("");
    assert.equal(f.field.style.height, "38px");
});

test("container width reflows existing text; height notifications do not cause a loop", () => {
    const f = fixture({ value: "12345678901234567890" });
    assert.equal(f.field.style.height, "38px");
    f.field.width = 50;
    f.observer.callback(); f.flush();
    assert.equal(f.field.style.height, "98px");
    f.observer.callback();
    assert.equal(f.frames.size, 0);
    f.field.width = 200;
    f.observer.callback(); f.flush();
    assert.equal(f.field.style.height, "38px");
});

test("window resizing and restored or prefilled values are measured without typing", () => {
    const f = fixture({ value: "12345678901234567890" });
    f.field.width = 100;
    f.view.dispatchEvent(new Event("resize")); f.flush();
    assert.equal(f.field.style.height, "58px");
    f.input("первая\nвторая\nтретья", "autosize");
    assert.equal(f.field.style.height, "78px");
    f.field.value = "одна";
    f.view.dispatchEvent(new Event("pageshow")); f.flush();
    assert.equal(f.field.style.height, "38px");
    f.input("первая\nвторая", "change");
    assert.equal(f.field.style.height, "58px");
});

test("form reset is measured after default values have been restored", () => {
    const f = fixture({ value: "первая\nвторая\nтретья" });
    f.field.form.dispatchEvent(new Event("reset"));
    f.field.value = "";
    f.flush();
    assert.equal(f.field.style.height, "38px");
    assert.equal(f.field.style.overflowY, "hidden");
});

test("content-box sizing and a custom row cap account for padding only once", () => {
    const f = fixture({ boxSizing: "content-box", maxRows: "2" });
    assert.equal(f.field.style.height, "20px");
    f.input("одна\nдве\nтри");
    assert.equal(f.field.style.height, "40px");
    assert.equal(f.field.style.overflowY, "auto");
    f.input("одна");
    assert.equal(f.field.style.height, "20px");
});

test("capped input keeps the active end caret visible and preserves middle editing position", () => {
    const f = fixture({ value: Array(10).fill("строка").join("\n") });
    f.field.ownerDocument.activeElement = f.field;
    f.field.selectionStart = f.field.selectionEnd = f.field.value.length;
    f.field.dispatchEvent(new Event("input")); f.flush();
    assert.equal(f.field.scrollTop, 216, "native element clamps this to its maximum scroll position");
    f.field.selectionStart = f.field.selectionEnd = 25;
    f.field.scrollTop = 40;
    f.field.dispatchEvent(new Event("input")); f.flush();
    assert.equal(f.field.scrollTop, 40);
    f.input("коротко");
    assert.equal(f.field.scrollTop, 0);
});

test("a previously hidden field is measured when shown, without destroying fallback styles", () => {
    const f = fixture({ width: 0, value: "одна\nдве" });
    assert.equal(f.field.style.height, undefined);
    f.field.width = 200;
    f.observer.callback(); f.flush();
    assert.equal(f.field.style.height, "58px");
});

test("font readiness schedules a remeasure and repeated events share one frame", async () => {
    let ready;
    const f = fixture({ fonts: { ready: new Promise(resolve => { ready = resolve; }) } });
    f.field.value = "одна\nдве";
    ready(); await Promise.resolve();
    f.field.dispatchEvent(new Event("input"));
    f.field.dispatchEvent(new Event("focus"));
    assert.equal(f.frames.size, 1);
    f.flush();
    assert.equal(f.field.style.height, "58px");
});
