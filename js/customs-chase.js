/* A finite scene: first visible appearance, then optional hover/focus replays.
 * It never intercepts clicks, moves focus, or stops when the pointer leaves. */
(() => {
  "use strict";
  const init = () => {
    const scenes = [...document.querySelectorAll(".customs-chase")]
      .filter((scene) => !scene.hasAttribute("data-chase-state"));
    if (!scenes.length) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const states = scenes.map((scene) => ({ scene, running: false, played: false, visible: false, timer: null }));
    const finish = (state, reason = "complete") => {
      window.clearTimeout(state.timer);
      state.timer = null;
      state.running = false;
      state.scene.classList.remove("is-playing");
      state.scene.setAttribute("data-chase-state", reason);
    };
    const play = (state) => {
      if (state.running || reducedMotion.matches) return;
      state.running = true;
      state.played = true;
      state.scene.setAttribute("data-chase-state", "playing");
      state.scene.classList.add("is-playing");
      // A fallback also restores the final state when CSS/animation events fail.
      state.timer = window.setTimeout(() => finish(state), 7500);
    };
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const state = states.find((item) => item.scene === entry.target);
          if (!state) return;
          state.visible = entry.isIntersecting && entry.intersectionRatio >= .5;
          if (state.visible && !state.played) play(state);
        });
      }, { threshold: .5 })
      : null;
    states.forEach((state) => {
      const { scene } = state;
      const host = scene.closest(".practice-row, .article-aside") || scene;
      scene.setAttribute("data-chase-state", reducedMotion.matches ? "reduced-motion" : "idle");
      scene.addEventListener("animationend", (event) => {
        if (event.animationName === "customs-pacman-chase" && state.running) finish(state);
      });
      host.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") play(state);
      });
      host.addEventListener("focusin", () => play(state));
      if (observer) observer.observe(scene);
      // Older browsers without IntersectionObserver retain a still icon until focus/hover.
    });
    reducedMotion.addEventListener("change", () => {
      states.forEach((state) => {
        if (reducedMotion.matches) finish(state, "reduced-motion");
        else if (state.visible && !state.played) play(state);
        else state.scene.setAttribute("data-chase-state", state.played ? "complete" : "idle");
      });
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
