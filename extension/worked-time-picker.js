class WorkedTimePicker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.hours = 0;
    this.minutes = 0;
    this.scrollFrames = new Map();
    this.onScroll = this.onScroll.bind(this);
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;min-width:0;color:inherit;font:inherit}
        .picker{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center}
        .wheel-group{min-width:0}
        .heading{display:flex;justify-content:center;gap:5px;margin:0 0 6px;color:var(--picker-muted,#7a8292);font-size:12px;font-weight:650}
        .wheel{position:relative;height:176px;min-width:0;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;scroll-snap-type:y mandatory;scrollbar-width:thin;scrollbar-color:var(--picker-scroll,#c6cad4) transparent;border-radius:12px;background:var(--picker-surface,#f7f8fb);border:1px solid var(--picker-border,#d9dce5);padding-block:64px;box-sizing:border-box;-webkit-overflow-scrolling:touch}
        .wheel::-webkit-scrollbar{width:4px}.wheel::-webkit-scrollbar-thumb{background:var(--picker-scroll,#c6cad4);border-radius:8px}
        .option{display:block;width:100%;height:46px;padding:0;border:0;background:transparent;color:var(--picker-muted,#8a90a0);font:inherit;font-size:20px;font-weight:550;font-variant-numeric:tabular-nums;scroll-snap-align:center;cursor:pointer;touch-action:manipulation}
        .option[aria-selected="true"]{color:var(--picker-selected,#24314f);font-size:25px;font-weight:750}
        .wheel:focus-visible{outline:2px solid var(--picker-focus,#657fe7);outline-offset:2px}
        .selection{position:absolute;pointer-events:none;left:7px;right:7px;top:50%;height:46px;transform:translateY(-50%);border-radius:9px;border:1px solid var(--picker-focus,#8795c9);background:var(--picker-highlight,rgba(111,130,207,.09))}
        .preview{display:block;margin-top:12px;text-align:center;font-size:23px;font-weight:750;letter-spacing:.04em;font-variant-numeric:tabular-nums;color:var(--picker-selected,#24314f)}
        @media(max-width:280px){.picker{gap:6px}.wheel{height:160px;padding-block:56px}.option{height:46px}}
        @media(prefers-reduced-motion:reduce){.wheel{scroll-behavior:auto}}
      </style>
      <div class="picker">
        <section class="wheel-group"><p class="heading">Hours <span>(HH)</span></p><div class="wheel" id="hours" role="listbox" aria-label="Worked hours" tabindex="0"><div class="selection"></div><div class="options"></div></div></section>
        <section class="wheel-group"><p class="heading">Minutes <span>(MM)</span></p><div class="wheel" id="minutes" role="listbox" aria-label="Worked minutes" tabindex="0"><div class="selection"></div><div class="options"></div></div></section>
      </div>
      <output class="preview" aria-label="Selected worked time" aria-live="polite">00:00</output>
    `;
  }

  connectedCallback() {
    if (this.hasAttribute("data-ready")) return;
    this.setAttribute("data-ready", "");
    this.renderOptions("hours", 12);
    this.renderOptions("minutes", 59);
    this.shadowRoot.querySelectorAll(".wheel").forEach((wheel) => {
      wheel.addEventListener("scroll", this.onScroll, { passive: true });
      wheel.addEventListener("keydown", (event) => this.onKeyDown(event, wheel));
    });
    this.setValue(this.getAttribute("value") || "00:00", false);
  }

  disconnectedCallback() {
    this.scrollFrames.forEach((frame) => cancelAnimationFrame(frame));
    this.scrollFrames.clear();
  }

  renderOptions(type, max) {
    const options = this.shadowRoot.querySelector(`#${type} .options`);
    for (let value = 0; value <= max; value += 1) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "option";
      option.textContent = String(value).padStart(2, "0");
      option.dataset.value = String(value);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.addEventListener("click", () => this.select(type, value));
      options.append(option);
    }
  }

  setValue(value, emit = false) {
    const match = /^(\\d{1,2}):(\\d{2})$/.exec(String(value));
    const hours = match ? Number(match[1]) : 0;
    const minutes = match ? Number(match[2]) : 0;
    this.hours = hours <= 12 ? hours : 0;
    this.minutes = minutes <= 59 ? minutes : 0;
    this.syncWheels();
    this.updatePreview();
    if (emit) this.dispatchChange();
  }

  get value() {
    return `${String(this.hours).padStart(2, "0")}:${String(this.minutes).padStart(2, "0")}`;
  }

  select(type, value) {
    const max = type === "hours" ? 12 : 59;
    if (!Number.isInteger(value) || value < 0 || value > max) return;
    if (type === "hours") this.hours = value;
    else this.minutes = value;
    this.syncWheels();
    this.updatePreview();
    this.dispatchChange();
  }

  dispatchChange() {
    this.dispatchEvent(new CustomEvent("change", {
      detail: { value: this.value },
      bubbles: true,
      composed: true
    }));
  }

  syncWheels() {
    for (const [type, value] of [["hours", this.hours], ["minutes", this.minutes]]) {
      const wheel = this.shadowRoot.getElementById(type);
      const option = wheel.querySelector(`[data-value="${value}"]`);
      wheel.querySelectorAll(".option").forEach((item) => {
        item.setAttribute("aria-selected", String(item === option));
      });
      if (option) {
        const wheelRect = wheel.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();
        wheel.scrollTop += optionRect.top + optionRect.height / 2 - (wheelRect.top + wheel.clientHeight / 2);
      }
    }
  }

  onScroll(event) {
    const wheel = event.currentTarget;
    const key = wheel.id;
    const previous = this.scrollFrames.get(key);
    if (previous) cancelAnimationFrame(previous);
    const frame = requestAnimationFrame(() => {
      this.scrollFrames.delete(key);
      const options = [...wheel.querySelectorAll(".option")];
      if (!options.length) return;
      const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
      const nearest = options.reduce((best, item) => {
        const distance = Math.abs(item.getBoundingClientRect().top + item.offsetHeight / 2 - center);
        return distance < best.distance ? { item, distance } : best;
      }, { item: options[0], distance: Infinity }).item;
      const value = Number(nearest.dataset.value);
      if (key === "hours") this.hours = value;
      else this.minutes = value;
      options.forEach((item) => item.setAttribute("aria-selected", String(item === nearest)));
      this.updatePreview();
      this.dispatchChange();
    });
    this.scrollFrames.set(key, frame);
  }

  onKeyDown(event, wheel) {
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const current = wheel.id === "hours" ? this.hours : this.minutes;
    const max = wheel.id === "hours" ? 12 : 59;
    this.select(wheel.id, Math.max(0, Math.min(max, current + delta)));
  }

  updatePreview() {
    this.shadowRoot.querySelector(".preview").textContent = this.value;
  }
}
customElements.define("worked-time-picker", WorkedTimePicker);
