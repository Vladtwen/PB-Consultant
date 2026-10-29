/* Реальные проверки границ ввода и ответов сервиса. Никаких писем тест не отправляет. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../js/form-service.js");
const valid = { name: " Тест ", contact: "client@example.ru", message: " Нужна проверка договора. " };
const response = (body, ok = true, status = ok ? 200 : 400) => async () => ({ ok, status, json: async () => body });

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

test("Подтверждённый сбой FormSubmit 521 сохраняет статус и не повторяет запрос", async () => {
    const captured = {
        status: 521,
        error_code: 521,
        error_name: "origin_down",
        zone: "formsubmit.co",
        title: "Error 521: Web server is down",
        retry_after: 120
    };
    let calls = 0;
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: async () => {
            calls++;
            return { ok: false, status: 521, json: async () => captured };
        }
    }), { code: "unavailable", status: 521 });
    assert.equal(calls, 1);
});

test("Активация распознаётся в JSON ошибочного HTTP-ответа", async () => {
    for (const message of [
        "This form needs activation",
        "This form is not activated yet",
        "Please activate this form",
        "Please confirm your email address",
        "Please check your email for a confirmation link."
    ]) {
        await assert.rejects(service.send("https://example.test/form", valid, {
            fetch: response({ success: false, message }, false, 403)
        }), { code: "activation", status: 403 });
    }
});

test("Ограничение 429 и серверный сбой 5xx различаются даже без корректного JSON", async () => {
    for (const [status, code] of [[429, "rate-limit"], [500, "unavailable"], [503, "unavailable"], [521, "unavailable"]]) {
        for (const malformed of [false, true]) {
            await assert.rejects(service.send("https://example.test/form", valid, {
                fetch: async () => ({
                    ok: false, status,
                    json: async () => { if (malformed) throw new SyntaxError("HTML response"); return { success: false }; }
                })
            }), { code, status });
        }
    }
});

test("Сообщение об успешной активации не отвергает подтверждённую отправку", async () => {
    for (const message of ["Form activated successfully", "Your email is confirmed", "Activation complete"]) {
        assert.deepEqual(await service.send("https://example.test/form", valid, {
            fetch: response({ success: true, message })
        }), { accepted: true });
    }
});

test("Неизвестный ответ или некорректный JSON не подтверждают доставку, статус сохраняется", async () => {
    for (const body of [{ success: false, message: "Unknown provider problem" }, {}, null]) {
        await assert.rejects(service.send("https://example.test/form", valid, {
            fetch: response(body)
        }), { code: "response", status: 200 });
    }
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("HTML response"); } })
    }), { code: "response", status: 200 });
    await assert.rejects(service.send("https://example.test/form", valid, {
        fetch: response({ success: true }, false, 400)
    }), { code: "service", status: 400 });
});

const web3Endpoint = "https://api.web3forms.com/submit";
const web3Options = { provider: "web3forms", accessKey: "test-public-access-key" };

test("Web3Forms получает только согласованные поля и email посетителя для ответа", async () => {
    const values = { ...valid, contact: " client@example.ru ", practice: "Недвижимость", ccemail: "unwanted@example.test", email: "fabricated@example.test", redirect: "https://example.test/" };
    let request;
    assert.deepEqual(await service.send(web3Endpoint, values, {
        ...web3Options, accessKey: " test-public-access-key ",
        fetch: async (url, options) => {
            request = { url, options };
            return { ok: true, status: 200, json: async () => ({ success: true, body: { message: "Email sent successfully!" } }) };
        }
    }), { accepted: true });
    assert.equal(request.url, web3Endpoint);
    assert.deepEqual(JSON.parse(request.options.body), {
        name: "Тест", contact: "client@example.ru", message: "Нужна проверка договора.", practice: "Недвижимость",
        access_key: "test-public-access-key", subject: "Новое обращение — ПБ Консультант", from_name: "ПБ Консультант — сайт",
        email: "client@example.ru", replyto: "client@example.ru"
    });
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.redirect, "error");
    assert.equal(request.options.credentials, "omit");
});

test("Web3Forms принимает телефон без выдуманного email и Reply-To", async () => {
    await service.send(web3Endpoint, { ...valid, contact: "+7 900 123-45-67", email: "fabricated@example.test" }, {
        ...web3Options,
        fetch: async (_, options) => {
            const payload = JSON.parse(options.body);
            assert.equal(payload.contact, "+7 900 123-45-67");
            assert.equal(Object.hasOwn(payload, "email"), false);
            assert.equal(Object.hasOwn(payload, "replyto"), false);
            assert.deepEqual(Object.keys(payload).sort(), ["access_key", "contact", "from_name", "message", "name", "practice", "subject"]);
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
    });
});

test("Web3Forms без ключа не отправляет запрос", async () => {
    for (const accessKey of [undefined, "", " \n\t ", null]) {
        let called = false;
        await assert.rejects(service.send(web3Endpoint, valid, {
            ...web3Options, accessKey, fetch: async () => { called = true; }
        }), { code: "configuration" });
        assert.equal(called, false);
    }
});

test("Публичный ключ Web3Forms нельзя отправить на другой адрес", async () => {
    for (const endpoint of ["https://example.test/form", "http://api.web3forms.com/submit", "https://api.web3forms.com/submit/", "https://api.web3forms.com/submit?to=other", "https://api.web3forms.com.example.test/submit"]) {
        let called = false;
        await assert.rejects(service.send(endpoint, valid, {
            ...web3Options, fetch: async () => { called = true; }
        }), { code: "configuration" });
        assert.equal(called, false);
    }
    let called = false;
    await assert.rejects(service.send(web3Endpoint, valid, {
        provider: "unknown", accessKey: "test-public-access-key", fetch: async () => { called = true; }
    }), { code: "configuration" });
    assert.equal(called, false);
});

test("Ошибка ключа Web3Forms даёт безопасное сообщение конфигурации без тела ответа", async () => {
    for (const body of [
        { success: false, message: "The access key is invalid: provider-private-diagnostic" },
        { success: false, body: { message: "Please enter a valid access key: provider-private-diagnostic" } }
    ]) {
        await assert.rejects(service.send(web3Endpoint, valid, {
            ...web3Options, fetch: response(body, false, 400)
        }), (error) => {
            assert.equal(error.code, "configuration");
            assert.equal(error.status, 400);
            assert.match(error.message, /Свяжитесь с бюро/);
            assert.doesNotMatch(error.message, /provider-private-diagnostic|test-public-access-key/);
            return true;
        });
    }
});

test("Web3Forms не принимает HTTP-ошибку или ответ без явного success", async () => {
    for (const [body, ok, status, code] of [
        [{ success: true }, false, 400, "service"],
        [{ success: false }, true, 200, "response"],
        [{ success: "false" }, true, 200, "response"],
        [{ body: { message: "Email sent successfully!" } }, true, 200, "response"],
        [{ success: false }, false, 429, "rate-limit"],
        [{ success: true }, false, 503, "unavailable"]
    ]) {
        await assert.rejects(service.send(web3Endpoint, valid, {
            ...web3Options, fetch: response(body, ok, status)
        }), { code, status });
    }
    await assert.rejects(service.send(web3Endpoint, valid, {
        ...web3Options,
        fetch: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Not JSON"); } })
    }), { code: "response", status: 200 });
});
