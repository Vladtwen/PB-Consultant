"use strict";

document.documentElement.classList.add("js-enabled");

setupMobileMenu();
setupImageSlots();
setupCaseDialogs();
setupPracticeExamples();
setupContactForm();

/* Шапка и мобильное меню */
function setupMobileMenu() {
    const header = document.querySelector(".header");
    const button = document.querySelector(".menu-button");
    const menu = document.querySelector("#mobile-nav");

    if (!header || !button || !menu) return;
    button.hidden = false;

    function setOpen(open) {
        menu.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
        button.textContent = open ? "×" : "☰";
    }

    function updateHeader() {
        header.classList.toggle("scrolled", window.scrollY > 20);
    }

    button.addEventListener("click", () => setOpen(menu.hidden));
    menu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setOpen(false));
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            setOpen(false);
            button.focus();
        }
    });
    window.addEventListener("resize", () => {
        if (window.innerWidth > 950) setOpen(false);
    });
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();
}

/*
 * Фотографии: достаточно положить hero.jpg и about.jpg в images/.
 * При отсутствии файла заглушка остается, сломанная картинка не показывается.
 */
function setupImageSlots() {
    document.querySelectorAll("[data-image-slot]").forEach((slot) => {
        const image = slot.querySelector("img[data-src]");
        const placeholder = slot.querySelector(".image-placeholder");
        if (!image) return;

        image.addEventListener("load", () => {
            image.hidden = false;
            slot.classList.add("has-image");
            if (placeholder) placeholder.hidden = true;
        });
        image.addEventListener("error", () => {
            image.hidden = true;
            slot.classList.remove("has-image");
            if (placeholder) placeholder.hidden = false;
        });
        image.src = image.dataset.src;
    });
}

/* Нативные диалоги: браузер обеспечивает Escape и удержание фокуса. */
function setupCaseDialogs() {
    document.querySelectorAll("[data-dialog]").forEach((button) => {
        const dialog = document.getElementById(button.dataset.dialog);
        if (!dialog) return;

        button.addEventListener("click", () => dialog.showModal());
        dialog.querySelector("[data-close-dialog]")?.addEventListener("click", () => {
            dialog.close();
        });
        dialog.addEventListener("close", () => button.focus());
    });
}

/*
 * Направление → форма → редактируемый пример.
 * Автоматически заменяем только пустое поле или неизмененный прошлый пример.
 * Собственный текст посетителя никогда не перезаписываем автоматически.
 */
function setupPracticeExamples() {
    const message = document.getElementById("message");
    const practice = document.getElementById("practice");
    const status = document.getElementById("example-status");
    const preview = document.getElementById("example-preview");
    const previewText = document.getElementById("example-text");
    const applyButton = document.getElementById("apply-example");
    const undoButton = document.getElementById("undo-example");
    if (!message || !practice || typeof PRACTICE_EXAMPLES === "undefined") return;

    let lastInserted = "";
    let previousValue = "";
    let previousPractice = "";
    let selectedExample = null;
    let selectedKey = "";

    function insertExample(example, key) {
        previousValue = message.value;
        previousPractice = practice.value;
        message.value = example.text;
        practice.value = key;
        lastInserted = example.text;
        preview.hidden = true;
        preview.open = false;
        undoButton.hidden = false;
        status.textContent = `Добавлен пример: ${example.title}. Отредактируйте его под свою ситуацию.`;
        message.focus({ preventScroll: true });
        message.setSelectionRange(0, 0);
        message.dispatchEvent(new Event("input", { bubbles: true }));
    }

    document.querySelectorAll("[data-practice]").forEach((link) => {
        link.addEventListener("click", (event) => {
            // Во время передачи данные обращения остаются неизменными.
            if (document.getElementById("contact-form")?.getAttribute("aria-busy") === "true") return;
            // Ctrl/Cmd/Shift-клик сохраняет стандартное поведение ссылки.
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            const key = link.dataset.practice;
            const example = PRACTICE_EXAMPLES[key];
            if (!example) return;

            selectedExample = example;
            selectedKey = key;
            if (!message.value.trim() || message.value === lastInserted) {
                insertExample(example, key);
            } else {
                // Текст и связанное с ним направление сохраняются до явной замены.
                previewText.textContent = example.text;
                preview.hidden = false;
                preview.open = true;
                status.textContent = `Ваш текст сохранен. Ниже пример по направлению «${example.title}».`;
                message.focus({ preventScroll: true });
            }
            // href="#request" прокручивает к форме и работает без JavaScript.
        });
    });

    applyButton.addEventListener("click", () => {
        if (selectedExample) insertExample(selectedExample, selectedKey);
    });

    undoButton.addEventListener("click", () => {
        message.value = previousValue;
        practice.value = previousPractice;
        lastInserted = "";
        undoButton.hidden = true;
        status.textContent = "Подстановка отменена.";
        message.focus({ preventScroll: true });
        message.dispatchEvent(new Event("input", { bubbles: true }));
    });

    message.addEventListener("input", () => {
        // После ручной правки отмена подстановки не должна стереть новые слова.
        if (message.value !== lastInserted) undoButton.hidden = true;
    });
}


/* Форма: ошибки → предупреждение → отправка → подтверждение сервиса. */
function setupContactForm() {
    const form = document.getElementById("contact-form");
    if (!form || typeof PBFormService === "undefined") return;
    const button = document.getElementById("submit-request");
    const status = document.getElementById("form-status");
    const warning = document.getElementById("send-warning");
    const confirmButton = document.getElementById("confirm-send");
    const cancelButton = document.getElementById("cancel-send");
    const acknowledgement = document.getElementById("warning-acknowledgement");
    const fallback = document.getElementById("contact-fallback");
    const fallbackEmail = document.getElementById("fallback-email");
    const fallbackWhatsapp = document.getElementById("fallback-whatsapp");
    const fallbackCopy = document.getElementById("fallback-copy");
    const fallbackStatus = document.getElementById("fallback-status");
    const fields = Object.fromEntries(["name", "contact", "message"].map(
        (id) => [id, document.getElementById(id)]
    ));
    let pending = false;
    let lastAccepted = "";
    let fallbackNeeded = false;

    function updateFallback() {
        if (!fallback || !fallbackEmail || !fallbackWhatsapp) return;
        fallback.hidden = true;
        if (!fallbackNeeded || typeof PBContactFallback === "undefined") return;
        const checked = PBFormService.validate(values());
        if (!checked.valid) return;
        try {
            const links = PBContactFallback.buildLinks(checked.data);
            fallbackEmail.setAttribute("href", links.mailto);
            fallbackWhatsapp.setAttribute("href", links.whatsapp);
            if (fallbackStatus) fallbackStatus.textContent = "";
            fallback.hidden = false;
        } catch { /* Invalid or oversized text must never break the primary form. */ }
    }

    if (fallbackCopy) {
        fallbackCopy.hidden = typeof navigator === "undefined" || !navigator.clipboard?.writeText;
        fallbackCopy.addEventListener("click", async () => {
            if (typeof PBContactFallback === "undefined" || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
            try {
                await navigator.clipboard.writeText(PBContactFallback.buildLinks(values()).body);
                if (fallbackStatus) fallbackStatus.textContent = "Текст скопирован. Вставьте его в письмо или сообщение.";
            } catch {
                if (fallbackStatus) fallbackStatus.textContent = "Не удалось скопировать текст. Вы можете выделить его в поле сообщения.";
            }
        });
    }

    if (!warning || !acknowledgement || !confirmButton || !cancelButton || typeof warning.showModal !== "function") return;
    form.noValidate = true;
    button.disabled = false;

    function values() {
        return {
            name: fields.name.value,
            contact: fields.contact.value,
            message: fields.message.value,
            practice: document.getElementById("practice").value
        };
    }

    function fingerprint(data) {
        return JSON.stringify(PBFormService.validate(data).data);
    }

    function showStatus(text, state = "idle") {
        status.textContent = text;
        status.dataset.state = state;
        status.classList.toggle("is-error", state === "error");
    }

    function showFieldError(id, text) {
        const field = fields[id];
        const error = document.getElementById(id + "-error");
        field.setAttribute("aria-invalid", String(Boolean(text)));
        error.textContent = text || "";
        error.hidden = !text;
    }

    function validate(focusError = true) {
        const result = PBFormService.validate(values());
        Object.keys(fields).forEach((id) => showFieldError(id, result.errors[id]));
        if (!result.valid) {
            showStatus("Заполните обязательные поля и исправьте отмеченные ошибки.", "error");
            if (focusError) fields[Object.keys(result.errors)[0]].focus();
        }
        return result;
    }

    function syncConfirmation() {
        confirmButton.disabled = pending || !warning.open || !acknowledgement.checked;
    }

    acknowledgement.addEventListener("change", syncConfirmation);
    syncConfirmation();

    function setPending(active) {
        pending = active;
        form.setAttribute("aria-busy", String(active));
        form.querySelectorAll("input, textarea, button").forEach((control) => {
            control.disabled = active;
        });
        acknowledgement.disabled = active;
        syncConfirmation();
        button.textContent = active ? "Отправляем…" : "К делу";
    }

    form.addEventListener("input", (event) => {
        if (pending) return;
        const id = event.target.id;
        if (fields[id] && fields[id].getAttribute("aria-invalid") === "true") {
            showFieldError(id, PBFormService.validate(values()).errors[id]);
        }
        if (lastAccepted && fingerprint(values()) !== lastAccepted) {
            lastAccepted = "";
            button.disabled = false;
            button.textContent = "К делу";
            showStatus("");
        } else if (status.dataset.state === "error" && PBFormService.validate(values()).valid) {
            showStatus("");
        }
        if (fallbackNeeded) updateFallback();
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (pending || warning.open) return;
        if (lastAccepted && lastAccepted === fingerprint(values())) return;
        if (!validate().valid) return;
        fallbackNeeded = false;
        updateFallback();
        acknowledgement.checked = false;
        warning.returnValue = "";
        showStatus("Прочитайте предупреждение и подтвердите ознакомление отдельной галочкой.");
        warning.showModal();
        warning.scrollTop = 0;
        syncConfirmation();
    });

    cancelButton.addEventListener("click", () => warning.close("cancel"));
    warning.addEventListener("close", () => {
        acknowledgement.checked = false;
        syncConfirmation();
        if (warning.returnValue !== "send") {
            showStatus("Отправка отменена. Ваш текст сохранён.");
            button.focus();
        }
    });
    // Escape обрабатывается нативным dialog как отмена; никакого сетевого запроса.
    warning.addEventListener("cancel", () => { warning.returnValue = "cancel"; });

    confirmButton.addEventListener("click", async () => {
        if (pending || !warning.open) return;
        // Проверяем и в обработчике: disabled сам по себе не блокирует программный вызов.
        if (!acknowledgement.checked) { acknowledgement.focus(); return; }
        const checked = validate(false);
        warning.close("send");
        if (!checked.valid) {
            fields[Object.keys(checked.errors)[0]].focus();
            return;
        }
        if (!/^https?:$/.test(window.location.protocol)) {
            showStatus("Для отправки откройте сайт через локальный сервер или по адресу хостинга.", "error");
            button.focus();
            return;
        }
        if (form.querySelector('[name="_honey"]').value) {
            showStatus("Не удалось отправить обращение. Обновите страницу и попробуйте ещё раз.", "error");
            return;
        }

        const submission = values();
        const submittedFingerprint = fingerprint(submission);
        // В письмо подставляется читаемое название направления.
        if (typeof PRACTICE_EXAMPLES !== "undefined") {
            submission.practice = PRACTICE_EXAMPLES[submission.practice]?.title || submission.practice;
        }
        setPending(true);
        showStatus("Отправляем обращение. Пожалуйста, дождитесь ответа сервиса.", "pending");
        try {
            await PBFormService.send(form.dataset.endpoint, submission, {
                provider: form.dataset.provider || "formsubmit",
                accessKey: form.dataset.accessKey || ""
            });
            lastAccepted = submittedFingerprint;
            fallbackNeeded = false;
            updateFallback();
            showStatus("Обращение отправлено: почтовый сервис принял запрос. Спасибо за обращение.", "success");
        } catch (error) {
            const messages = {
                activation: "Приём обращений на почту ещё не активирован. Ваш текст сохранён. Используйте другой способ связи ниже.",
                configuration: "Автоматическая отправка пока не настроена. Ваш текст сохранён. Используйте другой способ связи ниже.",
                unavailable: "Сервис отправки временно недоступен. Отправка не подтверждена. Ваш текст сохранён — выберите другой способ связи ниже.",
                "rate-limit": "Сервис временно ограничил отправку. Ваш текст сохранён. Можно попробовать позже или связаться другим способом ниже.",
                network: "Не удалось связаться с сервисом отправки. Ваш текст сохранён. Выберите другой способ связи ниже. Подтверждение не получено; при повторной отправке возможно дублирование.",
                timeout: "Сервис не ответил вовремя. Ваш текст сохранён. Выберите другой способ связи ниже. Статус отправки неизвестен; при повторной отправке возможно дублирование."
            };
            const message = messages[error.code] || "Не удалось подтвердить отправку. Ваш текст сохранён. Выберите другой способ связи ниже.";
            showStatus(message, "error");
            fallbackNeeded = true;
            updateFallback();
        } finally {
            setPending(false);
            if (lastAccepted && lastAccepted !== fingerprint(values())) lastAccepted = "";
            if (lastAccepted) {
                button.disabled = true;
                button.textContent = "Обращение отправлено";
            }
            // Статус читается скринридером; текст формы не очищается.
            status.focus({ preventScroll: true });
        }
    });
}
