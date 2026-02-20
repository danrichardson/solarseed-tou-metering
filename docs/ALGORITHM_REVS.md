# Solarseed TOU HA Plugin — Implementation Plan

## Context

The Solarseed TOU Energy Metering plugin is a Home Assistant custom integration (HACS-installable) that tracks energy costs by applying the correct rate at the correct time. The user configures their TOU schedule (which hours are off-peak, mid-peak, on-peak) and their rates, and the plugin creates sensors for current cost rate, cost today, cost this month, etc.

We're updating the rate model from a single "effective rate" per tier to a **volumetric rate + fixed cost** model. The user calculates their rates on the JSS website Rate Calculator, then enters the resulting numbers here.

**Repository:** `throughline-tech/solarseed-tou`
 **Frontend:** Lit-based custom panel (registered as a sidebar panel in HA)
 **Backend:** Python integration with coordinator pattern, WebSocket API, JSON storage

------

## New Rate Model

### Old Model

```
tier_config = {
  "off-peak": { rate: 0.1598 },   // single "effective" rate
  "mid-peak": { rate: 0.2414 },
  "on-peak":  { rate: 0.5189 }
}

cost = kWh × tier_rate
```

### New Model

```
tier_config = {
  "off-peak": { volumetric_rate: 0.10022 },
  "mid-peak": { volumetric_rate: 0.17932 },
  "on-peak":  { volumetric_rate: 0.44829 }
}

fixed_monthly_cost = 23.04  // single number, $/month

// Cost calculations:
instantaneous_cost_per_hour = (watts / 1000 × current_tier_volumetric_rate)
                            + (fixed_monthly_cost / days_in_month / 24)

daily_cost = sum_of_hourly_volumetric_costs + (fixed_monthly_cost / days_in_month)

monthly_cost = sum_of_daily_volumetric_costs + fixed_monthly_cost
```

### Key Formulas

```python
import calendar

def instantaneous_cost_rate(watts: float, tier_rate: float,
                             fixed_monthly: float, days_in_month: int) -> float:
    """Returns $/hour at the current consumption rate."""
    volumetric_per_hour = (watts / 1000) * tier_rate
    fixed_per_hour = fixed_monthly / days_in_month / 24
    return volumetric_per_hour + fixed_per_hour

def daily_fixed_cost(fixed_monthly: float, days_in_month: int) -> float:
    """Returns the fixed cost allocated to one day."""
    return fixed_monthly / days_in_month

def monthly_cost(volumetric_accumulated: float, fixed_monthly: float) -> float:
    """Returns estimated total monthly cost."""
    return volumetric_accumulated + fixed_monthly

def effective_rate(total_cost: float, total_kwh: float) -> float:
    """Returns the blended effective $/kWh including fixed cost amortization."""
    if total_kwh <= 0:
        return 0.0
    return total_cost / total_kwh
```

------

## Task 1: Update Config Schema and Storage

### File: `const.py`

Update the default tier structure to use `volumetric_rate` instead of `rate`, and add `fixed_monthly_cost`:

```python
# Old defaults
DEFAULT_TIERS = {
    "off-peak": {"name": "Off-Peak", "rate": 0.10, "color": "#22c55e"},
    "on-peak": {"name": "On-Peak", "rate": 0.18, "color": "#ef4444"},
}

# New defaults (PGE Schedule 7)
DEFAULT_TIERS = {
    "off-peak":  {"name": "Off-Peak",  "volumetric_rate": 0.10022, "color": "#22c55e"},
    "mid-peak":  {"name": "Mid-Peak",  "volumetric_rate": 0.17932, "color": "#f59e0b"},
    "on-peak":   {"name": "On-Peak",   "volumetric_rate": 0.44829, "color": "#ef4444"},
}

DEFAULT_FIXED_MONTHLY_COST = 23.04

# Tier order matters — always ascending by cost
TIER_ORDER = ["off-peak", "mid-peak", "on-peak"]
```

### File: `storage.py`

Update the storage schema to include `fixed_monthly_cost` at the top level of the config. Add a migration path:

```python
STORAGE_VERSION = 2  # bump from 1

async def _migrate_v1_to_v2(config: dict) -> dict:
    """Migrate from single effective rate to volumetric + fixed model."""
    # If old config has 'rate' in tiers, rename to 'volumetric_rate'
    # and add a default fixed_monthly_cost
    for tier_id, tier_data in config.get("tiers", {}).items():
        if "rate" in tier_data and "volumetric_rate" not in tier_data:
            tier_data["volumetric_rate"] = tier_data.pop("rate")

    if "fixed_monthly_cost" not in config:
        config["fixed_monthly_cost"] = 0.0  # user needs to set this

    config["_schema_version"] = 2
    return config
```

When loading config, check `_schema_version` and run migrations if needed. If migrating from v1, log a persistent notification telling the user to update their rates using the JSS calculator.

### File: `config_flow.py`

No changes needed — the config flow only picks the energy sensor. Rate configuration happens in the panel.

------

## Task 2: Update the Coordinator and Cost Calculation

### File: `coordinator.py`

The coordinator runs periodically (every 1 minute recommended for power sensor, or on state change) and computes costs.

**Current logic (old):**

```python
cost_increment = kwh_delta * current_tier_rate
```

**New logic:**

```python
import calendar
from datetime import datetime

def _calculate_cost_increment(self, kwh_delta: float, tier_id: str,
                                now: datetime) -> dict:
    """Calculate cost for a kWh increment."""
    tier_rate = self._config["tiers"][tier_id]["volumetric_rate"]
    fixed_monthly = self._config.get("fixed_monthly_cost", 0.0)
    days_in_month = calendar.monthrange(now.year, now.month)[1]

    volumetric_cost = kwh_delta * tier_rate
    # Fixed cost is allocated proportionally to time elapsed
    # For a 1-minute update interval:
    fixed_cost_per_minute = fixed_monthly / days_in_month / 24 / 60

    return {
        "volumetric": volumetric_cost,
        "fixed": fixed_cost_per_minute,
        "total": volumetric_cost + fixed_cost_per_minute,
    }
```

**Important:** The fixed cost allocation ticks continuously regardless of energy consumption. Even if `kwh_delta` is 0, the fixed cost per minute still accumulates. This means the coordinator should always add the fixed increment on every update cycle, not only when energy is consumed.

Update the accumulator logic:

```python
async def _async_update_data(self):
    """Fetch new data and calculate costs."""
    now = dt_util.now()
    current_tier = self._get_current_tier(now)
    energy_reading = self._get_energy_reading()
    days_in_month = calendar.monthrange(now.year, now.month)[1]

    # Energy delta
    kwh_delta = 0.0
    if self._last_energy_reading is not None and energy_reading is not None:
        delta = energy_reading - self._last_energy_reading
        if delta >= 0:  # ignore meter resets
            kwh_delta = delta

    # Volumetric cost
    tier_rate = self._config["tiers"][current_tier]["volumetric_rate"]
    volumetric_increment = kwh_delta * tier_rate

    # Fixed cost (time-based, always ticking)
    fixed_monthly = self._config.get("fixed_monthly_cost", 0.0)
    if self._last_update_time is not None:
        elapsed_seconds = (now - self._last_update_time).total_seconds()
        seconds_in_month = days_in_month * 24 * 3600
        fixed_increment = fixed_monthly * (elapsed_seconds / seconds_in_month)
    else:
        fixed_increment = 0.0

    total_increment = volumetric_increment + fixed_increment

    # Accumulate
    self._cost_today_volumetric += volumetric_increment
    self._cost_today_fixed += fixed_increment
    self._cost_today_total += total_increment
    # ... same for week, month accumulators

    # Instantaneous rate ($/hr)
    if self._current_power_watts is not None:
        self._instantaneous_cost_per_hour = (
            (self._current_power_watts / 1000) * tier_rate
            + fixed_monthly / days_in_month / 24
        )

    # Update bookkeeping
    self._last_energy_reading = energy_reading
    self._last_update_time = now

    return self._build_sensor_data()
```

------

## Task 3: Update Sensors

### File: `sensor.py`

Update existing sensors and add new ones. The sensor set should be:

| Sensor                  | Entity ID                                    | Unit  | Description                                      |
| ----------------------- | -------------------------------------------- | ----- | ------------------------------------------------ |
| Current Tier            | `sensor.solarseed_tou_current_tier`          | —     | "Off-Peak", "Mid-Peak", "On-Peak"                |
| Current Volumetric Rate | `sensor.solarseed_tou_current_rate`          | $/kWh | Volumetric rate for current tier                 |
| Instantaneous Cost      | `sensor.solarseed_tou_cost_per_hour`         | $/hr  | Current cost rate including fixed allocation     |
| Cost Today              | `sensor.solarseed_tou_cost_today`            | $     | Accumulated total cost today                     |
| Cost Today (Volumetric) | `sensor.solarseed_tou_cost_today_volumetric` | $     | Volumetric portion only                          |
| Cost Today (Fixed)      | `sensor.solarseed_tou_cost_today_fixed`      | $     | Fixed portion allocated today                    |
| Cost This Month         | `sensor.solarseed_tou_cost_month`            | $     | Accumulated total cost this month                |
| Monthly Fixed Cost      | `sensor.solarseed_tou_fixed_monthly`         | $/mo  | The configured fixed cost (static)               |
| Effective Rate          | `sensor.solarseed_tou_effective_rate`        | $/kWh | Blended rate (total cost / total kWh this month) |

**Key sensor: `cost_per_hour` (Instantaneous Cost)**

This is the "you're spending $2.23/hr right now" sensor. It updates every coordinator cycle:

```python
class SolarseedInstantaneousCostSensor(SolarseedBaseSensor):
    """Sensor showing current cost rate in $/hr."""

    _attr_name = "TOU Cost Per Hour"
    _attr_native_unit_of_measurement = "$/hr"
    _attr_suggested_display_precision = 2
    _attr_icon = "mdi:cash-clock"

    @property
    def native_value(self):
        return self.coordinator.data.get("instantaneous_cost_per_hour")

    @property
    def extra_state_attributes(self):
        return {
            "current_tier": self.coordinator.data.get("current_tier"),
            "volumetric_component": self.coordinator.data.get("instantaneous_volumetric_per_hour"),
            "fixed_component": self.coordinator.data.get("instantaneous_fixed_per_hour"),
            "current_watts": self.coordinator.data.get("current_power_watts"),
        }
```

**Effective Rate sensor:**

This sensor shows the blended $/kWh including fixed cost amortization. It's useful for comparing against the old single-rate model:

```python
@property
def native_value(self):
    total_cost = self.coordinator.data.get("cost_month_total", 0)
    total_kwh = self.coordinator.data.get("kwh_month", 0)
    if total_kwh > 0:
        return round(total_cost / total_kwh, 4)
    return None
```

### RestoreEntity Updates

All cost accumulator sensors must extend `RestoreEntity`. On restore:

- Check if the restored data is from the current day/month
- If from a previous day, reset daily accumulators to 0
- If from a previous month, reset monthly accumulators to 0
- Restore the fixed cost accumulated so far (important — don't lose partial-day fixed allocation)

------

## Task 4: Update the Frontend Panel

### File: Frontend Lit component (panel)

#### 4a: Rate Input Section

Replace the current single-rate input per tier with the new model. In the tier configuration area (where users currently double-click to edit a rate), change the edit dialog to:

```
Edit Off-Peak Rate
┌─────────────────────────────────────────┐
│ Volumetric Rate: $[0.10022] /kWh        │
│                                         │
│ ⓘ Calculate this at                     │
│   johnnysolarseed.com/rate-calculator    │
└─────────────────────────────────────────┘
[Save]  [Cancel]
```

The user enters ONE number per tier (the pre-calculated volumetric rate from the JSS calculator). They should NOT need to enter the 4 sub-components here — that's the website's job.

#### 4b: Fixed Monthly Cost Input

Add a new input field in the config panel, above or near the rate tier section:

```
MONTHLY FIXED COST
$[23.04] /month
ⓘ Includes basic charge, regulatory fees, taxes.
  Calculate at johnnysolarseed.com/rate-calculator
```

This is a single input field. It should be prominent since it's a required configuration value.

#### 4c: Update the Paint Toolbar Rate Display

The paint toolbar currently shows: `■ Off-Peak $0.1598`

Change to show the volumetric rate with units: `■ Off-Peak $0.10022/kWh`

#### 4d: Update the Summary Stats

At the bottom of the grid, add or update the effective rate calculation display:

```
Off-Peak: 93h (55%) · Mid-Peak: 50h (30%) · On-Peak: 25h (15%)
Avg volumetric: $0.1542/kWh · Fixed: $23.04/mo · Avg effective: $0.2157/kWh (at 400 kWh/mo)
```

The "at X kWh/mo" part could use the user's actual monthly consumption if available from the energy sensor, or a configurable estimate.

#### 4e: Sensor Type Label Fix

The Energy Sensor row currently shows "kWh sensor". Fix this to:

- Auto-detect the sensor's `unit_of_measurement` attribute
- Display "W sensor (power)" or "kWh sensor (energy)" accordingly
- The plugin should accept EITHER type:
  - **W sensor:** Used for instantaneous cost display; integrate over time for kWh
  - **kWh sensor:** Used for accumulated cost; differentiate for instantaneous power estimate
- If the sensor type doesn't match expectations, show a warning but don't block configuration

------

## Task 5: WebSocket API Updates

### File: `__init__.py` (or dedicated `websocket.py`)

Update the WebSocket API to handle the new config fields:

```python
@websocket_api.websocket_command({
    vol.Required("type"): "solarseed_tou/set_config",
    vol.Required("config"): {
        vol.Optional("tiers"): {
            str: {
                vol.Required("name"): str,
                vol.Required("volumetric_rate"): vol.Coerce(float),
                vol.Required("color"): str,
            }
        },
        vol.Optional("fixed_monthly_cost"): vol.Coerce(float),
        vol.Optional("seasons"): dict,
        vol.Optional("holidays"): dict,
        vol.Optional("settings"): dict,
    }
})
async def ws_set_config(hass, connection, msg):
    """Update TOU configuration."""
    # Validate rates are positive
    config = msg["config"]
    if "tiers" in config:
        for tier_id, tier in config["tiers"].items():
            if tier["volumetric_rate"] < 0:
                connection.send_error(msg["id"], "invalid_rate",
                    f"Rate for {tier['name']} cannot be negative")
                return

    if "fixed_monthly_cost" in config:
        if config["fixed_monthly_cost"] < 0:
            connection.send_error(msg["id"], "invalid_fixed_cost",
                "Fixed monthly cost cannot be negative")
            return

    # Store and notify coordinator
    await storage.async_save(config)
    coordinator.async_set_updated_data(config)
    connection.send_result(msg["id"], {"success": True})
```

------

## Task 6: GUI Improvements (from review)

These are the visual/UX fixes from the GUI review document. Implement alongside the rate model changes:

### Priority 1 (do with rate model update):

1. **Tier ordering** — Always display Off-Peak → Mid-Peak → On-Peak (ascending cost)
2. **Rate labels include /kWh** — All rate displays show units
3. **Solarseed title links to JSS** — Make "Solarseed" in the header a link to johnnysolarseed.com
4. **Rate calculator button links to JSS calculator** — The "Rate calculator ↗" button opens the JSS rate calculator page

### Priority 2 (accessibility, high impact):

1. **Fix grey-on-dark-grey contrast** — Increase all secondary text to WCAG AA (4.5:1). Affected elements: helper text, instruction text, grid labels, holiday descriptions. Use HA theme variable `--secondary-text-color` where possible, or minimum `#9ca3af` (gray-400) on dark backgrounds.
2. **Hour label left-justification** — Align hour labels to left edge of grid cells
3. **12/24 hour toggle** — Add toggle near grid, persist preference, default to HA user's time format

### Priority 3 (polish):

1. **Holiday layout** — Restructure to consistent 3-column grid (checkbox | name | date) or responsive card layout
2. **Colorblind-safe palette** — Add subtle patterns or switch to blue/orange/magenta scheme
3. **Paint mode discoverability** — Active mode indicator, labeled "+" button, cursor change
4. **Section grouping** — Subtle card boundaries between Energy Sensor / Seasons / Grid / Holidays
5. **Month selector affordances** — Visual differentiation for assigned vs unassigned months

------

## Migration & Backwards Compatibility

### Scenario: User upgrades plugin with existing v1 config

1. On first load after upgrade, `storage.py` detects `_schema_version` is missing or == 1

2. Runs `_migrate_v1_to_v2`:

   - Renames `rate` → `volumetric_rate` in each tier
   - Sets `fixed_monthly_cost` to `0.0`

3. Creates a persistent HA notification:

   ```
   Solarseed TOU: Rate model updatedYour rates have been migrated to the new volumetric + fixed cost model.Your current rates are preserved as volumetric rates, but your fixedmonthly cost is set to $0.00. Visit johnnysolarseed.com/rate-calculatorto calculate your actual rates and fixed cost, then update your config.
   ```

4. The plugin continues to work — with `fixed_monthly_cost = 0`, it behaves identically to the old model (volumetric only). The user updates at their convenience.

### Scenario: New user installs plugin

1. Config flow selects energy sensor
2. Default config uses PGE Schedule 7 values (including $23.04 fixed cost)
3. User is directed to JSS calculator to compute their actual rates

------

## Testing Checklist

### Unit Tests

```python
def test_instantaneous_cost_on_peak():
    """5kW during on-peak with $23.04/mo fixed, 30-day month."""
    result = instantaneous_cost_rate(
        watts=5000,
        tier_rate=0.44829,
        fixed_monthly=23.04,
        days_in_month=30
    )
    # (5000/1000 * 0.44829) + (23.04 / 30 / 24)
    # = 2.24145 + 0.032
    # = 2.27345
    assert abs(result - 2.27345) < 0.001

def test_instantaneous_cost_zero_watts():
    """Even at 0W, fixed cost still ticks."""
    result = instantaneous_cost_rate(
        watts=0,
        tier_rate=0.10022,
        fixed_monthly=23.04,
        days_in_month=30
    )
    # 0 + (23.04 / 30 / 24) = 0.032
    assert abs(result - 0.032) < 0.001

def test_daily_cost_accumulation():
    """Simulate a day with mixed tier usage."""
    # 10 kWh off-peak, 5 kWh mid-peak, 2 kWh on-peak
    # 30-day month
    volumetric = (10 * 0.10022) + (5 * 0.17932) + (2 * 0.44829)
    # = 1.0022 + 0.8966 + 0.89658 = 2.79538
    fixed_daily = 23.04 / 30  # = 0.768
    total = volumetric + fixed_daily  # = 3.56338
    assert abs(total - 3.563) < 0.01

def test_monthly_bill_estimate():
    """Cross-check against PGE Bill 1."""
    # Bill 1: 320 off-peak, 38 mid-peak, 16 on-peak = 374 kWh
    volumetric = (320 * 0.10022) + (38 * 0.17932) + (16 * 0.44829)
    # = 32.0704 + 6.81416 + 7.17264 = 46.057
    fixed = 23.04
    total = volumetric + fixed  # = 69.097
    # Actual bill: $68.15
    # Difference is ~$0.95 (1.4%) — within expected range
    # (GFC kWh discrepancy accounts for the remainder)
    assert abs(total - 68.15) < 2.00  # within $2

def test_effective_rate_high_usage():
    """Higher usage should yield lower effective rate."""
    rate_low = (46.057 + 23.04) / 374   # = 0.1847
    rate_high = (92.114 + 23.04) / 748  # = 0.1540
    assert rate_high < rate_low

def test_migration_v1_to_v2():
    """Old config with 'rate' key should migrate to 'volumetric_rate'."""
    old_config = {
        "tiers": {
            "off-peak": {"name": "Off-Peak", "rate": 0.1598, "color": "#22c55e"},
        }
    }
    new_config = migrate_v1_to_v2(old_config)
    assert "volumetric_rate" in new_config["tiers"]["off-peak"]
    assert "rate" not in new_config["tiers"]["off-peak"]
    assert new_config["fixed_monthly_cost"] == 0.0
```

### Integration Tests

1. **Config migration** — Install v2 over v1 config, verify migration runs and sensors work
2. **Midnight rollover** — Verify daily cost resets at midnight, monthly at 1st of month
3. **Fixed cost accumulation** — Run for 24 hours with 0 energy consumption, verify fixed cost = `fixed_monthly / days_in_month`
4. **Sensor restore** — Restart HA mid-day, verify cost accumulators restore correctly
5. **Rate change mid-day** — User updates rates at 2pm, verify new rates apply from that point forward (don't retroactively recalculate)
6. **W vs kWh sensor** — Test with both sensor types, verify instantaneous and accumulated costs work for each

------

## Summary: What the User Configures

After both projects are updated, the user's workflow is:

1. **Go to johnnysolarseed.com/rate-calculator**
2. **Enter their bill line items** (or load a PGE preset)
3. **Get 4 numbers** (3 volumetric rates + 1 fixed cost) — or 2 for standard rate
4. **Copy to HA plugin** — enter each number in the Solarseed TOU panel
5. **Done** — sensors start tracking with accurate cost decomposition

The HA plugin stays simple: it stores N rates + 1 fixed cost and does multiplication. The website handles the complexity of bill decomposition.