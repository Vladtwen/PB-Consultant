"use strict";

/* Compose links only. Opening a composer and sending remain explicit user actions. */
(function (root) {
    const recipient = "410012a@gmail.com";
    const subject = "Обращение — ПБ Консультант";
    const whatsappNumber = "79063075697";
    const limits = { name: 120, contact: 200, message: 6000, practice: 200 };

    function readField(values, field) {
        const value = values[field] == null ? "" : values[field];
        if (typeof value !== "string") {
            throw Object.assign(new TypeError(`Поле ${field} должно содержать текст.`), {
                code: "invalid-type", field
            });
        }
        if (value.length > limits[field]) {
            throw Object.assign(new RangeError(`Поле ${field} превышает ${limits[field]} символов.`), {
                code: "too-long", field
            });
        }
        return value;
    }

    // Encode every user-controlled character inside one query value, never a header or address.
    const encodeQuery = (text) => encodeURIComponent(text).replace(/[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

    function buildContactLinks(values = {}) {
        if (!values || typeof values !== "object" || Array.isArray(values)) {
            throw Object.assign(new TypeError("Ожидались поля обращения."), { code: "invalid-type" });
        }
        const name = readField(values, "name");
        const contact = readField(values, "contact");
        const message = readField(values, "message");
        const practice = readField(values, "practice");
        const body = [
            "Обращение в ПБ Консультант",
            "",
            `Имя: ${name || "Не указано"}`,
            `Контакт для ответа: ${contact || "Не указан"}`,
            `Направление: ${practice || "Не выбрано"}`,
            "",
            "Описание ситуации:",
            message
        ].join("\r\n");
        const encodedBody = encodeQuery(body);
        // Long messages are deliberately kept intact. Clients may limit URL length;
        // callers can also offer the complete body for manual copying.
        return {
            recipient,
            subject,
            body,
            mailto: `mailto:${recipient}?subject=${encodeQuery(subject)}&body=${encodedBody}`,
            whatsapp: `https://wa.me/${whatsappNumber}?text=${encodedBody}`
        };
    }

    if (typeof module !== "undefined" && module.exports) module.exports = { buildContactLinks };
    else root.PBContactFallback = { buildLinks: buildContactLinks };
})(globalThis);
