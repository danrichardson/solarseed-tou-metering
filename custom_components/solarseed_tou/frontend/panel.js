// ============================================================
// Solarseed TOU Energy Metering — Panel UI
// Phase 2: Full configuration panel with drag-to-paint grid
// ============================================================

import { PANEL_CSS } from './styles.js';

// --- Constants -----------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEASON_COLORS = ["#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const TIER_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316"];
const ORD = ["1st", "2nd", "3rd", "4th", "Last"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STD_HOLIDAYS = [
  { id: "new_years", name: "New Year's Day", when: "January 1" },
  { id: "mlk", name: "MLK Jr. Day", when: "3rd Mon in Jan" },
  { id: "presidents", name: "Presidents' Day", when: "3rd Mon in Feb" },
  { id: "memorial", name: "Memorial Day", when: "Last Mon in May" },
  { id: "juneteenth", name: "Juneteenth", when: "June 19" },
  { id: "independence", name: "Independence Day", when: "July 4" },
  { id: "labor", name: "Labor Day", when: "1st Mon in Sep" },
  { id: "columbus", name: "Columbus Day", when: "2nd Mon in Oct" },
  { id: "veterans", name: "Veterans Day", when: "November 11" },
  { id: "thanksgiving", name: "Thanksgiving", when: "4th Thu in Nov" },
  { id: "christmas", name: "Christmas Day", when: "December 25" },
];

let _uid = 100;

// --- Data Transformation -------------------------------------

function configToState(config) {
  const tiers = Object.entries(config.tiers || {}).map(([id, t]) => ({
    id, name: t.name || id, rate: parseFloat(t.rate) || 0, color: t.color || "#888888",
  }));

  const seasonEntries = Object.entries(config.seasons || {});
  const seasons = seasonEntries.map(([id, s], i) => ({
    id, name: s.name || id, color: s.color || SEASON_COLORS[i % SEASON_COLORS.length],
  }));

  const monthMap = Array(12).fill(seasons[0]?.id || "default");
  seasonEntries.forEach(([id, s]) => {
    (s.months || []).forEach(m => { if (m >= 1 && m <= 12) monthMap[m - 1] = id; });
  });

  const grids = {};
  seasonEntries.forEach(([id, s]) => {
    grids[id] = DAY_KEYS.map(day =>
      s.grid?.[day] || Array(24).fill(tiers[0]?.id || "off-peak")
    );
  });

  const hol = config.holidays || {};
  return {
    energy_sensor: config.energy_sensor || "",
    tiers,
    seasons,
    monthMap,
    grids,
    holidays: {
      rate_tier: hol.rate_tier || (tiers[0]?.id || "off-peak"),
      observe_nearest_weekday: hol.observe_nearest_weekday !== false,
      standard: hol.standard || [],
      custom: (hol.custom || []).map((c, i) => ({ ...c, id: c.id || `c-${_uid++}` })),
    },
    activeTier: tiers[0]?.id || "off-peak",
    activeSeason: seasons[0]?.id || "default",
  };
}

function stateToConfig(state) {
  const tiers = {};
  state.tiers.forEach(t => {
    tiers[t.id] = { name: t.name, rate: t.rate, color: t.color };
  });

  const seasonMonths = {};
  state.seasons.forEach(s => { seasonMonths[s.id] = []; });
  state.monthMap.forEach((sid, mi) => {
    if (seasonMonths[sid]) seasonMonths[sid].push(mi + 1);
  });

  const seasons = {};
  state.seasons.forEach(s => {
    const grid = {};
    const rows = state.grids[s.id] || Object.values(state.grids)[0];
    DAY_KEYS.forEach((day, di) => { grid[day] = rows?.[di] || Array(24).fill(state.tiers[0]?.id || "off-peak"); });
    seasons[s.id] = { name: s.name, color: s.color, months: seasonMonths[s.id] || [], grid };
  });

  const custom = state.holidays.custom.map(c => {
    const h = { name: c.name, rule: c.rule || c.type, month: c.month };
    if (h.rule === "fixed") h.day = c.day;
    else { h.weekday = c.weekday; h.n = c.n; }
    return h;
  });

  return {
    energy_sensor: state.energy_sensor,
    tiers,
    seasons,
    holidays: {
      rate_tier: state.holidays.rate_tier,
      observe_nearest_weekday: state.holidays.observe_nearest_weekday,
      standard: state.holidays.standard,
      custom,
    },
  };
}

// --- YAML Generation -----------------------------------------

function generateYaml(state) {
  let y = `# Solarseed TOU Energy Metering\n# https://github.com/throughline-tech/solarseed-tou\n\ntou_metering:\n`;
  y += `  energy_sensor: "${state.energy_sensor}"\n\n  tiers:\n`;
  state.tiers.forEach(t => {
    y += `    ${t.id}:\n      name: "${t.name}"\n      rate: ${t.rate}  # effective $/kWh\n      color: "${t.color}"\n`;
  });

  const usedSeasons = [...new Set(state.monthMap)];
  y += `\n  seasons:\n`;
  usedSeasons.forEach(sid => {
    const s = state.seasons.find(d => d.id === sid);
    const ms = state.monthMap.map((id, mi) => id === sid ? mi + 1 : null).filter(Boolean);
    const g = state.grids[sid] || Object.values(state.grids)[0];
    const key = (s?.name || sid).toLowerCase().replace(/[^a-z0-9]+/g, "_");
    y += `    ${key}:\n      name: "${s?.name || sid}"\n      months: [${ms.join(",")}]\n      grid:\n`;
    DAYS.forEach((d, di) => {
      y += `        ${d.toLowerCase()}: [${(g[di] || []).map(c => `"${c}"`).join(",")}]\n`;
    });
  });

  y += `\n  holidays:\n    rate_tier: "${state.holidays.rate_tier}"\n    observe_nearest_weekday: ${state.holidays.observe_nearest_weekday}\n    standard:\n`;
  state.holidays.standard.forEach(id => { y += `      - "${id}"\n`; });
  if (state.holidays.custom.length) {
    y += `    custom:\n`;
    state.holidays.custom.forEach(h => {
      const rule = h.rule || h.type;
      y += `      - name: "${h.name}"\n        rule: "${rule}"\n        month: ${h.month}\n`;
      if (rule === "fixed") y += `        day: ${h.day}\n`;
      else y += `        weekday: ${h.weekday}\n        n: ${h.n}\n`;
    });
  }
  return y;
}

// --- Helpers -------------------------------------------------

function getTier(tiers, id) {
  return tiers.find(t => t.id === id) || tiers[0] || { id: "?", name: "?", rate: 0, color: "#888" };
}

function seasonLabel(season, monthMap) {
  const count = monthMap.filter(s => s === season.id).length;
  if (count === 12) return "All Year";
  if (count === 0) return "(none)";
  return season.name;
}

function gridStats(grid, tiers) {
  const counts = {};
  tiers.forEach(t => { counts[t.id] = 0; });
  grid.forEach(row => row.forEach(cell => { counts[cell] = (counts[cell] || 0) + 1; }));
  return tiers.map(t => ({
    ...t, hrs: counts[t.id] || 0, pct: (((counts[t.id] || 0) / 168) * 100).toFixed(0),
  }));
}

// --- Main Panel Component ------------------------------------

class SolarseedTOUPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._state = null;
    this._dirty = false;
    this._dragging = false;
    this._editingTier = null;
    this._holidaysOpen = true;
    this._showYaml = false;
    this._addingCustom = false;
    this._holTierOpen = false;
    this._initialized = false;
    this._toastTimeout = null;
  }

  set hass(value) {
    this._hass = value;
    if (!this._initialized) {
      this._initialized = true;
      this._loadConfig();
    }
  }

  set panel(value) { this._panel = value; }
  set narrow(value) { this._narrow = value; }
  set route(value) { this._route = value; }

  async _loadConfig() {
    this.shadowRoot.innerHTML = `<style>${PANEL_CSS}</style><div class="loading">Loading TOU configuration...</div>`;
    try {
      const config = await this._hass.callWS({ type: "solarseed_tou/get_config" });
      this._state = configToState(config);
      this._dirty = false;
      this._render();
    } catch (e) {
      console.error("Failed to load TOU config:", e);
      this.shadowRoot.innerHTML = `<style>${PANEL_CSS}</style>
        <div style="padding:40px;color:#ef4444">Failed to load configuration: ${e.message}</div>`;
    }
  }

  async _saveConfig() {
    const config = stateToConfig(this._state);
    try {
      await this._hass.callWS({ type: "solarseed_tou/set_config", config });
      this._dirty = false;
      this._updateSaveBar();
      this._showToast("Configuration saved");
    } catch (e) {
      this._showToast("Save failed: " + e.message, true);
    }
  }

  _discard() {
    this._loadConfig();
  }

  _markDirty() {
    this._dirty = true;
    this._updateSaveBar();
  }

  _showToast(msg, error = false) {
    const el = this.shadowRoot.querySelector(".toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast" + (error ? " error" : "") + " show";
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => { el.className = "toast"; }, 2500);
  }

  // ── Full render ────────────────────────────────────────────

  _render() {
    const s = this._state;
    const activeSeason = s.seasons.find(x => x.id === s.activeSeason) || s.seasons[0];
    const seasonMonths = s.monthMap.map((sid, mi) => MONTHS[mi] + (sid === s.activeSeason ? "" : "")).filter(() => true);
    const grid = s.grids[s.activeSeason] || Object.values(s.grids)[0] || DAYS.map(() => Array(24).fill(s.tiers[0]?.id));
    const stats = gridStats(grid, s.tiers);
    const avgRate = stats.reduce((a, st) => a + st.rate * st.hrs, 0) / 168;
    const holTier = getTier(s.tiers, s.holidays.rate_tier);
    const enabledCount = s.holidays.standard.length + s.holidays.custom.length;

    this.shadowRoot.innerHTML = `
      <style>${PANEL_CSS}</style>

      <!-- HEADER -->
      <div class="header">
        <div class="header-left">
          <div class="header-icon">\u2600</div>
          <div>
            <h1><span class="brand">Solarseed</span> TOU Energy Metering</h1>
            <p>Time-of-use cost tracking for Home Assistant</p>
          </div>
        </div>
        <a href="https://johnnysolarseed.com/tou-calculator" target="_blank" rel="noopener">Rate calculator \u2197</a>
      </div>

      <div class="content">
        <!-- ENERGY SENSOR -->
        <div class="card">
          <div class="sensor-info">
            <div class="lbl" style="margin-bottom:0">Energy Sensor</div>
            <div class="sensor-entity">${s.energy_sensor}</div>
            <span class="hint">kWh sensor \u2014 configured in integration setup</span>
          </div>
        </div>

        <!-- SEASONS -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div class="lbl" style="margin-bottom:0">Seasons</div>
            <span class="hint">Select a season, click months to assign</span>
          </div>
          <div id="season-tags" style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
            ${s.seasons.map(ss => `
              <div style="display:flex;align-items:center;gap:3px">
                <div class="season-tag ${ss.id === s.activeSeason ? "active" : ""}"
                     data-action="select-season" data-id="${ss.id}"
                     style="background:${ss.color}1a;border-color:${ss.id === s.activeSeason ? "#fff" : ss.color + "33"}">
                  <div class="season-dot" style="background:${ss.color}"></div>
                  <span style="font-weight:500">${seasonLabel(ss, s.monthMap)}</span>
                </div>
                ${s.seasons.length > 1 ? `<button class="btn-icon" data-action="remove-season" data-id="${ss.id}">\u2715</button>` : ""}
              </div>
            `).join("")}
            <button class="btn btn-sm" data-action="add-season">+ Season</button>
          </div>
          <div class="month-bar">
            ${MONTHS.map((m, mi) => {
              const sid = s.monthMap[mi];
              const ss = s.seasons.find(d => d.id === sid);
              const isAct = sid === s.activeSeason;
              return `<div class="month" data-action="paint-month" data-idx="${mi}"
                style="background:${ss ? ss.color + (isAct ? "55" : "22") : "#1a2838"};
                       color:${isAct ? "#fff" : "#8fa3be"};
                       border-color:${isAct ? (ss?.color || "#3b82f6") : "transparent"}"
                title="Assign ${m} to ${activeSeason?.name}">${m}</div>`;
            }).join("")}
          </div>
        </div>
      </div>

      <!-- TIER TOOLBAR -->
      <div id="tier-bar-sentinel" style="height:1px"></div>
      <div class="tier-bar" id="tier-bar">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;color:#4a6080;font-weight:600;margin-right:2px">PAINT:</span>
          ${s.tiers.map(t => `
            <div class="tier-btn ${t.id === s.activeTier ? "active" : ""}"
                 data-action="select-tier" data-id="${t.id}"
                 style="background:${t.color}${t.id === s.activeTier ? "22" : "0d"}">
              <div class="tier-dot" style="background:${t.color}"></div>
              <span style="font-size:11px;font-weight:600">${t.name}</span>
              <span class="tier-rate">$${t.rate.toFixed(4)}</span>
            </div>
          `).join("")}
          <button class="btn btn-sm" data-action="add-tier" style="font-size:13px;padding:3px 8px">+</button>
          <span class="hint" style="margin-left:6px">Click select \u00B7 Double-click edit</span>
        </div>
      </div>

      <div class="content-bottom">
        <!-- RATE GRID -->
        <div class="card grid-card">
          <div class="grid-header">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="season-dot" style="background:${activeSeason?.color || "#3b82f6"}"></div>
              <span style="font-size:13px;font-weight:600">${seasonLabel(activeSeason, s.monthMap)}</span>
              ${s.monthMap.filter(id => id === s.activeSeason).length < 12 ?
                `<span class="hint">${s.monthMap.map((id, mi) => id === s.activeSeason ? MONTHS[mi] : null).filter(Boolean).join(", ")}</span>` : ""}
            </div>
            <div style="display:flex;gap:4px">
              <button class="btn btn-sm" data-action="fill-all">Fill All</button>
              <button class="btn btn-sm" data-action="fill-weekdays">Weekdays</button>
              <button class="btn btn-sm" data-action="fill-weekends">Weekends</button>
            </div>
          </div>
          <div class="grid-body" id="grid-body">
            <div class="hour-labels">
              ${HOURS.map(h => `<div class="hour-label" data-action="fill-col" data-col="${h}">${h % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>`).join("")}
            </div>
            ${DAYS.map((d, di) => `
              <div class="grid-row">
                <div class="day-label ${di >= 5 ? "weekend" : ""}" data-action="fill-row" data-row="${di}">${d}</div>
                <div class="grid-cells">
                  ${HOURS.map(h => {
                    const t = getTier(s.tiers, grid[di]?.[h]);
                    return `<div class="cell" data-row="${di}" data-col="${h}"
                      style="background:${t.color};opacity:.85"
                      title="${d} ${String(h).padStart(2, "0")}:00 \u2014 ${t.name} ($${t.rate.toFixed(4)}/kWh)"></div>`;
                  }).join("")}
                </div>
              </div>
            `).join("")}
            <div class="grid-stats">
              ${stats.map(st => `
                <div class="stat">
                  <div class="stat-dot" style="background:${st.color}"></div>
                  <span class="stat-text">${st.name}: ${st.hrs}h (${st.pct}%)</span>
                </div>
              `).join("")}
              <div class="avg-rate">Avg: <strong>$${avgRate.toFixed(4)}/kWh</strong></div>
            </div>
          </div>
        </div>

        <!-- HOLIDAYS -->
        <div class="card">
          <div class="coll-hdr" data-action="toggle-holidays">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="coll-arrow">${this._holidaysOpen ? "\u25BE" : "\u25B8"}</span>
              <div class="lbl" style="margin-bottom:0">Holidays</div>
              ${!this._holidaysOpen ? `<span class="hint">${enabledCount} selected \u2192 <span style="color:${holTier.color}">${holTier.name}</span> rate ($${holTier.rate.toFixed(4)}/kWh)</span>` : ""}
            </div>
            ${this._holidaysOpen ? `
              <div style="display:flex;align-items:center;gap:8px" data-stop-propagation>
                <span class="hint">Holiday rate:</span>
                <div class="hol-tier-picker" data-action="toggle-hol-tier">
                  <div class="tier-dot" style="background:${holTier.color}"></div>
                  <span style="font-size:12px;font-weight:600">${holTier.name}</span>
                  <span class="tier-rate">$${holTier.rate.toFixed(4)}</span>
                  <span style="font-size:10px;color:#4a6080">\u25BE</span>
                  ${this._holTierOpen ? `
                    <div class="hol-tier-dropdown" id="hol-tier-dropdown">
                      ${s.tiers.map(t => `
                        <div class="hol-tier-opt" data-action="set-hol-tier" data-id="${t.id}"
                             style="background:${t.id === s.holidays.rate_tier ? "#253446" : "transparent"}">
                          <div class="tier-dot" style="background:${t.color}"></div>
                          <span style="font-weight:500">${t.name}</span>
                          <span class="tier-rate" style="margin-left:auto">$${t.rate.toFixed(4)}</span>
                        </div>
                      `).join("")}
                    </div>
                  ` : ""}
                </div>
              </div>
            ` : ""}
          </div>

          ${this._holidaysOpen ? `
            <div style="margin-top:10px">
              <div class="hol-check-row">
                <div class="chk ${s.holidays.observe_nearest_weekday ? "on" : ""}" data-action="toggle-shift">
                  ${s.holidays.observe_nearest_weekday ? '<span style="color:#fff;font-size:9px">\u2713</span>' : ""}
                </div>
                <div style="cursor:pointer" data-action="toggle-shift">
                  <div style="font-size:12px">Observe on nearest weekday</div>
                  <div class="hint">When a holiday falls on Saturday, it's observed Friday. Sunday \u2192 Monday.</div>
                </div>
              </div>
              <div class="hol-grid">
                ${STD_HOLIDAYS.map(h => {
                  const on = s.holidays.standard.includes(h.id);
                  return `<div class="hol-item" data-action="toggle-holiday" data-id="${h.id}">
                    <div class="chk ${on ? "on" : ""}">${on ? '<span style="color:#fff;font-size:9px">\u2713</span>' : ""}</div>
                    <span class="hol-name" style="color:${on ? "#dce4ee" : "#4a6080"}">${h.name}</span>
                    <span class="hol-when">${h.when}</span>
                  </div>`;
                }).join("")}
              </div>
              ${s.holidays.custom.length > 0 ? `
                <div style="border-top:1px solid #1a2838;padding-top:8px;margin-bottom:8px">
                  <div style="font-size:11px;color:#4a6080;font-weight:600;margin-bottom:4px">Custom</div>
                  ${s.holidays.custom.map(h => {
                    const rule = h.rule || h.type;
                    const desc = rule === "fixed"
                      ? `${MONTHS[(h.month || 1) - 1]} ${h.day}`
                      : `${ORD[(h.n || 1) - 1]} ${WEEKDAYS_LONG[h.weekday || 0]} in ${MONTHS[(h.month || 1) - 1]}`;
                    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
                      <span style="font-size:12px;flex:1">${h.name}<span class="muted" style="font-size:10px;margin-left:8px">${desc}</span></span>
                      <button class="btn-icon" data-action="remove-custom-hol" data-id="${h.id}">\u2715</button>
                    </div>`;
                  }).join("")}
                </div>
              ` : ""}
              ${this._addingCustom ? this._renderCustomForm() : `
                <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
                  <button class="btn btn-sm" data-action="add-custom-start">+ Custom Holiday</button>
                </div>
              `}
            </div>
          ` : ""}
        </div>

        <!-- YAML EXPORT -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="lbl" style="margin-bottom:0">Configuration</div>
            <div style="display:flex;gap:4px">
              <button class="btn btn-sm ${this._showYaml ? "active" : ""}" data-action="toggle-yaml">${this._showYaml ? "Hide" : "Show"} YAML</button>
              ${this._showYaml ? `<button class="btn btn-sm" data-action="copy-yaml">\uD83D\uDCCB Copy</button>` : ""}
            </div>
          </div>
          ${this._showYaml ? `<div class="yaml" style="margin-top:8px">${this._escHtml(generateYaml(s))}</div>` : ""}
        </div>

        <!-- FOOTER -->
        <div class="footer">
          <a href="https://johnnysolarseed.com" target="_blank" rel="noopener">\u2600 Johnny Solarseed</a>
          \u00B7
          <a href="https://github.com/throughline-tech/solarseed-tou" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>

      <!-- SAVE BAR -->
      <div class="save-bar ${this._dirty ? "visible" : ""}" id="save-bar">
        <button class="discard-btn" data-action="discard">Discard</button>
        <button class="save-btn" data-action="save">Save</button>
      </div>

      <!-- TIER EDIT MODAL -->
      ${this._editingTier ? this._renderTierModal() : ""}

      <!-- TOAST -->
      <div class="toast"></div>
    `;

    this._bindEvents();
  }

  _renderCustomForm() {
    return `
      <div class="custom-form" id="custom-form">
        <input class="inp" id="cf-name" placeholder="Holiday name" style="font-weight:600" />
        <div class="row">
          <button class="btn btn-sm active" id="cf-type-fixed" data-action="cf-type" data-type="fixed">Specific date</button>
          <button class="btn btn-sm" id="cf-type-nth" data-action="cf-type" data-type="nth">Nth weekday of month</button>
        </div>
        <div class="row" id="cf-fields">
          <select class="inp" id="cf-month" style="width:100px">${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select>
          <input class="inp" id="cf-day" type="number" min="1" max="31" value="1" style="width:60px" />
        </div>
        <div class="row">
          <button class="btn btn-sm active" data-action="cf-save">Add</button>
          <button class="btn btn-sm" data-action="cf-cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  _renderTierModal() {
    const t = this._state.tiers.find(x => x.id === this._editingTier);
    if (!t) return "";
    return `
      <div class="modal-overlay" data-action="close-modal">
        <div class="modal" data-stop-propagation>
          <h3>Edit Rate Tier</h3>
          <div class="modal-body">
            <div>
              <div class="lbl">Name</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="color" class="color-input" id="tier-color" value="${t.color}" />
                <input class="inp" id="tier-name" value="${t.name}" style="font-weight:600" />
              </div>
            </div>
            <div>
              <div class="lbl">Effective Rate ($/kWh)</div>
              <input class="inp" id="tier-rate" type="number" step="0.0001" min="0" value="${t.rate}" style="font-size:18px;font-weight:700;padding:10px" />
              <div style="font-size:10px;color:#3a5068;margin-top:2px">All-in cost including fees and taxes</div>
            </div>
            <div class="modal-actions">
              <button class="btn" data-action="save-tier">Done</button>
              ${this._state.tiers.length > 1 ? `<button class="btn btn-danger" data-action="delete-tier">Delete</button>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _escHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Event binding ──────────────────────────────────────────

  _bindEvents() {
    const root = this.shadowRoot;

    // Global mouseup — stop drag
    const mouseUp = () => { this._dragging = false; };
    root.addEventListener("mouseup", mouseUp);
    document.addEventListener("mouseup", mouseUp);

    // Action delegation — click
    root.addEventListener("click", (e) => {
      // Stop propagation for modal/dropdown inner clicks
      if (e.target.closest("[data-stop-propagation]")) {
        if (!e.target.closest("[data-action]")) return;
      }

      const actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      switch (action) {
        case "select-season": this._selectSeason(actionEl.dataset.id); break;
        case "remove-season": this._removeSeason(actionEl.dataset.id); break;
        case "add-season": this._addSeason(); break;
        case "paint-month": this._paintMonth(parseInt(actionEl.dataset.idx)); break;

        case "select-tier": this._selectTier(actionEl.dataset.id); break;
        case "add-tier": this._addTier(); break;

        case "fill-all": this._fillRange(0, 6); break;
        case "fill-weekdays": this._fillRange(0, 4); break;
        case "fill-weekends": this._fillRange(5, 6); break;
        case "fill-row": this._fillRow(parseInt(actionEl.dataset.row)); break;
        case "fill-col": this._fillCol(parseInt(actionEl.dataset.col)); break;

        case "toggle-holidays": this._holidaysOpen = !this._holidaysOpen; this._render(); break;
        case "toggle-hol-tier":
          e.stopPropagation();
          this._holTierOpen = !this._holTierOpen;
          this._render();
          break;
        case "set-hol-tier": this._setHolidayTier(actionEl.dataset.id); break;
        case "toggle-shift": this._toggleShift(); break;
        case "toggle-holiday": this._toggleHoliday(actionEl.dataset.id); break;
        case "remove-custom-hol": this._removeCustomHoliday(actionEl.dataset.id); break;
        case "add-custom-start": this._addingCustom = true; this._render(); break;
        case "cf-type": this._onCustomFormType(actionEl.dataset.type); break;
        case "cf-save": this._onCustomFormSave(); break;
        case "cf-cancel": this._addingCustom = false; this._render(); break;

        case "toggle-yaml": this._showYaml = !this._showYaml; this._render(); break;
        case "copy-yaml": this._copyYaml(); break;

        case "save": this._saveConfig(); break;
        case "discard": this._discard(); break;

        case "close-modal": this._editingTier = null; this._render(); break;
        case "save-tier": this._onSaveTier(); break;
        case "delete-tier": this._onDeleteTier(); break;
      }
    });

    // Double-click on tier — edit
    root.addEventListener("dblclick", (e) => {
      const tierEl = e.target.closest('[data-action="select-tier"]');
      if (tierEl) {
        this._editingTier = tierEl.dataset.id;
        this._render();
      }
    });

    // Grid drag painting
    const gridBody = root.querySelector("#grid-body");
    if (gridBody) {
      gridBody.addEventListener("mousedown", (e) => {
        const cell = e.target.closest(".cell");
        if (!cell) return;
        e.preventDefault();
        this._dragging = true;
        this._paintCell(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
      });

      gridBody.addEventListener("mouseover", (e) => {
        if (!this._dragging) return;
        const cell = e.target.closest(".cell");
        if (!cell) return;
        this._paintCell(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
      });
    }

    // Sticky tier bar
    const sentinel = root.querySelector("#tier-bar-sentinel");
    const tierBar = root.querySelector("#tier-bar");
    if (sentinel && tierBar) {
      const obs = new IntersectionObserver(([entry]) => {
        tierBar.classList.toggle("stuck", !entry.isIntersecting);
      }, { threshold: 0 });
      obs.observe(sentinel);
    }

    // Close holiday tier dropdown on outside click
    if (this._holTierOpen) {
      setTimeout(() => {
        const handler = (e) => {
          if (!e.target.closest(".hol-tier-picker")) {
            this._holTierOpen = false;
            this._render();
            root.removeEventListener("click", handler);
          }
        };
        root.addEventListener("click", handler);
      }, 0);
    }
  }

  // ── Grid operations ────────────────────────────────────────

  _paintCell(row, col) {
    const s = this._state;
    const grid = s.grids[s.activeSeason];
    if (!grid || !grid[row]) return;
    if (grid[row][col] === s.activeTier) return;
    grid[row][col] = s.activeTier;
    this._markDirty();

    // Targeted DOM update
    const cell = this.shadowRoot.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    if (cell) {
      const t = getTier(s.tiers, s.activeTier);
      cell.style.background = t.color;
      cell.title = `${DAYS[row]} ${String(col).padStart(2, "0")}:00 \u2014 ${t.name} ($${t.rate.toFixed(4)}/kWh)`;
    }
    this._updateGridStats();
  }

  _fillRow(row) {
    const grid = this._state.grids[this._state.activeSeason];
    if (!grid) return;
    grid[row] = Array(24).fill(this._state.activeTier);
    this._markDirty();
    this._render();
  }

  _fillCol(col) {
    const grid = this._state.grids[this._state.activeSeason];
    if (!grid) return;
    grid.forEach(row => { row[col] = this._state.activeTier; });
    this._markDirty();
    this._render();
  }

  _fillRange(start, end) {
    const grid = this._state.grids[this._state.activeSeason];
    if (!grid) return;
    for (let d = start; d <= end; d++) {
      grid[d] = Array(24).fill(this._state.activeTier);
    }
    this._markDirty();
    this._render();
  }

  _updateGridStats() {
    const grid = this._state.grids[this._state.activeSeason] || [];
    const stats = gridStats(grid, this._state.tiers);
    const avgRate = stats.reduce((a, st) => a + st.rate * st.hrs, 0) / 168;
    const statsEl = this.shadowRoot.querySelector(".grid-stats");
    if (statsEl) {
      statsEl.innerHTML = stats.map(st => `
        <div class="stat">
          <div class="stat-dot" style="background:${st.color}"></div>
          <span class="stat-text">${st.name}: ${st.hrs}h (${st.pct}%)</span>
        </div>
      `).join("") + `<div class="avg-rate">Avg: <strong>$${avgRate.toFixed(4)}/kWh</strong></div>`;
    }
  }

  // ── Season operations ──────────────────────────────────────

  _selectSeason(id) {
    this._state.activeSeason = id;
    this._render();
  }

  _addSeason() {
    const id = `s-${_uid++}`;
    const idx = this._state.seasons.length;
    this._state.seasons.push({
      id, name: "Summer", color: SEASON_COLORS[idx % SEASON_COLORS.length],
    });
    // Assign Jun-Aug to new season
    [5, 6, 7].forEach(mi => { this._state.monthMap[mi] = id; });
    // Init grid (copy from first season or default)
    const firstGrid = Object.values(this._state.grids)[0];
    this._state.grids[id] = DAYS.map(() => Array(24).fill(this._state.tiers[0]?.id || "off-peak"));
    this._state.activeSeason = id;
    this._markDirty();
    this._render();
  }

  _removeSeason(id) {
    if (this._state.seasons.length <= 1) return;
    const fallback = this._state.seasons.find(s => s.id !== id)?.id;
    this._state.monthMap = this._state.monthMap.map(sid => sid === id ? fallback : sid);
    this._state.seasons = this._state.seasons.filter(s => s.id !== id);
    delete this._state.grids[id];
    if (this._state.activeSeason === id) this._state.activeSeason = fallback;
    this._markDirty();
    this._render();
  }

  _paintMonth(idx) {
    this._state.monthMap[idx] = this._state.activeSeason;
    this._markDirty();
    this._render();
  }

  // ── Tier operations ────────────────────────────────────────

  _selectTier(id) {
    this._state.activeTier = id;
    // Targeted update — toggle active class
    this.shadowRoot.querySelectorAll(".tier-btn").forEach(el => {
      const isActive = el.dataset.id === id;
      el.classList.toggle("active", isActive);
      const t = getTier(this._state.tiers, el.dataset.id);
      el.style.background = t.color + (isActive ? "22" : "0d");
    });
  }

  _addTier() {
    const id = `tier-${_uid++}`;
    const idx = this._state.tiers.length;
    this._state.tiers.push({
      id, name: `Tier ${idx + 1}`, rate: 0.12,
      color: TIER_COLORS[idx % TIER_COLORS.length],
    });
    this._editingTier = id;
    this._markDirty();
    this._render();
  }

  _onSaveTier() {
    const s = this._state;
    const t = s.tiers.find(x => x.id === this._editingTier);
    if (!t) return;

    const name = this.shadowRoot.querySelector("#tier-name")?.value || t.name;
    const rate = parseFloat(this.shadowRoot.querySelector("#tier-rate")?.value) || t.rate;
    const color = this.shadowRoot.querySelector("#tier-color")?.value || t.color;

    t.name = name;
    t.rate = rate;
    t.color = color;

    this._editingTier = null;
    this._markDirty();
    this._render();
  }

  _onDeleteTier() {
    const s = this._state;
    if (s.tiers.length <= 1) return;
    const id = this._editingTier;
    const fallback = s.tiers.find(t => t.id !== id)?.id;

    // Replace in all grids
    Object.values(s.grids).forEach(grid => {
      grid.forEach(row => {
        row.forEach((cell, i, arr) => { if (cell === id) arr[i] = fallback; });
      });
    });

    s.tiers = s.tiers.filter(t => t.id !== id);
    if (s.activeTier === id) s.activeTier = fallback;
    if (s.holidays.rate_tier === id) s.holidays.rate_tier = fallback;
    this._editingTier = null;
    this._markDirty();
    this._render();
  }

  // ── Holiday operations ─────────────────────────────────────

  _setHolidayTier(id) {
    this._state.holidays.rate_tier = id;
    this._holTierOpen = false;
    this._markDirty();
    this._render();
  }

  _toggleShift() {
    this._state.holidays.observe_nearest_weekday = !this._state.holidays.observe_nearest_weekday;
    this._markDirty();
    this._render();
  }

  _toggleHoliday(id) {
    const std = this._state.holidays.standard;
    const idx = std.indexOf(id);
    if (idx >= 0) std.splice(idx, 1);
    else std.push(id);
    this._markDirty();
    this._render();
  }

  _removeCustomHoliday(id) {
    this._state.holidays.custom = this._state.holidays.custom.filter(h => h.id !== id);
    this._markDirty();
    this._render();
  }

  _onCustomFormType(type) {
    const root = this.shadowRoot;
    const fixedBtn = root.querySelector("#cf-type-fixed");
    const nthBtn = root.querySelector("#cf-type-nth");
    const fields = root.querySelector("#cf-fields");
    if (!fields) return;

    if (type === "fixed") {
      fixedBtn?.classList.add("active");
      nthBtn?.classList.remove("active");
      fields.innerHTML = `
        <select class="inp" id="cf-month" style="width:100px">${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select>
        <input class="inp" id="cf-day" type="number" min="1" max="31" value="1" style="width:60px" />
      `;
    } else {
      nthBtn?.classList.add("active");
      fixedBtn?.classList.remove("active");
      fields.innerHTML = `
        <select class="inp" id="cf-n" style="width:70px">${ORD.map((o, i) => `<option value="${i + 1}">${o}</option>`).join("")}</select>
        <select class="inp" id="cf-weekday" style="width:130px">${WEEKDAYS_LONG.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select>
        <span class="hint">of</span>
        <select class="inp" id="cf-month" style="width:100px">${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select>
      `;
    }
  }

  _onCustomFormSave() {
    const root = this.shadowRoot;
    const name = root.querySelector("#cf-name")?.value?.trim();
    if (!name) return;

    const isFixed = root.querySelector("#cf-type-fixed")?.classList.contains("active");
    const month = parseInt(root.querySelector("#cf-month")?.value) || 1;

    const entry = { id: `c-${_uid++}`, name, rule: isFixed ? "fixed" : "nth", month };
    if (isFixed) {
      entry.day = parseInt(root.querySelector("#cf-day")?.value) || 1;
    } else {
      entry.weekday = parseInt(root.querySelector("#cf-weekday")?.value) || 0;
      entry.n = parseInt(root.querySelector("#cf-n")?.value) || 1;
    }

    this._state.holidays.custom.push(entry);
    this._addingCustom = false;
    this._markDirty();
    this._render();
  }

  // ── YAML ───────────────────────────────────────────────────

  _copyYaml() {
    const yaml = generateYaml(this._state);
    navigator.clipboard?.writeText(yaml).then(() => {
      this._showToast("Copied to clipboard");
    });
  }

  // ── Save bar ───────────────────────────────────────────────

  _updateSaveBar() {
    const bar = this.shadowRoot.querySelector("#save-bar");
    if (bar) bar.classList.toggle("visible", this._dirty);
  }
}

customElements.define("solarseed-tou-panel", SolarseedTOUPanel);
