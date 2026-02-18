import { useState, useCallback, useRef, useMemo, useEffect } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

export default function SolarseedTOU() {
  // ── Tiers ──
  const [tiers, setTiers] = useState([
    { id: "off-peak", name: "Off-Peak", rate: 0.1042, color: "#22c55e" },
    { id: "on-peak", name: "On-Peak", rate: 0.1827, color: "#ef4444" },
  ]);
  const [activeTier, setActiveTier] = useState("off-peak");
  const [editTier, setEditTier] = useState(null);
  const getTier = useCallback(id => tiers.find(t => t.id === id) || tiers[0], [tiers]);

  // ── Seasons ──
  const [seasonDefs, setSeasonDefs] = useState([{ id: "default", name: "All Year", color: "#3b82f6" }]);
  const [monthMap, setMonthMap] = useState(Array(12).fill("default"));
  const [activeSeason, setActiveSeason] = useState("default");
  const [renamingSeason, setRenamingSeason] = useState(null);

  // ── Grids ──
  const [grids, setGrids] = useState(() => ({
    default: DAYS.map((_, di) => HOURS.map(h => {
      if (di >= 5) return "off-peak";
      if (h >= 15 && h < 20) return "on-peak";
      return "off-peak";
    })),
  }));

  // ── Holidays ──
  const [enabledHolidays, setEnabledHolidays] = useState(new Set(["new_years", "memorial", "independence", "labor", "thanksgiving", "christmas"]));
  const [holidayTier, setHolidayTier] = useState("off-peak");
  const [holidayShift, setHolidayShift] = useState(true);
  const [customHolidays, setCustomHolidays] = useState([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [holOpen, setHolOpen] = useState(true);

  // ── Sensor ──
  const [sensor, setSensor] = useState("");

  // ── UI ──
  const [isDragging, setIsDragging] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [tierBarStuck, setTierBarStuck] = useState(false);
  const dragRef = useRef(null);
  const sentinelRef = useRef(null);

  const grid = grids[activeSeason] || grids.default;

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(([e]) => setTierBarStuck(!e.isIntersecting), { threshold: 0 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Season helpers ──
  const seasonMonths = useMemo(() => {
    const m = {}; seasonDefs.forEach(s => m[s.id] = []);
    monthMap.forEach((sid, mi) => { if (m[sid]) m[sid].push(mi); });
    return m;
  }, [seasonDefs, monthMap]);

  const getSeasonLabel = s => (seasonMonths[s.id] || []).length === 12 ? "All Year" : (seasonMonths[s.id] || []).length === 0 ? "(none)" : s.name;

  // ── Grid ops ──
  const setCell = useCallback((di, hi) => {
    setGrids(p => ({ ...p, [activeSeason]: (p[activeSeason] || p.default).map((r, d) => d !== di ? r : r.map((c, h) => h !== hi ? c : (dragRef.current || activeTier))) }));
  }, [activeTier, activeSeason]);
  const mDown = (di, hi) => { dragRef.current = activeTier; setIsDragging(true); setCell(di, hi); };
  const mEnter = (di, hi) => { if (isDragging) setCell(di, hi); };
  const mUp = () => setIsDragging(false);
  const fillRow = di => setGrids(p => ({ ...p, [activeSeason]: (p[activeSeason] || p.default).map((r, d) => d !== di ? r : Array(24).fill(activeTier)) }));
  const fillCol = hi => setGrids(p => ({ ...p, [activeSeason]: (p[activeSeason] || p.default).map(r => r.map((c, h) => h !== hi ? c : activeTier)) }));
  const fillRange = (a, b) => setGrids(p => ({ ...p, [activeSeason]: (p[activeSeason] || p.default).map((r, d) => d >= a && d <= b ? Array(24).fill(activeTier) : r) }));

  // ── Tier CRUD ──
  const addTier = () => {
    const id = `tier-${_uid++}`;
    const colors = ["#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316"];
    setTiers(p => [...p, { id, name: `Tier ${p.length + 1}`, rate: 0.12, color: colors[p.length % colors.length] }]);
    setEditTier(id);
  };
  const removeTier = id => {
    if (tiers.length <= 1) return;
    const fb = tiers.find(t => t.id !== id)?.id;
    setGrids(prev => { const n = {}; Object.entries(prev).forEach(([k, g]) => { n[k] = g.map(r => r.map(c => c === id ? fb : c)); }); return n; });
    setTiers(p => p.filter(t => t.id !== id));
    if (activeTier === id) setActiveTier(fb);
    if (editTier === id) setEditTier(null);
    if (holidayTier === id) setHolidayTier(fb);
  };
  const updateTier = (id, f, v) => setTiers(p => p.map(t => t.id === id ? { ...t, [f]: f === "rate" ? parseFloat(v) || 0 : v } : t));

  // ── Season CRUD ──
  const addSeason = () => {
    const id = `s-${_uid++}`;
    const colors = ["#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4"];
    setSeasonDefs(p => [...p, { id, name: "Summer", color: colors[p.length % colors.length] }]);
    setMonthMap(prev => prev.map((sid, mi) => (mi >= 5 && mi <= 7) ? id : sid));
    setGrids(p => ({ ...p, [id]: DAYS.map(() => Array(24).fill(tiers[0]?.id || "off-peak")) }));
    setActiveSeason(id);
  };
  const removeSeason = id => {
    if (seasonDefs.length <= 1) return;
    const fb = seasonDefs.find(s => s.id !== id)?.id;
    setMonthMap(prev => prev.map(sid => sid === id ? fb : sid));
    setSeasonDefs(p => p.filter(s => s.id !== id));
    setGrids(p => { const n = { ...p }; delete n[id]; return n; });
    if (activeSeason === id) setActiveSeason(fb);
  };
  const paintMonth = mi => setMonthMap(prev => prev.map((sid, i) => i === mi ? activeSeason : sid));

  // ── Stats ──
  const stats = useMemo(() => {
    const c = {}; tiers.forEach(t => c[t.id] = 0);
    grid.forEach(r => r.forEach(cell => c[cell] = (c[cell] || 0) + 1));
    return tiers.map(t => ({ ...t, hrs: c[t.id] || 0, pct: (((c[t.id] || 0) / 168) * 100).toFixed(0) }));
  }, [tiers, grid]);
  const weightedAvg = stats.reduce((a, s) => a + s.rate * s.hrs, 0) / 168;

  // ── Custom holidays ──
  const addCustomHoliday = h => { setCustomHolidays(p => [...p, { ...h, id: `c-${_uid++}` }]); setAddingCustom(false); };
  const enabledCount = enabledHolidays.size + customHolidays.length;
  const holTier = getTier(holidayTier);
  const sensorValid = sensor.trim().length > 0;

  // ── YAML ──
  const yaml = useMemo(() => {
    let y = `# Solarseed TOU Energy Metering\n# https://github.com/throughline-tech/solarseed-tou\n\n`;
    y += `tou_metering:\n  energy_sensor: "${sensor}"\n\n  tiers:\n`;
    tiers.forEach(t => y += `    ${t.id}:\n      name: "${t.name}"\n      rate: ${t.rate}  # effective $/kWh\n`);
    const uniq = [...new Set(monthMap)];
    y += `\n  seasons:\n`;
    uniq.forEach(sid => {
      const s = seasonDefs.find(d => d.id === sid);
      const ms = monthMap.map((id, mi) => id === sid ? mi + 1 : null).filter(Boolean);
      const g = grids[sid] || grids.default;
      y += `    ${(s?.name || sid).toLowerCase().replace(/[^a-z0-9]+/g, "_")}:\n      months: [${ms.join(",")}]\n      grid:\n`;
      DAYS.forEach((d, di) => y += `        ${d.toLowerCase()}: [${g[di].map(c => `"${c}"`).join(",")}]\n`);
    });
    y += `\n  holidays:\n    rate_tier: "${holidayTier}"\n    observe_nearest_weekday: ${holidayShift}\n    standard:\n`;
    enabledHolidays.forEach(id => y += `      - "${id}"\n`);
    if (customHolidays.length) {
      y += `    custom:\n`;
      customHolidays.forEach(h => {
        y += `      - name: "${h.name}"\n        type: "${h.type}"\n        month: ${h.month}\n`;
        if (h.type === "fixed") y += `        day: ${h.day}\n`;
        else y += `        weekday: ${h.weekday}\n        n: ${h.n}\n`;
      });
    }
    return y;
  }, [tiers, seasonDefs, monthMap, grids, enabledHolidays, customHolidays, holidayTier, holidayShift, sensor]);

  return (
    <div style={{ background: "#0e1620", minHeight: "100vh", color: "#dce4ee", fontFamily: "'Segoe UI','Roboto',sans-serif" }}
      onMouseUp={mUp} onMouseLeave={mUp}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#131c28}::-webkit-scrollbar-thumb{background:#2a3a4e;border-radius:2px}
        .c{transition:background .05s;cursor:pointer;border-radius:2px}.c:hover{filter:brightness(1.3);transform:scale(1.06);z-index:2}
        .btn{background:#1a2838;border:1px solid #253446;color:#8fa3be;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;transition:all .12s}
        .btn:hover{background:#253446;color:#dce4ee}.btn.on{background:#253446;color:#dce4ee;border-color:#3b82f6}
        .btn-s{padding:4px 8px;font-size:11px;border-radius:4px}
        .inp{background:#0b1219;border:1px solid #253446;color:#dce4ee;padding:8px 10px;border-radius:6px;font-family:inherit;font-size:13px;outline:none;width:100%}
        .inp:focus{border-color:#3b82f6}select.inp{cursor:pointer}
        .lbl{font-size:11px;color:#4a6080;font-weight:600;margin-bottom:4px}
        .card{background:#131c28;border-radius:10px;padding:14px;border:1px solid #1a2838}
        .hl:hover{color:#fff!important;cursor:pointer}
        .chk{width:16px;height:16px;border-radius:4px;border:2px solid #253446;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;flex-shrink:0}
        .chk.on{background:#3b82f6;border-color:#3b82f6}
        .yaml{background:#080d14;border:1px solid #1a2838;border-radius:8px;padding:14px;font-size:11px;line-height:1.5;color:#6a829e;max-height:400px;overflow:auto;white-space:pre;font-family:'JetBrains Mono',monospace}
        .mo{width:calc(100%/12);text-align:center;padding:8px 2px;cursor:pointer;border-radius:4px;transition:all .12s;font-size:12px;font-weight:500}.mo:hover{filter:brightness(1.2)}
        .stag{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;font-size:12px;cursor:pointer;border:2px solid transparent;transition:all .12s}
        .stag:hover{filter:brightness(1.1)}.stag.a{border-color:#fff;box-shadow:0 0 8px rgba(255,255,255,.15)}
        .tp{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:2px solid transparent;border-radius:7px;cursor:pointer;transition:all .12s}
        .tp:hover{filter:brightness(1.15)}.tp.a{border-color:#fff;box-shadow:0 0 8px rgba(255,255,255,.2)}
        .tier-bar{position:sticky;top:0;z-index:20;padding:8px 20px;transition:box-shadow .2s,background .2s}
        .tier-bar.stuck{box-shadow:0 4px 20px rgba(0,0,0,.4)}
        .td-wrap{position:relative;display:inline-block}
        .td{position:absolute;top:calc(100% + 4px);right:0;background:#1a2838;border:1px solid #253446;border-radius:8px;padding:4px;z-index:50;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,.4)}
        .td-opt{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;cursor:pointer;transition:all .1s;font-size:12px}.td-opt:hover{background:#253446}
        .coll-hdr{display:flex;align-items:center;justify-content:space-between;cursor:pointer}.coll-hdr:hover .ca{color:#dce4ee}
        .ca{color:#4a6080;transition:color .1s;font-size:12px}
        .modal-ov{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(3px)}
        .modal{background:#1a2838;border:1px solid #253446;border-radius:12px;padding:18px;min-width:260px;max-width:320px;box-shadow:0 16px 48px rgba(0,0,0,.5)}
        .sensor-warn{border:1px solid #f59e0b44;background:#f59e0b08;border-radius:8px;padding:10px 14px}
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap');
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a2838", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #f59e0b 0%, #22c55e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>☀</div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.3px" }}>
              <span style={{ color: "#f59e0b" }}>Solarseed</span> TOU Energy Metering
            </h1>
            <p style={{ fontSize: 11, color: "#4a6080", marginTop: 0 }}>Time-of-use cost tracking for Home Assistant</p>
          </div>
        </div>
        <a href="https://johnnysolarseed.com/tou-calculator" target="_blank" rel="noopener"
          style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }}>Rate calculator ↗</a>
      </div>

      <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── 1. ENERGY SENSOR ── */}
        <div className={sensorValid ? "card" : "sensor-warn"}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flexShrink: 0 }}>
              <div className="lbl" style={{ marginBottom: 0 }}>Energy Sensor</div>
            </div>
            <input className="inp" value={sensor} onChange={e => setSensor(e.target.value)}
              placeholder="sensor.your_energy_meter"
              style={{ flex: 1, maxWidth: 380, borderColor: sensorValid ? "#253446" : "#f59e0b66" }} />
            <span style={{ fontSize: 11, color: "#4a6080", flexShrink: 0 }}>
              {sensorValid ? "kWh sensor to track" : "⚠ Required — select your kWh energy sensor"}
            </span>
          </div>
        </div>

        {/* ── 2. SEASONS ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="lbl" style={{ marginBottom: 0 }}>Seasons</div>
            <span style={{ fontSize: 11, color: "#4a6080" }}>Select a season, click months to assign</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            {seasonDefs.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <div className={`stag ${activeSeason === s.id ? "a" : ""}`}
                  onClick={() => setActiveSeason(s.id)} onDoubleClick={() => setRenamingSeason(s.id)}
                  style={{ background: s.color + "1a", borderColor: activeSeason === s.id ? "#fff" : s.color + "33" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                  {renamingSeason === s.id ? (
                    <input autoFocus value={s.name} onClick={e => e.stopPropagation()}
                      onChange={e => setSeasonDefs(p => p.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
                      onBlur={() => setRenamingSeason(null)} onKeyDown={e => e.key === "Enter" && setRenamingSeason(null)}
                      style={{ width: 90, fontSize: 12, padding: "1px 4px", background: "transparent", border: "none", borderBottom: "1px solid #3b82f6", borderRadius: 0, color: "#dce4ee", fontFamily: "inherit", outline: "none" }} />
                  ) : <span style={{ fontWeight: 500 }}>{getSeasonLabel(s)}</span>}
                </div>
                {seasonDefs.length > 1 && <button className="btn btn-s" style={{ padding: "1px 5px", color: "#3a5068", background: "transparent", border: "none" }} onClick={() => removeSeason(s.id)}>✕</button>}
              </div>
            ))}
            <button className="btn btn-s" onClick={addSeason}>+ Season</button>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {MO.map((m, mi) => {
              const sid = monthMap[mi]; const s = seasonDefs.find(d => d.id === sid); const isAct = sid === activeSeason;
              return <div key={mi} className="mo" onClick={() => paintMonth(mi)}
                style={{ background: s ? s.color + (isAct ? "55" : "22") : "#1a2838", color: isAct ? "#fff" : "#8fa3be", border: `2px solid ${isAct ? (s?.color || "#3b82f6") : "transparent"}` }}
                title={`Assign ${MO[mi]} to ${seasonDefs.find(d => d.id === activeSeason)?.name}`}>{m}</div>;
            })}
          </div>
        </div>
      </div>

      {/* ── 3. TIER TOOLBAR (sticky) ── */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      <div className={`tier-bar ${tierBarStuck ? "stuck" : ""}`}
        style={{ background: tierBarStuck ? "#0e1620f0" : "#0e1620", borderBottom: tierBarStuck ? "1px solid #1a2838" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#4a6080", fontWeight: 600, marginRight: 2 }}>PAINT:</span>
          {tiers.map(t => (
            <div key={t.id} className={`tp ${activeTier === t.id ? "a" : ""}`}
              onClick={() => { setActiveTier(t.id); setEditTier(null); }} onDoubleClick={() => setEditTier(t.id)}
              style={{ background: t.color + (activeTier === t.id ? "22" : "0d") }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 10, color: "#6a829e" }}>${t.rate.toFixed(4)}</span>
            </div>
          ))}
          <button className="btn btn-s" onClick={addTier} style={{ fontSize: 13, padding: "3px 8px" }}>+</button>
          {!tierBarStuck && <span style={{ fontSize: 10, color: "#3a5068", marginLeft: 6 }}>Click select · Double-click edit</span>}
        </div>
      </div>

      <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── 4. RATE GRID ── */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid #1a2838", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111a26" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: seasonDefs.find(s => s.id === activeSeason)?.color || "#3b82f6" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{getSeasonLabel(seasonDefs.find(s => s.id === activeSeason) || seasonDefs[0])}</span>
              {(seasonMonths[activeSeason] || []).length < 12 && <span style={{ fontSize: 11, color: "#4a6080" }}>{(seasonMonths[activeSeason] || []).map(m => MO[m]).join(", ")}</span>}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn btn-s" onClick={() => fillRange(0, 6)}>Fill All</button>
              <button className="btn btn-s" onClick={() => fillRange(0, 4)}>Weekdays</button>
              <button className="btn btn-s" onClick={() => fillRange(5, 6)}>Weekends</button>
            </div>
          </div>
          <div style={{ padding: "8px 12px 8px" }}>
            <div style={{ display: "flex", marginLeft: 40, marginBottom: 2 }}>
              {HOURS.map(h => <div key={h} className="hl" onClick={() => fillCol(h)} style={{ width: "calc(100%/24)", textAlign: "center", fontSize: 9, color: "#3a5068", fontWeight: 500 }}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>)}
            </div>
            {DAYS.map((d, di) => (
              <div key={d} style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                <div className="hl" onClick={() => fillRow(di)} style={{ width: 36, fontSize: 11, fontWeight: 500, color: di >= 5 ? "#3b82f6" : "#4a6080", textAlign: "right", paddingRight: 4, flexShrink: 0 }}>{d}</div>
                <div style={{ display: "flex", flex: 1, gap: 1 }}>
                  {HOURS.map(h => { const t = getTier(grid[di][h]); return <div key={h} className="c" onMouseDown={() => mDown(di, h)} onMouseEnter={() => mEnter(di, h)} style={{ flex: 1, height: 28, background: t.color, opacity: .85 }} title={`${d} ${String(h).padStart(2, "0")}:00 — ${t.name} ($${t.rate.toFixed(4)}/kWh)`} />; })}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              {stats.map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} /><span style={{ color: "#6a829e" }}>{s.name}: {s.hrs}h ({s.pct}%)</span></div>)}
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#6a829e" }}>Avg: <span style={{ color: "#dce4ee", fontWeight: 700 }}>${weightedAvg.toFixed(4)}/kWh</span></div>
            </div>
          </div>
        </div>

        {/* ── 5. HOLIDAYS (collapsible) ── */}
        <div className="card">
          <div className="coll-hdr" onClick={() => setHolOpen(v => !v)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ca">{holOpen ? "▾" : "▸"}</span>
              <div className="lbl" style={{ marginBottom: 0 }}>Holidays</div>
              {!holOpen && <span style={{ fontSize: 11, color: "#4a6080" }}>{enabledCount} selected → <span style={{ color: holTier.color }}>{holTier.name}</span> rate (${holTier.rate.toFixed(4)}/kWh)</span>}
            </div>
            {holOpen && <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#4a6080" }}>Holiday rate:</span>
              <TierPicker tiers={tiers} value={holidayTier} onChange={setHolidayTier} />
            </div>}
          </div>

          {holOpen && <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12, padding: "8px 10px", background: "#0e162044", borderRadius: 6 }}>
              <div className={`chk ${holidayShift ? "on" : ""}`} onClick={() => setHolidayShift(v => !v)} style={{ marginTop: 1 }}>{holidayShift && <span style={{ color: "#fff", fontSize: 9 }}>✓</span>}</div>
              <div onClick={() => setHolidayShift(v => !v)} style={{ cursor: "pointer" }}>
                <div style={{ fontSize: 12 }}>Observe on nearest weekday</div>
                <div style={{ fontSize: 11, color: "#4a6080" }}>When a holiday falls on Saturday, it's observed Friday. Sunday → Monday.</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 20px", marginBottom: 8 }}>
              {STD_HOLIDAYS.map(h => {
                const on = enabledHolidays.has(h.id);
                return <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer" }}
                  onClick={() => setEnabledHolidays(p => { const n = new Set(p); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n; })}>
                  <div className={`chk ${on ? "on" : ""}`}>{on && <span style={{ color: "#fff", fontSize: 9 }}>✓</span>}</div>
                  <span style={{ fontSize: 12, color: on ? "#dce4ee" : "#4a6080", flex: 1 }}>{h.name}</span>
                  <span style={{ fontSize: 10, color: "#3a5068" }}>{h.when}</span>
                </div>;
              })}
            </div>
            {customHolidays.length > 0 && <div style={{ borderTop: "1px solid #1a2838", paddingTop: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#4a6080", fontWeight: 600, marginBottom: 4 }}>Custom</div>
              {customHolidays.map(h => <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span style={{ fontSize: 12, flex: 1 }}>{h.name}<span style={{ fontSize: 10, color: "#3a5068", marginLeft: 8 }}>{h.type === "fixed" ? `${MO[h.month - 1]} ${h.day}` : `${["1st", "2nd", "3rd", "4th", "Last"][h.n - 1]} ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][h.weekday]} in ${MO[h.month - 1]}`}</span></span>
                <button className="btn btn-s" style={{ padding: "1px 6px", color: "#4a6080" }} onClick={() => setCustomHolidays(p => p.filter(x => x.id !== h.id))}>✕</button>
              </div>)}
            </div>}
            {addingCustom ? <CustomHolidayForm onSave={addCustomHoliday} onCancel={() => setAddingCustom(false)} /> :
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <button className="btn btn-s" onClick={() => setAddingCustom(true)}>+ Custom Holiday</button>
                <a href="https://johnnysolarseed.com/holidays" target="_blank" rel="noopener" style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }}>Browse more ↗</a>
              </div>}
          </div>}
        </div>

        {/* ── 6. YAML ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="lbl" style={{ marginBottom: 0 }}>Configuration</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={`btn btn-s ${showYaml ? "on" : ""}`} onClick={() => setShowYaml(v => !v)}>{showYaml ? "Hide" : "Show"} YAML</button>
              {showYaml && <button className="btn btn-s" onClick={() => navigator.clipboard?.writeText(yaml)}>📋 Copy</button>}
            </div>
          </div>
          {showYaml && <div className="yaml" style={{ marginTop: 8 }}>{yaml}</div>}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "8px 0 16px", fontSize: 10, color: "#2a3a4e" }}>
          <a href="https://johnnysolarseed.com" target="_blank" rel="noopener" style={{ color: "#3a5068", textDecoration: "none" }}>☀ Johnny Solarseed</a>
          {" · "}
          <a href="https://github.com/throughline-tech/solarseed-tou" target="_blank" rel="noopener" style={{ color: "#3a5068", textDecoration: "none" }}>GitHub</a>
        </div>
      </div>

      {/* ── Tier Edit Modal ── */}
      {editTier && (() => { const t = tiers.find(x => x.id === editTier); if (!t) return null; return (
        <div className="modal-ov" onClick={() => setEditTier(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Edit Rate Tier</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><div className="lbl">Name</div><div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="color" value={t.color} onChange={e => updateTier(t.id, "color", e.target.value)} style={{ width: 32, height: 32, border: "none", borderRadius: 4, cursor: "pointer", padding: 0 }} />
                <input className="inp" value={t.name} onChange={e => updateTier(t.id, "name", e.target.value)} style={{ fontWeight: 600 }} />
              </div></div>
              <div><div className="lbl">Effective Rate ($/kWh)</div>
                <input className="inp" type="number" step="0.0001" min="0" value={t.rate} onChange={e => updateTier(t.id, "rate", e.target.value)} style={{ fontSize: 18, fontWeight: 700, padding: 10 }} />
                <div style={{ fontSize: 10, color: "#3a5068", marginTop: 2 }}>All-in cost including fees and taxes</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setEditTier(null)}>Done</button>
                {tiers.length > 1 && <button className="btn" style={{ color: "#ef4444" }} onClick={() => { removeTier(t.id); setEditTier(null); }}>Delete</button>}
              </div>
            </div>
          </div>
        </div>
      ); })()}
    </div>
  );
}

function TierPicker({ tiers, value, onChange }) {
  const [open, setOpen] = useState(false);
  const t = tiers.find(x => x.id === value) || tiers[0];
  return (
    <div className="td-wrap">
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, border: "1px solid #253446", background: "#0e1620", cursor: "pointer" }} onClick={() => setOpen(v => !v)}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</span>
        <span style={{ fontSize: 10, color: "#4a6080" }}>${t.rate.toFixed(4)}</span>
        <span style={{ fontSize: 10, color: "#4a6080" }}>▾</span>
      </div>
      {open && <><div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
        <div className="td">{tiers.map(o => <div key={o.id} className="td-opt" onClick={() => { onChange(o.id); setOpen(false); }} style={{ background: o.id === value ? "#253446" : "transparent" }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: o.color }} /><span style={{ fontWeight: 500 }}>{o.name}</span><span style={{ fontSize: 10, color: "#4a6080", marginLeft: "auto" }}>${o.rate.toFixed(4)}</span>
        </div>)}</div></>}
    </div>
  );
}

function CustomHolidayForm({ onSave, onCancel }) {
  const [name, setName] = useState(""); const [type, setType] = useState("fixed"); const [month, setMonth] = useState(1); const [day, setDay] = useState(1); const [weekday, setWeekday] = useState(1); const [n, setN] = useState(1);
  const W = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <div style={{ background: "#0e1620", border: "1px solid #253446", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Holiday name" style={{ fontWeight: 600 }} autoFocus />
      <div style={{ display: "flex", gap: 6 }}>
        <button className={`btn btn-s ${type === "fixed" ? "on" : ""}`} onClick={() => setType("fixed")}>Specific date</button>
        <button className={`btn btn-s ${type === "nth" ? "on" : ""}`} onClick={() => setType("nth")}>Nth weekday of month</button>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {type === "fixed" ? <><select className="inp" value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 100 }}>{MO.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select><input className="inp" type="number" min="1" max="31" value={day} onChange={e => setDay(+e.target.value || 1)} style={{ width: 60 }} /></> :
          <><select className="inp" value={n} onChange={e => setN(+e.target.value)} style={{ width: 70 }}><option value={1}>1st</option><option value={2}>2nd</option><option value={3}>3rd</option><option value={4}>4th</option><option value={5}>Last</option></select>
            <select className="inp" value={weekday} onChange={e => setWeekday(+e.target.value)} style={{ width: 130 }}>{W.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
            <span style={{ fontSize: 12, color: "#4a6080" }}>of</span>
            <select className="inp" value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 100 }}>{MO.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></>}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn btn-s on" onClick={() => { if (name.trim()) onSave({ name, type, month, ...(type === "fixed" ? { day } : { weekday, n }) }); }} style={{ opacity: name.trim() ? 1 : 0.4 }}>Add</button>
        <button className="btn btn-s" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
