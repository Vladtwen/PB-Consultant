/* Finite, component-level SVG animations. No canvas or path-morph plugin.
 * The initial SVG is a complete static icon if JavaScript is unavailable.
 * Touch/coarse input and reduced-motion preferences keep this static state. */
(() => {
    "use strict";

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const mix = (start, end, progress) => start + (end - start) * progress;
    const out = (value) => 1 - Math.pow(1 - clamp(value), 3);
    const smooth = (value) => {
        const p = clamp(value);
        return p * p * (3 - 2 * p);
    };
    const segment = (progress, start, end) => clamp((progress - start) / (end - start));
    const number = (value) => Number(value.toFixed(3));
    const set = (node, attribute, value) => node.setAttribute(attribute, String(value));
    const centered = (x, y, rotation, scale) =>
        `translate(${x} ${y}) rotate(${number(rotation)}) scale(${number(scale)}) translate(${-x} ${-y})`;

    const motions = {
        corporate: {
            duration: 1600,
            parts: ["parent", "branches", "child-left", "child-middle", "child-right"],
            render(parts, progress) {
                // Gather into the parent, then grow outward in a staggered sequence.
                const gathering = progress < 0.2;
                const fold = smooth(segment(progress, 0, 0.2));
                const branchGrowth = gathering ? 1 - fold : out(segment(progress, 0.22, 0.72));
                set(parts.branches, "transform", `translate(40 27) scale(1 ${number(branchGrowth)}) translate(-40 -27)`);
                set(parts.branches, "opacity", number(branchGrowth));
                set(parts.parent, "transform", centered(40, 18, 0, 1 + 0.1 * Math.sin(progress * Math.PI)));
                [["child-left", 17], ["child-middle", 40], ["child-right", 63]].forEach(([name, x], index) => {
                    const growth = gathering ? 1 - fold : out(segment(progress, 0.23 + index * 0.1, 0.76 + index * 0.1));
                    const currentX = mix(40, x, growth);
                    const currentY = mix(18, 60, growth);
                    set(parts[name], "transform", `translate(${number(currentX)} ${number(currentY)}) scale(${number(mix(0.08, 1, growth))}) translate(${-x} -60)`);
                    set(parts[name], "opacity", number(growth));
                });
            }
        },
        commercial: {
            duration: 1250,
            parts: ["spindle"],
            render(parts, progress) {
                // Only the circle and crossbar screw inward; the brackets stay still.
                const turn = out(progress);
                set(parts.spindle, "transform", centered(40, 40, 720 * turn, mix(1, 0.44, smooth(progress))));
            }
        },
        contracts: {
            duration: 1150,
            parts: ["party-left", "party-right", "seal"],
            render(parts, progress) {
                const align = smooth(segment(progress, 0, 0.57));
                set(parts["party-left"], "transform", `translate(${number(5 * align)} ${number(-2 * align)})`);
                set(parts["party-right"], "transform", `translate(${number(-5 * align)} ${number(2 * align)})`);
                let scale;
                let opacity;
                if (progress < 0.23) {
                    const fade = smooth(segment(progress, 0, 0.23));
                    scale = mix(0.78, 0.35, fade);
                    opacity = mix(0.7, 0, fade);
                } else {
                    const stamp = segment(progress, 0.56, 1);
                    // One gentle overshoot makes the aligned clauses feel sealed.
                    scale = stamp < 0.68
                        ? mix(0.35, 1.1, out(stamp / 0.68))
                        : mix(1.1, 1, smooth((stamp - 0.68) / 0.32));
                    opacity = out(segment(progress, 0.56, 0.72));
                }
                set(parts.seal, "transform", centered(40, 61, 0, scale));
                set(parts.seal, "opacity", number(opacity));
            }
        },
        projects: {
            duration: 1500,
            parts: ["lead", "arch-outer", "arch-middle", "arch-inner"],
            render(parts, progress) {
                // A short vertical leader passes through the three straight lines,
                // then rises and pulls them into nested arches, from inside out.
                const leadY = progress < 0.25
                    ? mix(14, 57, smooth(progress / 0.25))
                    : mix(57, 10, out(segment(progress, 0.25, 0.9)));
                set(parts.lead, "d", `M40 ${number(leadY)}v12`);
                [
                    ["arch-outer", 28, 38, 53, 0.42],
                    ["arch-middle", 20, 26, 59, 0.35],
                    ["arch-inner", 12, 14, 65, 0.28]
                ].forEach(([part, radius, height, initialY, start]) => {
                    const bend = out(segment(progress, start, 0.97));
                    const base = mix(initialY, 64, bend);
                    const top = base - height * bend;
                    const side = base - height * bend * 0.552285;
                    // Two compatible cubic Beziers, interpolated numerically.
                    // With bend=0 every control point lies on a horizontal line.
                    const path = [
                        `M${40 - radius} ${number(base)}`,
                        `C${40 - radius} ${number(side)} ${number(40 - radius * 0.552285)} ${number(top)} 40 ${number(top)}`,
                        `C${number(40 + radius * 0.552285)} ${number(top)} ${40 + radius} ${number(side)} ${40 + radius} ${number(base)}`
                    ].join(" ");
                    set(parts[part], "d", path);
                });
            }
        },
        land: {
            duration: 750,
            parts: ["plot-first", "plot-second"],
            render(parts, progress) {
                // 35-unit squares end with a visible 2-unit gap on both axes.
                const distance = number(11 * smooth(progress));
                set(parts["plot-first"], "transform", `translate(${-distance} ${-distance})`);
                set(parts["plot-second"], "transform", `translate(${distance} ${distance})`);
            }
        },
        water: {
            duration: 1850,
            parts: ["bubble-top", "bubble-left", "bubble-right"],
            render(parts, progress) {
                [
                    ["bubble-top", 40, 28],
                    ["bubble-left", 28, 48],
                    ["bubble-right", 52, 48]
                ].forEach(([part, x, y], index) => {
                    const circle = parts[part];
                    if (progress < 0.18 || progress >= 0.99) {
                        // All three rings disappear before the small bubbles emerge.
                        set(circle, "cx", x);
                        set(circle, "cy", y);
                        set(circle, "r", 20);
                        set(circle, "opacity", progress >= 0.99 ? 1 : number(1 - out(progress / 0.15)));
                        return;
                    }
                    const start = 0.2 + index * 0.035;
                    const swirl = segment(progress, start, 0.99);
                    const growth = smooth(segment(progress, 0.4 + index * 0.025, 0.99));
                    const angle = Math.PI * 2 * out(swirl);
                    const spread = mix(0.24, 1, growth);
                    const dx = (x - 40) * spread;
                    const dy = (y - 42) * spread;
                    const wobble = 2.5 * Math.sin(swirl * Math.PI * 4 + index) * Math.sin(swirl * Math.PI);
                    set(circle, "cx", number(40 + dx * Math.cos(angle) - dy * Math.sin(angle)));
                    set(circle, "cy", number(42 + dx * Math.sin(angle) + dy * Math.cos(angle) + wobble));
                    set(circle, "r", number(mix(1.1, 20, growth)));
                    set(circle, "opacity", number(out(segment(progress, start, start + 0.085))));
                });
            }
        }
    };

    const controllers = [];
    document.querySelectorAll("#services .practice-row[data-practice]").forEach((row) => {
        const motion = motions[row.dataset.practice];
        const svg = row.querySelector(".practice-symbol--motion");
        if (!motion || !svg) return;
        const parts = Object.fromEntries(motion.parts.map((name) => [name, svg.querySelector(`[data-motion-part="${name}"]`)]));
        // An incomplete fragment must never break other page interactions.
        if (Object.values(parts).some((node) => !node)) return;

        let progress = 0;
        let target = 0;
        let frame = null;
        let pointerInside = false;
        const enabled = () => finePointer.matches && !reducedMotion.matches && !document.hidden;
        const stop = () => {
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
        };
        const reset = () => {
            stop();
            progress = 0;
            target = 0;
            motion.render(parts, 0);
        };
        const moveTo = (next) => {
            if (target === next) return;
            stop();
            target = next;
            const from = progress;
            const started = performance.now();
            const duration = Math.max(120, (next ? motion.duration : 360) * Math.abs(next - from));
            const tick = (now) => {
                const elapsed = clamp((now - started) / duration);
                // Returning uses a soft landing; entering keeps each icon's timing.
                progress = mix(from, next, next ? elapsed : smooth(elapsed));
                motion.render(parts, progress);
                if (elapsed < 1) frame = window.requestAnimationFrame(tick);
                else frame = null;
            };
            frame = window.requestAnimationFrame(tick);
        };
        const refresh = () => {
            if (!enabled()) {
                reset();
                return;
            }
            moveTo(pointerInside || row.matches(":focus-visible") ? 1 : 0);
        };
        row.addEventListener("pointerenter", (event) => {
            if (event.pointerType === "touch") return;
            pointerInside = true;
            refresh();
        });
        row.addEventListener("pointerleave", () => {
            pointerInside = false;
            refresh();
        });
        row.addEventListener("pointercancel", () => {
            pointerInside = false;
            refresh();
        });
        row.addEventListener("focusin", refresh);
        row.addEventListener("focusout", () => queueMicrotask(refresh));
        motion.render(parts, 0);
        controllers.push({ refresh, reset });
    });

    const refreshAll = () => controllers.forEach((controller) => controller.refresh());
    finePointer.addEventListener("change", refreshAll);
    reducedMotion.addEventListener("change", refreshAll);
    document.addEventListener("visibilitychange", refreshAll);
    window.addEventListener("pagehide", () => controllers.forEach((controller) => controller.reset()));
})();
