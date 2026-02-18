# Solarseed TOU Energy Metering — HACS Plugin Design Document

## Overview

A Home Assistant custom integration (HACS-installable) that tracks energy costs using time-of-use (TOU) rate schedules. HA's built-in Energy Dashboard tracks consumption but has no concept of rates that change by time of day, season, or holiday. This integration fills that gap.

**Repository:** `throughline-tech/solarseed-tou`
**Related:** [Solarseed Peak Shaver](https://github.com/throughline-tech/ha-solarseed-peak-shaver) (existing HACS integration)

## Philosophy

- The plugin stores **effective $/kWh rates** — the all-in cost after fees and taxes
- Bill structure decomposition (transmission charges, regulatory fees, taxes) lives on johnnysolarseed.org as a separate web calculator
- The user does the math once, enters the resulting numbers here
- The plugin does one thing well: multiply energy consumption by the right rate at the right time

## Architecture

```
solarseed-tou/
├── custom_components/
│   └── solarseed_tou/
│       ├── __init__.py          # Integration setup, register panel
│       ├── manifest.json        # HACS manifest
│       ├── config_flow.py       # Initial setup (energy sensor selection)
│       ├── const.py             # Constants, defaults
│       ├── coordinator.py       # Data update coordinator
│       ├── sensor.py            # Cost sensors (current rate, cost today, etc.)
│       ├── holiday.py           # Holiday pattern resolver
│       ├── schedule.py          # Rate schedule logic (season → grid → tier → rate)
│       ├── storage.py           # Persistent config storage (.storage/)
│       ├── frontend/            # Custom panel (Lit web components)
│       │   ├── panel.js         # Main panel entry point
│       │   ├── grid-editor.js   # Rate grid painter component
│       │   ├── season-bar.js    # Month/season painter component
│       │   ├── tier-picker.js   # Tier selection/editing component
│       │   ├── holiday-config.js# Holiday configuration component
│       │   └── styles.js        # Shared styles
│       ├── translations/
│       │   └── en.json
│       └── strings.json
├── hacs.json
├── README.md
└── LICENSE
```

## Data Model

### Configuration (stored in `.storage/solarseed_tou`)

```yaml
tou_metering:
  energy_sensor: "sensor.home_energy_total"

  tiers:
    off-peak:
      name: "Off-Peak"
      rate: 0.1042    # effective $/kWh
      color: "#22c55e"
    on-peak:
      name: "On-Peak"
      rate: 0.1827
      color: "#ef4444"

  seasons:
    all_year:
      months: [1,2,3,4,5,6,7,8,9,10,11,12]
      grid:
        mon: ["off-peak","off-peak", ... ]  # 24 entries per day
        tue: [...]
        wed: [...]
        thu: [...]
        fri: [...]
        sat: [...]
        sun: [...]

  holidays:
    rate_tier: "off-peak"
    observe_nearest_weekday: true
    standard:
      - "new_years"
      - "memorial"
      - "independence"
      - "labor"
      - "thanksgiving"
      - "christmas"
    custom:
      - name: "Company Holiday"
        type: "fixed"
        month: 12
        day: 24
```

### Runtime State (in-memory, persisted via RestoreEntity)

```python
{
  "cost_today": 3.42,         # accumulated cost since midnight
  "cost_this_week": 18.76,    # accumulated cost since Monday
  "cost_this_month": 67.23,   # accumulated cost since 1st of month
  "last_energy_reading": 27790.0,  # last kWh value from sensor
  "last_update": "2025-02-18T14:30:00"
}
```

## Sensors Created

| Entity ID | Type | Description |
|-----------|------|-------------|
| `sensor.solarseed_tou_current_rate` | $/kWh | Active rate tier for this moment |
| `sensor.solarseed_tou_current_tier` | string | Name of active tier (e.g., "On-Peak") |
| `sensor.solarseed_tou_cost_today` | $ | Accumulated cost since midnight |
| `sensor.solarseed_tou_cost_this_week` | $ | Since Monday midnight |
| `sensor.solarseed_tou_cost_this_month` | $ | Since 1st of month midnight |
| `sensor.solarseed_tou_cost_hourly` | $/hr | Current cost rate (instantaneous) |

### Sensor Attributes

`sensor.solarseed_tou_current_rate` attributes:
- `tier_id`: "on-peak"
- `tier_name`: "On-Peak"
- `tier_color`: "#ef4444"
- `season`: "Summer"
- `is_holiday`: false
- `next_rate_change`: "2025-02-18T20:00:00"
- `next_tier`: "Off-Peak"

## Core Algorithm

```python
def calculate_cost(self, new_energy_kwh: float, now: datetime) -> float:
    """Called every time the energy sensor updates."""

    # 1. Calculate energy delta
    delta_kwh = new_energy_kwh - self._last_energy_reading
    if delta_kwh <= 0:
        return 0.0  # meter reset or no change

    # 2. Determine if today is a holiday
    if self._is_holiday(now.date()):
        tier_id = self._config.holidays.rate_tier
    else:
        # 3. Find active season from current month
        season = self._get_season(now.month)

        # 4. Get day-of-week row from season grid
        day_index = now.weekday()  # 0=Mon, 6=Sun
        day_grid = season.grid[day_index]

        # 5. Index by current hour to get tier
        tier_id = day_grid[now.hour]

    # 6. Look up rate
    rate = self._config.tiers[tier_id].rate

    # 7. Calculate cost
    cost = delta_kwh * rate

    # 8. Accumulate
    self._cost_today += cost
    self._cost_this_week += cost
    self._cost_this_month += cost

    # 9. Update last reading
    self._last_energy_reading = new_energy_kwh

    return cost
```

## Holiday Resolution

The holiday engine resolves patterns at startup and when the year changes.

```python
HOLIDAY_RULES = {
    "new_years":    {"rule": "fixed", "month": 1, "day": 1},
    "mlk":          {"rule": "nth",   "month": 1, "weekday": 0, "n": 3},  # 3rd Monday
    "presidents":   {"rule": "nth",   "month": 2, "weekday": 0, "n": 3},
    "memorial":     {"rule": "last",  "month": 5, "weekday": 0},          # Last Monday
    "juneteenth":   {"rule": "fixed", "month": 6, "day": 19},
    "independence": {"rule": "fixed", "month": 7, "day": 4},
    "labor":        {"rule": "nth",   "month": 9, "weekday": 0, "n": 1},
    "columbus":     {"rule": "nth",   "month": 10, "weekday": 0, "n": 2},
    "veterans":     {"rule": "fixed", "month": 11, "day": 11},
    "thanksgiving": {"rule": "nth",   "month": 11, "weekday": 3, "n": 4}, # 4th Thursday
    "christmas":    {"rule": "fixed", "month": 12, "day": 25},
}
```

When `observe_nearest_weekday` is true:
- If resolved date falls on Saturday → observed on Friday
- If resolved date falls on Sunday → observed on Monday

Custom holidays use the same resolution engine with either `fixed` (month + day) or `nth` (n-th weekday of month) rules.

## Frontend Panel

The configuration UI is a custom HA panel built with Lit web components (HA's standard framework). It registers at `/solarseed-tou/config` and is accessible from the sidebar.

### Panel Registration (in `__init__.py`)

```python
async def async_setup(hass, config):
    hass.http.register_static_path(
        "/solarseed-tou/frontend",
        hass.config.path("custom_components/solarseed_tou/frontend"),
        cache_headers=False,
    )
    hass.components.frontend.async_register_built_in_panel(
        "custom",
        sidebar_title="TOU Metering",
        sidebar_icon="mdi:lightning-bolt",
        frontend_url_path="solarseed-tou",
        config={"_panel_custom": {
            "name": "solarseed-tou-panel",
            "module_url": "/solarseed-tou/frontend/panel.js",
        }},
        require_admin=True,
    )
```

### Panel Components

The React prototype (v5) maps to Lit components:

| React Component | Lit Component | File |
|----------------|--------------|------|
| Energy sensor input | `<solarseed-sensor-picker>` | `sensor-picker.js` |
| Season tags + month bar | `<solarseed-season-bar>` | `season-bar.js` |
| Tier toolbar | `<solarseed-tier-bar>` | `tier-bar.js` |
| Rate grid | `<solarseed-grid-editor>` | `grid-editor.js` |
| Holidays section | `<solarseed-holidays>` | `holiday-config.js` |
| YAML export | `<solarseed-yaml-export>` | `yaml-export.js` |

### Data Flow

1. Panel loads config from HA via WebSocket API
2. User edits config in the panel
3. Panel sends updated config to HA via WebSocket
4. Integration validates and stores config
5. Coordinator picks up new config and recalculates

### WebSocket API

```python
# Register WebSocket commands
@websocket_api.websocket_command({vol.Required("type"): "solarseed_tou/get_config"})
async def ws_get_config(hass, connection, msg):
    """Return current TOU configuration."""

@websocket_api.websocket_command({vol.Required("type"): "solarseed_tou/set_config"})
async def ws_set_config(hass, connection, msg):
    """Update TOU configuration."""
```

## Edge Cases

### Midnight Rollover
- At midnight, reset `cost_today` to 0
- On Monday midnight, reset `cost_this_week` to 0
- On 1st of month midnight, reset `cost_this_month` to 0
- These resets happen in the coordinator's periodic update

### DST Transitions
- Spring forward: hour 2 doesn't exist — grid skips from 1→3
- Fall back: hour 1 repeats — charge the rate for hour 1 both times
- Use `datetime` with timezone awareness throughout

### Energy Sensor Unavailable
- If sensor goes unavailable, stop accumulating
- When it comes back, use the new reading as the baseline (don't try to backfill)
- Log a warning about the gap

### Meter Reset
- If new reading < last reading, assume meter reset
- Set new baseline without accumulating the negative delta
- Log an info message

### RestoreEntity
- All cost accumulators use `RestoreEntity` to survive HA restarts
- On startup, restore last known values and last energy reading
- If restore data is from a previous day/week/month, reset appropriately

## Config Flow

### Step 1: Initial Setup
- Select energy sensor entity (entity picker, filter to `sensor` domain with `energy` device class)
- That's it — the rest is configured in the panel

### Options Flow
- Link to open the custom panel for full configuration
- Quick toggle to enable/disable the integration

## HACS Configuration

### hacs.json
```json
{
  "name": "Solarseed TOU Energy Metering",
  "render_readme": true,
  "homeassistant": "2024.1.0"
}
```

### manifest.json
```json
{
  "domain": "solarseed_tou",
  "name": "Solarseed TOU Energy Metering",
  "version": "0.1.0",
  "codeowners": ["@throughline-tech"],
  "config_flow": true,
  "documentation": "https://johnnysolarseed.org/tou",
  "iot_class": "local_polling",
  "issue_tracker": "https://github.com/throughline-tech/solarseed-tou/issues",
  "requirements": []
}
```

## Development Plan

### Phase 1: MVP (target: working prototype)
1. Repo scaffold with manifest, hacs.json, README
2. Config flow — energy sensor picker
3. Core schedule engine (schedule.py, holiday.py)
4. Cost accumulation sensors with RestoreEntity
5. Basic options flow (YAML paste for initial config)
6. Test with actual PGE bill data

### Phase 2: Panel UI
1. Lit component scaffold
2. Grid editor (drag-to-paint)
3. Tier management (add/edit/delete)
4. Season/month painter
5. Holiday configuration
6. WebSocket API for config CRUD

### Phase 3: Polish
1. Energy Dashboard integration (if possible)
2. Lovelace card for current rate display
3. Automations — trigger on rate tier change
4. Statistics — long-term cost history
5. Multi-meter support (multiple energy sensors)

## Reference

- **UI Prototype:** `tou-plugin-v5.jsx` (React, for reference only — actual panel is Lit)
- **Previous integration:** Solarseed Peak Shaver (same repo structure patterns)
- **HA Panel docs:** https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources
- **Lit framework:** https://lit.dev/
- **HA WebSocket API:** https://developers.home-assistant.io/docs/api/websocket
