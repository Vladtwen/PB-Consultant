/* Реальные проверки границ ввода и ответов сервиса. Никаких писем тест не отправляет. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../js/form-service.js");
const valid = { name: " Тест ", contact: "client@example.ru", message: " Нужна проверка договора. " };
const response = (body, ok = true) => async () => ({ ok, json: async () => body });

test("Пустые обязательные поля и пробелы блокируют запрос", () => {
    for (const empty of ["", " \n\t ", "\u200b"]) {
        const result = service.validate({ name: empty, contact: empty, message: empty });
        assert.deepEqual(Object.keys(result.errors), ["name", "contact", "message"]);
    }
});
test("Устаревшее поле согласия не влияет на проверку и не попадает в письмо", async () => {
    for (const consent of [undefined, false, true]) {
        const values = { ...valid, consent };
        const checked = service.validate(values);
        assert.equal(checked.valid, true);
        assert.equal(Object.hasOwn(checked.data, "consent"), false);
        await service.send("https://example.test/form", values, {
            fetch: async (_, options) => {
                const payload = JSON.parse(options.body);
                assert.deepEqual(Object.keys(payload).sort(), ["_replyto", "_subject", "_template", "contact", "message", "name", "practice"]);
                assert.doesNotMatch(options.body, /Согласие получено/);
                return { ok: true, json: async () => ({ success: true }) };
            }
        });
    }
});
test("Телефон или email; ограничение длины телефона и полей", () => {
    for (const contact of ["+7 (900) 123-45-67", "8 900 123 45 67", "client+site@example.ru"]) {
        assert.equal(service.validate({ ...valid, contact }).valid, true);
    }
    for (const contact of ["123", "не телефон", "a@b", "+1234567890123456", "a b@example.ru", "client@example..ru "]) {
        assert.ok(service.validate({ ...valid, contact }).errors.contact);
    }
    assert.ok(service.validate({ ...valid, name: "я".repeat(121) }).errors.name);
    assert.ok(service.validate({ ...valid, message: "я".repeat(6001) }).errors.message);
});
test("Письмо содержит обрезанный текст, направление и Reply-To; вложений нет", async () => {
    let request;
    await service.send("https://example.test/form", { ...valid, practice: "Недвижимость" }, {
        fetch: async (url, options) => {
            request = { url, options };
            return { ok: true, json: async () => ({ success: "true" }) };
        }
    });
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.name, "Тест");
    assert.equal(payload.message, "Нужна проверка договора.");
    assert.equal(payload._replyto, "client@example.ru");
    assert.equal(payload.practice, "Недвижимость");
    assert.equal(Object.hasOwn(payload, "attachment"), false);
    assert.equal(request.options.credentials, "omit");
});
test("Для телефона Reply-To не подставляется", async () => {
    await service.send("https://example.test/form", { ...valid, contact: "+7 900 123-45-67" }, {
        fetch: async (_, options) => {
            assert.equal(Object.hasOwn(JSON.parse(options.body), "_replyto"), false);
            return { ok: true, json: async () => ({ success: true }) };
        }
    });
});
test("Невалидные данные не доходят до сети", async () => {
    let called = false;
    await assert.rejects(service.send("https://example.test/form", {}, {
        fetch: async () => { called = true; }
    }), { code: "validation" });
    assert.equal(called, false);
});
test("Только успешный HTTP и явное подтверждение считаются успехом", async () => {
    for (const success of [true, "true"]) {
        assert.deepEqual(await service.send("https://example.test/form", valid, {
            fetch: response({ success })
        }), { accepted: true });
    }
    for (const body of [{ success: false }, { success: "false" }, {}, null]) {
        await assert.rejects(service.send("https://example.test/form", valid, {
            fetch: response(body)
        }), { code: "response" });
    }
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: response({ success: true }, false)
    }), { code: "service" });
});
test("Активация, HTML вместо JSON, сбой сети и таймаут не показывают успех", async () => {
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: response({ success: true, message: "This form needs activation" })
    }), { code: "activation" });
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: async () => ({ ok: true, json: async () => { throw Error("HTML"); } })
    }), { code: "response" });
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: async () => { throw Error("Network disconnected"); }
    }), { code: "network" });
    await assert.rejects(service.send("https://example.test/form", valid, {
        timeoutMs: 15,
        fetch: (_, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => reject(Error("aborted")));
        })
    }), { code: "timeout" });
});
