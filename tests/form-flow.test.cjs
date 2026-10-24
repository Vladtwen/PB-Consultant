/* Сценарии формы в лёгкой модели DOM. Не заменяют визуальную проверку браузером. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const service = require("../js/form-service.js");

class Element extends EventTarget {
    constructor(id) {
        super(); this.id = id; this.value = ""; this.checked = false;
        this.dataset = {}; this.hidden = false; this.disabled = false; this.attributes = {};
        this.textContent = ""; this.open = false; this.returnValue = "";
        this.classList = { add() {}, toggle() {} };
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close(value) { this.open = false; this.returnValue = value; this.dispatchEvent(new Event("close")); }
    click() { this.dispatchEvent(new Event("click")); }
}

function setup(send = async () => ({ accepted: true })) {
    const ids = ["contact-form", "submit-request", "form-status", "send-warning", "confirm-send", "cancel-send",
        "name", "contact", "message", "practice", "name-error", "contact-error",
        "message-error", "honey", "warning-acknowledgement"];
    const el = Object.fromEntries(ids.map((id) => [id, new Element(id)]));
    const controls = ["name", "contact", "message", "practice", "honey", "submit-request"].map(id => el[id]);
    el["contact-form"].dataset.endpoint = "https://example.test/form";
    el["contact-form"].querySelectorAll = () => controls;
    el["contact-form"].querySelector = () => el.honey;
    const context = vm.createContext({
        Event, console, PBFormService: { ...service, send },
        document: { getElementById: id => el[id] },
        window: { location: { protocol: "https:" } }
    });
    const source = fs.readFileSync(path.join(__dirname, "../js/main.js"), "utf8");
    vm.runInContext(source.slice(source.indexOf("function setupContactForm()")), context);
    vm.runInContext("setupContactForm()", context);
    const submit = () => el["contact-form"].dispatchEvent(new Event("submit", { cancelable: true }));
    const fill = () => {
        el.name.value = "Тест"; el.contact.value = "client@example.ru";
        el.message.value = "Проверка договора";
    };
    const acknowledge = (checked = true) => {
        el["warning-acknowledgement"].checked = checked;
        el["warning-acknowledgement"].dispatchEvent(new Event("change"));
    };
    return { el, submit, fill, acknowledge };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("Пустая форма показывает ошибки и не открывает подтверждение", () => {
    const { el, submit } = setup(); submit();
    assert.equal(el["form-status"].dataset.state, "error");
    assert.equal(el["name-error"].hidden, false);
    assert.equal(el.name.attributes["aria-invalid"], "true");
    assert.equal(el.name.focused, true);
    assert.equal(el["send-warning"].open, false);
});
test("Кнопка отправки открывает предупреждение; отмена сохраняет текст", () => {
    let calls = 0;
    const { el, submit, fill, acknowledge } = setup(async () => { calls++; });
    fill(); submit();
    assert.equal(el["send-warning"].open, true);
    assert.equal(calls, 0);
    acknowledge();
    el["cancel-send"].click();
    assert.equal(el["send-warning"].open, false);
    assert.equal(el.message.value, "Проверка договора");
    assert.equal(calls, 0);
    assert.equal(el["warning-acknowledgement"].checked, false);
    submit();
    assert.equal(el["confirm-send"].disabled, true);
    assert.equal(el["warning-acknowledgement"].checked, false);
});
test("Escape после повторного открытия отменяет отправку", () => {
    const { el, submit, fill, acknowledge } = setup(); fill(); submit();
    acknowledge();
    el["send-warning"].returnValue = "send";
    el["send-warning"].dispatchEvent(new Event("cancel"));
    el["send-warning"].close(el["send-warning"].returnValue);
    assert.match(el["form-status"].textContent, /отменена/);
    assert.equal(el["warning-acknowledgement"].checked, false);
    submit();
    assert.equal(el["confirm-send"].disabled, true);
});
test("Подтверждение отправляет один раз; во время ожидания поля блокируются", async () => {
    let finish, calls = 0;
    const { el, submit, fill, acknowledge } = setup(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
    fill(); submit(); acknowledge(); el["confirm-send"].click();
    assert.equal(calls, 1);
    assert.equal(el["form-status"].dataset.state, "pending");
    assert.equal(el["submit-request"].disabled, true);
    assert.equal(el.message.disabled, true);
    submit(); el["confirm-send"].click();
    assert.equal(calls, 1);
    finish({ accepted: true }); await tick();
    assert.equal(el["form-status"].dataset.state, "success");
    assert.equal(el.message.value, "Проверка договора");
    assert.equal(el.message.disabled, false);
    assert.equal(el["submit-request"].disabled, true);
    submit(); assert.equal(calls, 1);
    el.message.value += " Дополнение";
    el["contact-form"].dispatchEvent(new Event("input"));
    assert.equal(el["submit-request"].disabled, false);
});
test("Ошибка сохраняет данные и даёт повторить через предупреждение", async () => {
    const { el, submit, fill, acknowledge } = setup(async () => { throw Object.assign(Error("Сбой"), { code: "service" }); });
    fill(); submit(); acknowledge(); el["confirm-send"].click(); await tick();
    assert.equal(el["form-status"].dataset.state, "error");
    assert.equal(el.message.value, "Проверка договора");
    assert.equal(el.contact.value, "client@example.ru");
    assert.equal(el["submit-request"].disabled, false);
    submit(); assert.equal(el["send-warning"].open, true);
});

test("Без отдельной галочки даже программный click не передаёт данные", () => {
    let calls = 0;
    const { el, submit, fill, acknowledge } = setup(async () => { calls++; });
    fill(); submit();
    assert.equal(el["confirm-send"].disabled, true);
    el["confirm-send"].click();
    assert.equal(calls, 0);
    assert.equal(el["send-warning"].open, true);
    acknowledge();
    assert.equal(el["confirm-send"].disabled, false);
    acknowledge(false);
    assert.equal(el["confirm-send"].disabled, true);
    el["confirm-send"].click();
    assert.equal(calls, 0);
});
test("Ошибка требует нового подтверждения при повторной отправке", async () => {
    let calls = 0;
    const { el, submit, fill, acknowledge } = setup(async () => {
        calls++;
        if (calls === 1) throw Object.assign(Error("Сервис недоступен"), { code: "service" });
        return { accepted: true };
    });
    fill(); submit(); acknowledge(); el["confirm-send"].click(); await tick();
    assert.equal(calls, 1);
    assert.equal(el["warning-acknowledgement"].checked, false);
    assert.equal(el["confirm-send"].disabled, true);
    submit();
    el["confirm-send"].click();
    assert.equal(calls, 1);
    assert.equal(el.message.value, "Проверка договора");
    acknowledge(); el["confirm-send"].click(); await tick();
    assert.equal(calls, 2);
    assert.equal(el["form-status"].dataset.state, "success");
});
test("Форма без элемента consent отправляет только данные обращения после подтверждения предупреждения", async () => {
    let submitted;
    const { el, submit, fill, acknowledge } = setup(async (endpoint, data) => {
        submitted = data;
        return { accepted: true };
    });
    assert.equal(el.consent, undefined);
    fill(); submit();
    assert.equal(submitted, undefined);
    acknowledge(); el["confirm-send"].click(); await tick();
    assert.equal(el["form-status"].dataset.state, "success");
    assert.equal(submitted.name, "Тест");
    assert.equal(submitted.contact, "client@example.ru");
    assert.equal(submitted.message, "Проверка договора");
    assert.deepEqual(Object.keys(submitted).sort(), ["contact", "message", "name", "practice"]);
});
test("Изменение контакта на невалидный после открытия предупреждения блокирует отправку", () => {
    let calls = 0;
    const { el, submit, fill, acknowledge } = setup(async () => { calls++; });
    fill(); submit(); acknowledge();
    el.contact.value = "не телефон";
    el["confirm-send"].click();
    assert.equal(calls, 0);
    assert.equal(el["form-status"].dataset.state, "error");
    assert.equal(el["contact-error"].hidden, false);
    assert.equal(el.contact.focused, true);
    assert.equal(el["warning-acknowledgement"].checked, false);
});
