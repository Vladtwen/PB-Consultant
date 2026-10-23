"use strict";

/* Проверка и передача обращения. Этот файл также проверяется тестами без браузера. */
(function (root) {
    const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
    const isEmpty = (value) => !value.replace(/[\s\u200B-\u200D\uFEFF]/g, "");

    function validate(values) {
        const errors = {};
        const data = {
            name: String(values.name || "").trim(),
            contact: String(values.contact || "").trim(),
            message: String(values.message || "").trim(),
            practice: String(values.practice || "").trim()
        };
        if (isEmpty(data.name)) errors.name = "Пожалуйста, представьтесь.";
        else if (data.name.length > 120) errors.name = "Имя должно быть не длиннее 120 символов.";

        const digits = data.contact.replace(/\D/g, "");
        const phone = /^\+?[\d\s().-]+$/.test(data.contact) && digits.length >= 7 && digits.length <= 15;
        if (isEmpty(data.contact)) errors.contact = "Укажите телефон или email для ответа.";
        else if (data.contact.length > 200 || !(emailPattern.test(data.contact) || phone)) {
            errors.contact = "Проверьте контакт: например, +7 900 123-45-67 или name@example.ru.";
        }

        if (isEmpty(data.message)) errors.message = "Кратко опишите вашу ситуацию.";
        else if (data.message.length > 6000) errors.message = "Описание должно быть не длиннее 6000 символов.";
        return { data, errors, valid: Object.keys(errors).length === 0 };
    }

    function formError(code, message) {
        return Object.assign(new Error(message), { code });
    }

    async function send(endpoint, values, options = {}) {
        const checked = validate(values);
        if (!checked.valid) throw formError("validation", "Заполните обязательные поля.");
        const payload = {
            name: checked.data.name,
            contact: checked.data.contact,
            message: checked.data.message,
            practice: checked.data.practice || "Не выбрано",
            _subject: "Новое обращение — ПБ Консультант",
            _template: "table"
        };
        if (emailPattern.test(checked.data.contact)) payload._replyto = checked.data.contact;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
        try {
            const request = options.fetch || root.fetch.bind(root);
            const response = await request(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
                credentials: "omit",
                referrerPolicy: "strict-origin-when-cross-origin"
            });
            if (!response.ok) throw formError("service", "Сервис не подтвердил отправку.");
            let result;
            try { result = await response.json(); }
            catch { throw formError("response", "Сервис вернул ответ без подтверждения."); }
            if (/activat|confirm.{0,20}email/i.test(String(result?.message || ""))) {
                throw formError("activation", "Приём обращений ещё не активирован владельцем сайта.");
            }
            if (result?.success !== true && result?.success !== "true") {
                throw formError("response", "Сервис не подтвердил отправку.");
            }
            return { accepted: true };
        } catch (error) {
            if (controller.signal.aborted) {
                throw formError("timeout", "Ответ сервиса не получен вовремя. Статус отправки неизвестен.");
            }
            if (error.code) throw error;
            throw formError("network", "Не удалось получить подтверждение отправки. Проверьте соединение.");
        } finally {
            clearTimeout(timer);
        }
    }

    const api = { validate, send };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.PBFormService = api;
})(globalThis);
