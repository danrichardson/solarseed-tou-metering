# Solarseed TOU Energy Metering — HACS Plugin Design Document

## Overview

A Home Assistant custom integration (HACS-installable) that tracks energy costs using time-of-use (TOU) rate schedules. HA's built-in Energy Dashboard tracks consumption but has no concept of rates that change by time of day, season, or holiday. This integration fills that gap.

**Repository:** `danrichardson/solarseed-tou-metering`

## Philosophy

- The plugin computes **effective $/kWh rates** at runtime using a formula: `(tier_rate + regulatory + passthrough + programs) × (1 + tax / 100)`
- Bill structure decomposition lives on johnnysolarseed.org as the Rate Calculator
- The calculator exports complete YAML; the user pastes it into the integration's Options flow
- The plugin does one thing well: multiply energy consumption by the right rate at the right time
- **No GUI panel** — all rate configuration is done via YAML from the website

## Architecture (v0.7.0)

```
solarseed-tou-metering/
├── custom_components/
│   └── solarseed_tou/
│       ├── __init__.py          # Integration setup, WebSocket API
│       ├── manifest.json        # HACS manifest
│       ├── config_flow.py       # Setup (sensor selection) + Options (YAML paste)
│       ├── const.py             # Constants, defaults, version
│       ├── sensor.py            # Cost sensors (rate, tier, fixed, cost accumulators)
│       ├── holiday.py           # Holiday pattern resolver
│       ├── schedule.py          # Rate schedule + formula engine
│       ├── storage.py           # Persistent config storage (.storage/)
│       ├── translations/
│       │   └── en.json
│       └── strings.json
├── tests/                       # Test suite
│   ├── test_schedule.py
│   ├── test_holiday.py
│   └── conftest.py
├── docs/
│   ├── YAML-CONTRACT.md         # Authoritative YAML format specification
│   ├── DEPLOY-PORTLAND.md       # Deployment guide
│   └── ALGORITHM_REVS.md       # Historical algorithm revision notes
├── hacs.json
├── README.md
└── LICENSE
```

## Data Model

### Configuration (stored in `.storage/solarseed_tou_config`)

```yaml
tou_metering:
  energy_sensor: "sensor.home_energy_total"

  tiers:
    off-peak:
      name: "Off-Peak"
      rate: 0.08339      # summed: usage + transmission + distribution + PCA
      color: "#22c55e"
    mid-peak:
      name: "Mid-Peak"
      rate: 0.09664
      color: "#f59e0b"
    on-peak:
      name: "On-Peak"
      rate: 0.15728
      color: "#ef4444"

  # Shared per-kWh adders (apply to all tiers equally)
  regulatory_per_kwh: 0.00241
  state_passthrough_per_kwh: 0.00484
  programs_per_kwh: 0.00365
  tax_rate_pct: 2.000
  fixed_monthly: 11.51

  seasons:
    all_year:
      months: [1,2,3,4,5,6,7,8,9,10,11,12]
      grid:
        mon: ["off-peak","off-peak", ... ]  # 24 entries per day
        # ...

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
```

### Rate Formula

```
effective_rate = (tier.rate + regulatory + passthrough + programs) × (1 + tax / 100)
```

See [YAML-CONTRACT.md](docs/YAML-CONTRACT.md) for the full specification.

### Runtime State (in-memory, persisted via RestoreEntity)

```python
{
  "cost_today": 3.42,
  "cost_this_week": 18.76,
  "cost_this_month": 67.23,
  "last_energy_reading": 27790.0,
  "last_update": "2026-02-18T14:30:00"
}
```

## Sensors Created

| Entity ID | Type | Description |
|-----------|------|-------------|
| `sensor.solarseed_tou_current_rate` | $/kWh | Effective rate (full formula) |
| `sensor.solarseed_tou_current_tier` | string | Name of active tier |
| `sensor.solarseed_tou_fixed_monthly` | $/mo | Fixed monthly charge |
| `sensor.solarseed_tou_cost_per_hour` | $/hr | Current cost rate (instantaneous) |
| `sensor.solarseed_tou_cost_today` | $ | Accumulated cost since midnight |
| `sensor.solarseed_tou_cost_this_week` | $ | Since Monday midnight |
| `sensor.solarseed_tou_cost_this_month` | $ | Since 1st of month midnight |

## Core Algorithm

```python
def get_rate(self, now: datetime) -> float:
    """Get effective $/kWh rate for a given datetime."""
    tier_id = self.get_tier_id(now)  # holiday check → season → grid → tier
    return self.compute_effective_rate(tier_id)

def compute_effective_rate(self, tier_id: str) -> float:
    """Full YAML-contract formula."""
    tier = self.tiers[tier_id]
    base = (tier.rate
            + self.regulatory_per_kwh
            + self.state_passthrough_per_kwh
            + self.programs_per_kwh)
    return base * (1.0 + self.tax_rate_pct / 100.0)
```

## Config Flow

### Step 1: Initial Setup
- Select energy sensor entity (entity picker, filter to `sensor` domain)
- That's it — rate configuration is done via Options flow YAML paste

### Options Flow
- Change energy sensor
- Paste YAML from the website calculator
- YAML is validated, parsed, and stored immediately

## WebSocket API

Two commands are registered for external tooling / debugging:

```python
# Read current config
{"type": "solarseed_tou/get_config"}

# Write new config (validates before saving)
{"type": "solarseed_tou/set_config", "config": {...}}
```

## Edge Cases

### Midnight Rollover
- At midnight, reset `cost_today` to 0
- On Monday midnight, reset `cost_this_week` to 0
- On 1st of month midnight, reset `cost_this_month` to 0

### Energy Sensor Unavailable
- If sensor goes unavailable, stop accumulating
- When it comes back, use the new reading as the baseline
- For power sensors, clear the timestamp to avoid huge gap accumulation

### Meter Reset
- If new reading < last reading, skip the negative delta
- Set new baseline without accumulating

### RestoreEntity
- All cost accumulators survive HA restarts
- On startup, restore last known values; reset if period boundary has passed

### Storage Migration (v1 → v2)
- v1 configs had only `rate` per tier; v2 adds formula fields
- Migration sets all adders to 0 so existing rates are used as-is
- Users should re-export from the calculator to get full formula breakdown

## HACS Configuration

### hacs.json
```json
{
  "name": "Solarseed TOU Energy Metering",
  "render_readme": true,
  "homeassistant": "2024.1.0"
}
```

## Reference

- **YAML Contract:** [docs/YAML-CONTRACT.md](docs/YAML-CONTRACT.md) — authoritative interface spec
- **Rate Calculator:** https://johnnysolarseed.org/tou-calculator
- **HA WebSocket API:** https://developers.home-assistant.io/docs/api/websocket
