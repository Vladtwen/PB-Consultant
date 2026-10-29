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

    function formError(code, message, details = {}) {
        return Object.assign(new Error(message), { code }, details);
    }

    function needsActivation(message) {
        // Match a request to activate, not a successful "activated" response.
        return /\b(?:needs?|requires?)\s+activation\b|\b(?:not\s+(?:yet\s+|been\s+)?|isn't\s+)activated\b|\b(?:please|must|need to|have to)\s+(?:first\s+)?activate\b|\b(?:please|must|need to|have to)\s+(?:first\s+)?(?:confirm|verify)\b.{0,40}\b(?:email|address)\b|\bcheck\s+(?:your\s+)?(?:email|inbox)\b.{0,60}\b(?:activation|confirmation)\s+link\b/i.test(message);
    }

    async function send(endpoint, values, options = {}) {
        const checked = validate(values);
        if (!checked.valid) throw formError("validation", "Заполните обязательные поля.");
        const provider = options.provider || "formsubmit";
        const configurationMessage = "Приём обращений пока не настроен. Свяжитесь с бюро по телефону или в мессенджере.";
        if (provider !== "formsubmit" && provider !== "web3forms") {
            throw formError("configuration", configurationMessage);
        }
        const accessKey = typeof options.accessKey === "string" ? options.accessKey.trim() : "";
        if (provider === "web3forms" && (!accessKey || endpoint !== "https://api.web3forms.com/submit")) {
            throw formError("configuration", configurationMessage);
        }
        const payload = {
            name: checked.data.name,
            contact: checked.data.contact,
            message: checked.data.message,
            practice: checked.data.practice || "Не выбрано"
        };
        const email = emailPattern.test(checked.data.contact) ? checked.data.contact : "";
        if (provider === "web3forms") {
            payload.access_key = accessKey;
            payload.subject = "Новое обращение — ПБ Консультант";
            payload.from_name = "ПБ Консультант — сайт";
            if (email) {
                payload.email = email;
                payload.replyto = email;
            }
        } else {
            payload._subject = "Новое обращение — ПБ Консультант";
            payload._template = "table";
            if (email) payload._replyto = email;
        }

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
                referrerPolicy: "strict-origin-when-cross-origin",
                ...(provider === "web3forms" ? { redirect: "error" } : {})
            });
            const details = { status: response.status };
            let result;
            try { result = await response.json(); }
            catch { /* HTTP status still identifies an HTML error or an empty response. */ }
            if (response.status >= 500 && response.status <= 599) {
                throw formError("unavailable", "Почтовый сервис временно недоступен. Отправка не подтверждена.", details);
            }
            if (response.status === 429) {
                throw formError("rate-limit", "Почтовый сервис временно ограничил отправку. Попробуйте позже.", details);
            }
            const providerMessage = String(result?.message || result?.body?.message || "");
            if (provider === "web3forms" && !response.ok && response.status === 400
                && /\b(?:access[\s_-]*key|api[\s_-]*key)\b/i.test(providerMessage)
                && /\b(?:invalid|missing|required|expired|valid)\b|not\s+found|does\s+not\s+exist/i.test(providerMessage)) {
                throw formError("configuration", configurationMessage, details);
            }
            if (needsActivation(providerMessage)) {
                throw formError("activation", "Приём обращений ещё не активирован владельцем сайта.", details);
            }
            if (!response.ok) {
                throw formError("service", "Сервис не подтвердил отправку.", details);
            }
            if (result?.success !== true && result?.success !== "true") {
                throw formError("response", "Сервис вернул ответ без подтверждения.", details);
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
