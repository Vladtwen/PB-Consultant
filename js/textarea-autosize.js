"use strict";

/* Keep the inquiry compact; measure real wrapping instead of counting characters. */
(function (root) {
    function attachTextareaAutosize(field, view) {
        if (!field) return null;
        const parsedRows = Number.parseInt(field.dataset.autosizeMaxRows, 10);
        const maxRows = Number.isFinite(parsedRows) && parsedRows > 0 ? parsedRows : 6;
        let frame = null;
        let lastWidth = 0;
        let stopped = false;
        const pixels = (value) => Number.parseFloat(value) || 0;

        function update() {
            if (stopped) return;
            const width = field.getBoundingClientRect().width;
            // A hidden form is measured when its container becomes visible again.
            if (!width) return;
            lastWidth = width;
            const style = view.getComputedStyle(field);
            const line = pixels(style.lineHeight) || pixels(style.fontSize) * 1.2 || 20;
            const padding = pixels(style.paddingTop) + pixels(style.paddingBottom);
            const border = pixels(style.borderTopWidth) + pixels(style.borderBottomWidth);
            const oneRow = line + padding;
            const limit = Math.ceil(line * maxRows + padding);
            const previousScroll = field.scrollTop;
            const caretAtEnd = field.ownerDocument?.activeElement === field
                && field.selectionStart === field.value.length
                && field.selectionEnd === field.value.length;

            // Reset both constraints so deleting text can shrink an expanded field.
            field.style.overflowY = "hidden";
            field.style.height = "0px";
            // A long placeholder must not turn the empty one-row field into a paragraph.
            const naturalHeight = field.value ? Math.max(oneRow, field.scrollHeight) : oneRow;
            const visibleHeight = Math.min(naturalHeight, limit);
            const height = style.boxSizing === "border-box"
                ? visibleHeight + border
                : visibleHeight - padding;
            field.style.height = `${height}px`;
            field.style.overflowY = naturalHeight > limit ? "auto" : "hidden";
            field.scrollTop = naturalHeight > limit
                ? (caretAtEnd ? naturalHeight : previousScroll)
                : 0;
        }

        function schedule() {
            if (stopped || frame !== null) return;
            frame = view.requestAnimationFrame(() => {
                frame = null;
                update();
            });
        }

        const events = ["input", "change", "focus", "autosize"];
        events.forEach((name) => field.addEventListener(name, schedule));
        // Reset fires before the browser restores the field's default value.
        field.form?.addEventListener("reset", schedule);
        view.addEventListener("resize", schedule, { passive: true });
        view.addEventListener("pageshow", schedule);

        const observer = typeof view.ResizeObserver === "function"
            ? new view.ResizeObserver(() => {
                // Height changes and the internal scrollbar must not create a resize loop.
                if (field.getBoundingClientRect().width !== lastWidth) schedule();
            })
            : null;
        observer?.observe(field);
        field.ownerDocument?.fonts?.ready?.then(schedule, () => {});
        update();

        return {
            update,
            destroy() {
                stopped = true;
                if (frame !== null) view.cancelAnimationFrame(frame);
                events.forEach((name) => field.removeEventListener(name, schedule));
                field.form?.removeEventListener("reset", schedule);
                view.removeEventListener("resize", schedule);
                view.removeEventListener("pageshow", schedule);
                observer?.disconnect();
            }
        };
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { attachTextareaAutosize };
    } else {
        const init = () => attachTextareaAutosize(root.document.getElementById("message"), root);
        if (root.document.readyState === "loading") {
            root.document.addEventListener("DOMContentLoaded", init, { once: true });
        } else {
            init();
        }
    }
})(globalThis);
