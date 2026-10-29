"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildContactLinks } = require("../js/contact-fallback.js");

const example = {
    name: "Анна-Мария",
    contact: "client+site@example.ru",
    practice: "Таможенные споры",
    message: "Нужна помощь с обжалованием решения."
};

test("Обе ссылки содержат полное обращение и фиксированные адреса", () => {
    const result = buildContactLinks(example);
    const mailto = new URL(result.mailto);
    const whatsapp = new URL(result.whatsapp);
    assert.equal(result.recipient, "410012a@gmail.com");
    assert.equal(result.subject, "Обращение — ПБ Консультант");
    assert.equal(mailto.protocol, "mailto:");
    assert.equal(mailto.pathname, "410012a@gmail.com");
    assert.equal(mailto.searchParams.get("subject"), result.subject);
    assert.equal(mailto.searchParams.get("body"), result.body);
    assert.equal(whatsapp.origin, "https://wa.me");
    assert.equal(whatsapp.pathname, "/79063075697");
    assert.equal(whatsapp.searchParams.get("text"), result.body);
    assert.equal(result.body, "Обращение в ПБ Консультант\r\n\r\nИмя: Анна-Мария\r\nКонтакт для ответа: client+site@example.ru\r\nНаправление: Таможенные споры\r\n\r\nОписание ситуации:\r\nНужна помощь с обжалованием решения.");
});

test("Юникод, исходные переносы, пробелы и зарезервированные символы сохраняются", () => {
    const message = "  Документ № 42: ё, е\u0301, 中文, 🧾\r\nСтрока 2\nСтрока 3\rСтрока 4\n&?=#%+ /\\ \"'!()* <текст>  ";
    const values = { ...example, name: "  Анна  ", message };
    const result = buildContactLinks(values);
    assert(result.body.includes("Имя:   Анна  \r\n"));
    assert(result.body.endsWith(message));
    assert.equal(new URL(result.mailto).searchParams.get("body"), result.body);
    assert.equal(new URL(result.whatsapp).searchParams.get("text"), result.body);
    assert.doesNotMatch(result.mailto, /[\r\n\u0080-\uFFFF]/);
    assert.doesNotMatch(result.whatsapp, /[\r\n\u0080-\uFFFF]/);
    assert.equal(values.message, message);
});

test("Поля пользователя не добавляют получателей, заголовки, параметры или фрагменты", () => {
    const attack = "\r\nBcc: stranger@example.test\r\n&cc=other@example.test&subject=замена#fragment?body=%0D%0ABcc:other";
    const result = buildContactLinks({
        name: "Анна\r\nBcc: stranger@example.test",
        contact: "javascript:alert(1)?to=other@example.test",
        message: attack,
        practice: "&bcc=other@example.test",
        recipient: "stranger@example.test",
        subject: "Подменённая тема",
        whatsapp: "https://stranger.example.test"
    });
    const mailto = new URL(result.mailto);
    const whatsapp = new URL(result.whatsapp);
    assert.equal(mailto.pathname, "410012a@gmail.com");
    assert.deepEqual([...mailto.searchParams.keys()], ["subject", "body"]);
    assert.equal(mailto.searchParams.get("subject"), "Обращение — ПБ Консультант");
    assert.equal(mailto.hash, "");
    assert.equal(whatsapp.origin, "https://wa.me");
    assert.equal(whatsapp.pathname, "/79063075697");
    assert.deepEqual([...whatsapp.searchParams.keys()], ["text"]);
    assert.equal(whatsapp.hash, "");
    assert(new URL(result.mailto).searchParams.get("body").endsWith(attack));
    assert.match(result.mailto, /%250D%250A/);
});

test("Максимальные допустимые поля сохраняются целиком, длинные ссылки не обрезаются", () => {
    const values = Object.freeze({ name: "Я".repeat(120), contact: "c".repeat(200), practice: "П".repeat(200), message: "я".repeat(5998) + "🧾" });
    const result = buildContactLinks(values);
    assert(result.body.endsWith(values.message));
    assert(result.mailto.length > 30000);
    assert.equal(new URL(result.mailto).searchParams.get("body"), result.body);
    assert.equal(new URL(result.whatsapp).searchParams.get("text"), result.body);
});

test("Превышение лимита выдаёт ошибку вместо скрытого удаления части текста", () => {
    for (const [field, limit] of Object.entries({ name: 120, contact: 200, message: 6000, practice: 200 })) {
        const values = { ...example, [field]: "я".repeat(limit + 1) };
        assert.throws(() => buildContactLinks(values), (error) => error instanceof RangeError && error.code === "too-long" && error.field === field);
        assert.equal(values[field].length, limit + 1);
    }
});

test("Пустое направление и отсутствующие поля допускаются; нет неявного преобразования объектов", () => {
    assert(buildContactLinks().body.includes("Направление: Не выбрано"));
    assert(buildContactLinks({ ...example, practice: null }).body.includes("Направление: Не выбрано"));
    assert.throws(() => buildContactLinks(null), { code: "invalid-type" });
    assert.throws(() => buildContactLinks([]), { code: "invalid-type" });
    assert.throws(() => buildContactLinks({ ...example, message: {} }), { code: "invalid-type", field: "message" });
});

test("Браузерный API только формирует ссылки: сеть, переходы и буфер обмена не используются", () => {
    const effects = [];
    const forbidden = (name) => () => { effects.push(name); throw new Error(name); };
    const context = vm.createContext({
        fetch: forbidden("fetch"),
        XMLHttpRequest: forbidden("XMLHttpRequest"),
        open: forbidden("open"),
        location: { assign: forbidden("navigate"), replace: forbidden("navigate") },
        navigator: { clipboard: { writeText: forbidden("clipboard") } },
        document: { createElement: forbidden("DOM"), querySelector: forbidden("DOM") }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/contact-fallback.js"), "utf8"), context);
    assert.equal(typeof context.PBContactFallback.buildLinks, "function");
    const result = context.PBContactFallback.buildLinks(example);
    assert.equal(result.body, buildContactLinks(example).body);
    assert.deepEqual(effects, []);
});
