/* Логические тесты без браузера и сторонних пакетов. Не проверяют геометрию. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element extends EventTarget {
    constructor() {
        super();
        this.value = "";
        this.hidden = true;
        this.dataset = {};
        this.textContent = "";
    }
    focus() {}
    setSelectionRange() {}
    click() { this.dispatchEvent(new Event("click")); }
}

const ids = [
    "message", "practice", "example-status", "example-preview",
    "example-text", "apply-example", "undo-example"
];
const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
const root = path.resolve(__dirname, "..");
const context = vm.createContext({ Event, console });
vm.runInContext(fs.readFileSync(path.join(root, "js/practice-examples.js"), "utf8"), context);
const examples = vm.runInContext("PRACTICE_EXAMPLES", context);
const links = Object.keys(examples).map((key) => {
    const link = new Element();
    link.dataset.practice = key;
    return link;
});
context.document = {
    documentElement: { classList: { add() {} } },
    querySelector: () => null,
    getElementById: (id) => elements[id] || null,
    querySelectorAll: (selector) => selector === "[data-practice]" ? links : []
};
vm.runInContext(fs.readFileSync(path.join(root, "js/main.js"), "utf8"), context);

assert.equal(links.length, 11);
assert.equal(new Set(Object.values(examples).map((item) => item.text)).size, 11);
for (const link of links) {
    link.click();
    assert.equal(elements.message.value, examples[link.dataset.practice].text);
    assert.equal(elements.practice.value, link.dataset.practice);
}

// Набранный текст защищен; новый пример находится в отдельном блоке.
elements.message.value = "Мой собственный вопрос";
elements.message.dispatchEvent(new Event("input"));
links.find(link => link.dataset.practice === "real-estate").click();
assert.equal(elements.message.value, "Мой собственный вопрос");
assert.equal(elements["example-preview"].hidden, false);
assert.equal(elements["example-text"].textContent, examples["real-estate"].text);

// Явная замена отменяется без потери предыдущего текста.
elements["apply-example"].click();
assert.equal(elements.message.value, examples["real-estate"].text);
elements["undo-example"].click();
assert.equal(elements.message.value, "Мой собственный вопрос");

// После ручной правки пример больше не заменяется автоматически.
elements.message.value = "";
links[1].click();
elements.message.value += " Добавил обстоятельства.";
elements.message.dispatchEvent(new Event("input"));
const edited = elements.message.value;
links[2].click();
assert.equal(elements.message.value, edited);
assert.equal(elements["undo-example"].hidden, true);

// Очистка снова разрешает подстановку.
elements.message.value = "";
elements.message.dispatchEvent(new Event("input"));
links.find(link => link.dataset.practice === "tax").click();
assert.equal(elements.message.value, examples.tax.text);
console.log("OK: 11 направлений, защита текста, явная замена, отмена и повторный выбор.");

// Смена направления во время запроса не меняет отправляемые данные.
elements["contact-form"] = { getAttribute: () => "true" };
const pendingText = elements.message.value;
const pendingPractice = elements.practice.value;
links[0].click();
assert.equal(elements.message.value, pendingText);
assert.equal(elements.practice.value, pendingPractice);
delete elements["contact-form"];
console.log("OK: смена направления заблокирована во время отправки.");
