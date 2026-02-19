/**
 * Solarseed TOU Rate Card — Lovelace custom card
 *
 * Shows current tier, rate, cost/hr, and cost today at a glance.
 * Add to dashboard via: type: custom:solarseed-tou-card
 */

const CARD_VERSION = "0.6.0";

class SolarseedTOUCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
  }

  // ── Lovelace lifecycle ──────────────────────────────────

  setConfig(config) {
    this._config = {
      title: config.title || "TOU Rate",
      show_header: config.show_header !== false,
      show_cost_hourly: config.show_cost_hourly !== false,
      show_cost_today: config.show_cost_today !== false,
      show_cost_week: config.show_cost_week !== undefined ? config.show_cost_week : false,
      show_cost_month: config.show_cost_month !== undefined ? config.show_cost_month : false,
      show_next_change: config.show_next_change !== false,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  // Card editor stub for visual editor in HA
  static getConfigElement() {
    return document.createElement("solarseed-tou-card-editor");
  }

  static getStubConfig() {
    return {
      title: "TOU Rate",
      show_cost_hourly: true,
      show_cost_today: true,
      show_cost_week: false,
      show_cost_month: false,
      show_next_change: true,
    };
  }

  // ── Helpers ─────────────────────────────────────────────

  _findEntity(suffix) {
    // Find the solarseed_tou entity with the given suffix
    const states = this._hass?.states || {};
    for (const eid of Object.keys(states)) {
      if (eid.startsWith("sensor.solarseed_tou_") && eid.endsWith(suffix)) {
        return states[eid];
      }
    }
    return null;
  }

  _fmt(value, digits = 2) {
    if (value == null || value === "unknown" || value === "unavailable") return "—";
    const n = parseFloat(value);
    return isNaN(n) ? value : n.toFixed(digits);
  }

  _fmtRate(value) {
    return this._fmt(value, 4);
  }

  _fmtCost(value) {
    if (value == null || value === "unknown" || value === "unavailable") return "—";
    const n = parseFloat(value);
    if (isNaN(n)) return value;
    return "$" + n.toFixed(2);
  }

  _fmtCostHourly(value) {
    if (value == null || value === "unknown" || value === "unavailable") return "—";
    const n = parseFloat(value);
    if (isNaN(n)) return value;
    return "$" + n.toFixed(3);
  }

  _relativeTime(isoStr) {
    if (!isoStr) return null;
    try {
      const target = new Date(isoStr);
      const now = new Date();
      const diffMin = Math.round((target - now) / 60000);
      if (diffMin < 1) return "now";
      if (diffMin < 60) return `in ${diffMin}m`;
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
    } catch {
      return null;
    }
  }

  // ── Render ──────────────────────────────────────────────

  _render() {
    if (!this._hass) return;

    const rate = this._findEntity("current_rate");
    const tier = this._findEntity("current_tier");
    const hourly = this._findEntity("cost_per_hour");
    const today = this._findEntity("cost_today");
    const week = this._findEntity("cost_this_week");
    const month = this._findEntity("cost_this_month");

    const tierName = tier?.state || "Unknown";
    const tierColor = tier?.attributes?.color || "#6a829e";
    const rateVal = rate?.state;
    const isHoliday = rate?.attributes?.is_holiday || false;
    const nextChange = rate?.attributes?.next_rate_change;
    const nextTier = rate?.attributes?.next_tier;
    const relTime = this._relativeTime(nextChange);

    const c = this._config;

    // Build cost rows
    let costRows = "";
    if (c.show_cost_hourly) {
      costRows += `
        <div class="cost-row">
          <span class="cost-label">Cost/hr</span>
          <span class="cost-value">${this._fmtCostHourly(hourly?.state)}<span class="cost-unit">/hr</span></span>
        </div>`;
    }
    if (c.show_cost_today) {
      costRows += `
        <div class="cost-row">
          <span class="cost-label">Today</span>
          <span class="cost-value">${this._fmtCost(today?.state)}</span>
        </div>`;
    }
    if (c.show_cost_week) {
      costRows += `
        <div class="cost-row">
          <span class="cost-label">This Week</span>
          <span class="cost-value">${this._fmtCost(week?.state)}</span>
        </div>`;
    }
    if (c.show_cost_month) {
      costRows += `
        <div class="cost-row">
          <span class="cost-label">This Month</span>
          <span class="cost-value">${this._fmtCost(month?.state)}</span>
        </div>`;
    }

    // Next tier change
    let nextHtml = "";
    if (c.show_next_change && relTime && nextTier) {
      nextHtml = `
        <div class="next-change">
          <span class="next-icon">⏱</span>
          <span>${nextTier} ${relTime}</span>
        </div>`;
    }

    // Holiday badge
    const holidayBadge = isHoliday
      ? `<span class="badge holiday">🎉 Holiday</span>`
      : "";

    this.shadowRoot.innerHTML = `
      <style>${SolarseedTOUCard._CSS}</style>
      <ha-card>
        ${c.show_header ? `
        <div class="header">
          <div class="header-left">
            <div class="tier-dot" style="background:${tierColor}"></div>
            <div>
              <div class="title">${c.title}</div>
            </div>
          </div>
          <div class="header-right">
            ${holidayBadge}
          </div>
        </div>` : ""}

        <div class="body">
          <div class="tier-section">
            <div class="tier-name" style="color:${tierColor}">${tierName}</div>
            <div class="rate">$${this._fmtRate(rateVal)}<span class="rate-unit">/kWh</span></div>
          </div>

          ${costRows ? `<div class="costs">${costRows}</div>` : ""}
          ${nextHtml}
        </div>
      </ha-card>
    `;
  }
}

// ── Styles ───────────────────────────────────────────────

SolarseedTOUCard._CSS = `
  :host {
    --card-bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));
    --primary-text: var(--primary-text-color, #e1e1e1);
    --secondary-text: var(--secondary-text-color, #9e9e9e);
  }

  ha-card {
    overflow: hidden;
    font-family: var(--ha-card-font-family, inherit);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 16px 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tier-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .title {
    font-size: 14px;
    font-weight: 500;
    color: var(--secondary-text);
    letter-spacing: 0.02em;
  }

  .badge {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 600;
  }
  .badge.holiday {
    background: #f59e0b22;
    color: #f59e0b;
  }

  .body {
    padding: 12px 16px 16px;
  }

  .tier-section {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
  }

  .tier-name {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .rate {
    font-size: 20px;
    font-weight: 600;
    color: var(--primary-text);
  }

  .rate-unit {
    font-size: 12px;
    font-weight: 400;
    color: var(--secondary-text);
    margin-left: 1px;
  }

  .costs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
    border-top: 1px solid var(--divider-color, #333);
  }

  .cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cost-label {
    font-size: 13px;
    color: var(--secondary-text);
    font-weight: 500;
  }

  .cost-value {
    font-size: 15px;
    font-weight: 600;
    color: var(--primary-text);
    font-variant-numeric: tabular-nums;
  }

  .cost-unit {
    font-size: 11px;
    font-weight: 400;
    color: var(--secondary-text);
    margin-left: 1px;
  }

  .next-change {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--primary-background-color, #111);
    font-size: 13px;
    color: var(--secondary-text);
  }

  .next-icon {
    font-size: 14px;
  }
`;

// ── Card Editor (basic) ──────────────────────────────────

class SolarseedTOUCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        .editor { padding: 8px; display: flex; flex-direction: column; gap: 12px; }
        label { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
        input[type="text"] {
          width: 100%; padding: 8px; border: 1px solid var(--divider-color, #444);
          border-radius: 6px; background: var(--primary-background-color, #111);
          color: var(--primary-text-color, #eee); font-size: 14px;
        }
        .section { font-size: 12px; font-weight: 600; color: var(--secondary-text-color, #999); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
      </style>
      <div class="editor">
        <div>
          <div class="section">Title</div>
          <input type="text" id="title" value="${c.title || "TOU Rate"}" />
        </div>
        <div class="section">Show sections</div>
        <label><input type="checkbox" id="show_header" ${c.show_header !== false ? "checked" : ""} /> Header</label>
        <label><input type="checkbox" id="show_cost_hourly" ${c.show_cost_hourly !== false ? "checked" : ""} /> Cost per hour</label>
        <label><input type="checkbox" id="show_cost_today" ${c.show_cost_today !== false ? "checked" : ""} /> Cost today</label>
        <label><input type="checkbox" id="show_cost_week" ${c.show_cost_week ? "checked" : ""} /> Cost this week</label>
        <label><input type="checkbox" id="show_cost_month" ${c.show_cost_month ? "checked" : ""} /> Cost this month</label>
        <label><input type="checkbox" id="show_next_change" ${c.show_next_change !== false ? "checked" : ""} /> Next tier change</label>
      </div>
    `;

    // Wire up events
    this.shadowRoot.getElementById("title").addEventListener("input", (e) => {
      this._update({ title: e.target.value });
    });
    for (const id of ["show_header", "show_cost_hourly", "show_cost_today", "show_cost_week", "show_cost_month", "show_next_change"]) {
      this.shadowRoot.getElementById(id).addEventListener("change", (e) => {
        this._update({ [id]: e.target.checked });
      });
    }
  }

  _update(patch) {
    this._config = { ...this._config, ...patch };
    const event = new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

// ── Register ─────────────────────────────────────────────

customElements.define("solarseed-tou-card", SolarseedTOUCard);
customElements.define("solarseed-tou-card-editor", SolarseedTOUCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "solarseed-tou-card",
  name: "Solarseed TOU Rate",
  description: "Shows current TOU rate tier, cost per hour, and daily cost",
  preview: true,
  documentationURL: "https://github.com/danrichardson/solarseed-tou-metering",
});

console.info(`%c SOLARSEED TOU CARD %c v${CARD_VERSION} `, "background:#f59e0b;color:#000;font-weight:700", "background:#333;color:#fff");
