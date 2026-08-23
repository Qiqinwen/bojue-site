(() => {
  "use strict";

  if (!window.customElements || customElements.get("site-xmark")) return;

  class SiteXmark extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      if (!this.hasAttribute("aria-hidden")) this.setAttribute("aria-hidden", "true");
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          :host {
            width: var(--site-xmark-size, 14px);
            height: var(--site-xmark-size, 14px);
            display: inline-grid;
            place-items: center;
            flex: 0 0 auto;
            color: inherit;
          }
          span {
            width: 100%;
            height: 100%;
            display: block;
            background: currentColor;
            -webkit-mask: url("/xmark.svg") no-repeat center / contain;
                    mask: url("/xmark.svg") no-repeat center / contain;
          }
        </style>
        <span></span>
      `;
    }
  }

  customElements.define("site-xmark", SiteXmark);
})();
