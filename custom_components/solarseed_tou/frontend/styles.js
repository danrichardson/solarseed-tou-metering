// Solarseed TOU — Shared CSS
// Dark theme matching the React prototype (tou-plugin-v5.jsx)

export const PANEL_CSS = `
  :host {
    display: block;
    background: #0e1620;
    min-height: 100vh;
    color: #dce4ee;
    font-family: 'Segoe UI', Roboto, sans-serif;
    -webkit-user-select: none;
    user-select: none;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #131c28; }
  ::-webkit-scrollbar-thumb { background: #2a3a4e; border-radius: 2px; }

  /* Layout */
  .header {
    padding: 14px 20px;
    border-bottom: 1px solid #1a2838;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .header-icon {
    width: 32px; height: 32px; border-radius: 8px;
    background: linear-gradient(135deg, #f59e0b 0%, #22c55e 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  .header h1 { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
  .header h1 .brand { color: #f59e0b; }
  .header p { font-size: 11px; color: #4a6080; margin-top: 0; }
  .header a { font-size: 11px; color: #3b82f6; text-decoration: none; }

  .content { padding: 14px 20px 0; display: flex; flex-direction: column; gap: 12px; }
  .content-bottom { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 12px; }

  /* Cards */
  .card {
    background: #131c28; border-radius: 10px;
    padding: 14px; border: 1px solid #1a2838;
  }

  /* Labels & text */
  .lbl { font-size: 11px; color: #4a6080; font-weight: 600; margin-bottom: 4px; }
  .hint { font-size: 11px; color: #4a6080; }
  .muted { color: #3a5068; }

  /* Buttons */
  .btn {
    background: #1a2838; border: 1px solid #253446; color: #8fa3be;
    padding: 6px 12px; border-radius: 6px; cursor: pointer;
    font-size: 12px; font-family: inherit; transition: all .12s;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .btn:hover { background: #253446; color: #dce4ee; }
  .btn.active { background: #253446; color: #dce4ee; border-color: #3b82f6; }
  .btn-sm { padding: 4px 8px; font-size: 11px; border-radius: 4px; }
  .btn-icon {
    padding: 1px 5px; color: #3a5068; background: transparent;
    border: none; cursor: pointer; font-size: 12px;
  }
  .btn-icon:hover { color: #dce4ee; }
  .btn-danger { color: #ef4444; }

  /* Inputs */
  .inp {
    background: #0b1219; border: 1px solid #253446; color: #dce4ee;
    padding: 8px 10px; border-radius: 6px; font-family: inherit;
    font-size: 13px; outline: none; width: 100%;
  }
  .inp:focus { border-color: #3b82f6; }
  select.inp { cursor: pointer; }
  .inp-inline {
    width: auto; font-size: 12px; padding: 1px 4px;
    background: transparent; border: none; border-bottom: 1px solid #3b82f6;
    border-radius: 0; color: #dce4ee; outline: none;
  }

  /* Checkbox */
  .chk {
    width: 16px; height: 16px; border-radius: 4px;
    border: 2px solid #253446; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .1s; flex-shrink: 0;
  }
  .chk.on { background: #3b82f6; border-color: #3b82f6; }

  /* Season tags */
  .season-tag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 7px; font-size: 12px;
    cursor: pointer; border: 2px solid transparent; transition: all .12s;
  }
  .season-tag:hover { filter: brightness(1.1); }
  .season-tag.active { border-color: #fff; box-shadow: 0 0 8px rgba(255,255,255,.15); }
  .season-dot { width: 10px; height: 10px; border-radius: 3px; }

  /* Month bar */
  .month-bar { display: flex; gap: 2px; }
  .month {
    flex: 1; text-align: center; padding: 8px 2px; cursor: pointer;
    border-radius: 4px; transition: all .12s; font-size: 12px; font-weight: 500;
    border: 2px solid transparent;
  }
  .month:hover { filter: brightness(1.2); }

  /* Tier toolbar */
  .tier-bar {
    position: sticky; top: 0; z-index: 20;
    padding: 8px 20px; transition: box-shadow .2s, background .2s;
    background: #0e1620;
  }
  .tier-bar.stuck { box-shadow: 0 4px 20px rgba(0,0,0,.4); border-bottom: 1px solid #1a2838; }
  .tier-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border: 2px solid transparent;
    border-radius: 7px; cursor: pointer; transition: all .12s;
  }
  .tier-btn:hover { filter: brightness(1.15); }
  .tier-btn.active { border-color: #fff; box-shadow: 0 0 12px rgba(255,255,255,.25); }
  .tier-dot { width: 12px; height: 12px; border-radius: 3px; }
  .tier-rate { font-size: 11px; color: #8fa3be; }

  /* Grid */
  .grid-card { padding: 0; overflow: hidden; }
  .grid-header {
    padding: 8px 14px; border-bottom: 1px solid #1a2838;
    display: flex; justify-content: space-between; align-items: center;
    background: #111a26;
  }
  .grid-body { padding: 8px 12px 8px; }
  .grid-row { display: flex; align-items: center; margin-bottom: 2px; }
  .day-label {
    width: 36px; font-size: 11px; font-weight: 500;
    text-align: right; padding-right: 4px; flex-shrink: 0;
    cursor: pointer; transition: color .1s;
  }
  .day-label:hover { color: #fff; }
  .day-label.weekend { color: #3b82f6; }
  .grid-cells { display: flex; flex: 1; gap: 1px; }
  .cell {
    flex: 1; height: 38px; border-radius: 2px;
    transition: background .05s; cursor: pointer;
  }
  .cell:hover { filter: brightness(1.3); transform: scale(1.06); z-index: 2; }
  .hour-labels { display: flex; margin-left: 40px; margin-bottom: 2px; }
  .hour-label {
    flex: 1; text-align: center; font-size: 10px; color: #6a829e;
    font-weight: 600; cursor: pointer; transition: color .1s;
  }
  .hour-label:hover { color: #fff; }
  .grid-stats {
    display: flex; gap: 10px; margin-top: 6px; align-items: center; flex-wrap: wrap;
  }
  .stat { display: flex; align-items: center; gap: 4px; font-size: 11px; }
  .stat-dot { width: 8px; height: 8px; border-radius: 2px; }
  .stat-text { color: #6a829e; }
  .avg-rate { margin-left: auto; font-size: 12px; color: #6a829e; }
  .avg-rate strong { color: #dce4ee; font-weight: 700; }

  /* Holidays */
  .coll-hdr {
    display: flex; align-items: center; justify-content: space-between; cursor: pointer;
  }
  .coll-hdr:hover .coll-arrow { color: #dce4ee; }
  .coll-arrow { color: #4a6080; transition: color .1s; font-size: 12px; }
  .hol-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; margin-bottom: 8px; }
  .hol-item {
    display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer;
  }
  .hol-name { font-size: 12px; flex: 1; }
  .hol-when { font-size: 10px; color: #3a5068; }
  .hol-tier-picker {
    display: flex; align-items: center; gap: 6px; padding: 4px 10px;
    border-radius: 6px; border: 1px solid #253446; background: #0e1620;
    cursor: pointer; position: relative;
  }
  .hol-tier-dropdown {
    position: absolute; top: calc(100% + 4px); right: 0;
    background: #1a2838; border: 1px solid #253446; border-radius: 8px;
    padding: 4px; z-index: 50; min-width: 170px;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
  }
  .hol-tier-opt {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    border-radius: 4px; cursor: pointer; transition: all .1s; font-size: 12px;
  }
  .hol-tier-opt:hover { background: #253446; }
  .hol-check-row {
    display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px;
    padding: 8px 10px; background: #0e162044; border-radius: 6px;
  }

  /* Custom holiday form */
  .custom-form {
    background: #0e1620; border: 1px solid #253446; border-radius: 8px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
  }
  .custom-form .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

  /* YAML */
  .yaml {
    background: #080d14; border: 1px solid #1a2838; border-radius: 8px;
    padding: 14px; font-size: 11px; line-height: 1.5; color: #6a829e;
    max-height: 400px; overflow: auto; white-space: pre;
    font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;
  }

  /* Tier edit modal */
  .modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,.6); display: flex;
    align-items: center; justify-content: center; z-index: 100;
    backdrop-filter: blur(3px);
  }
  .modal {
    background: #1a2838; border: 1px solid #253446; border-radius: 12px;
    padding: 18px; min-width: 260px; max-width: 320px;
    box-shadow: 0 16px 48px rgba(0,0,0,.5);
  }
  .modal h3 { font-size: 14px; font-weight: 700; margin-bottom: 12px; }
  .modal-body { display: flex; flex-direction: column; gap: 10px; }
  .modal-actions { display: flex; gap: 6px; margin-top: 4px; }
  .modal-actions .btn { flex: 1; justify-content: center; }
  .color-input {
    width: 32px; height: 32px; border: none; border-radius: 4px;
    cursor: pointer; padding: 0;
  }

  /* Save button */
  .save-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 12px 20px; background: #131c28ee;
    border-top: 1px solid #253446;
    display: flex; justify-content: flex-end; gap: 8px;
    z-index: 30; backdrop-filter: blur(6px);
    transform: translateY(100%); transition: transform .2s ease;
  }
  .save-bar.visible { transform: translateY(0); }
  .save-btn {
    background: #3b82f6; color: #fff; border: none;
    padding: 8px 24px; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 600; font-family: inherit;
    transition: background .15s;
  }
  .save-btn:hover { background: #2563eb; }
  .discard-btn {
    background: transparent; color: #8fa3be; border: 1px solid #253446;
    padding: 8px 16px; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-family: inherit; transition: all .15s;
  }
  .discard-btn:hover { background: #1a2838; color: #dce4ee; }

  /* Toast */
  .toast {
    position: fixed; bottom: 70px; right: 20px;
    background: #22c55e; color: #fff; padding: 10px 20px;
    border-radius: 8px; font-size: 13px; font-weight: 600;
    z-index: 40; opacity: 0; transform: translateY(10px);
    transition: all .3s; pointer-events: none;
  }
  .toast.error { background: #ef4444; }
  .toast.show { opacity: 1; transform: translateY(0); }

  /* Footer */
  .footer {
    text-align: center; padding: 8px 0 16px;
    font-size: 10px; color: #2a3a4e;
  }
  .footer a { color: #3a5068; text-decoration: none; }

  /* Sensor info */
  .sensor-info {
    display: flex; align-items: center; gap: 12px;
  }
  .sensor-entity {
    font-size: 13px; color: #3b82f6; font-weight: 500;
    background: #3b82f611; padding: 4px 10px; border-radius: 6px;
    border: 1px solid #3b82f622;
  }

  /* Loading */
  .loading {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px; color: #4a6080; font-size: 14px;
  }
`;
