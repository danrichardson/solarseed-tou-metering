# Deploying Solarseed TOU to Portland HA Instance

## Prerequisites

- Home Assistant **2024.1.0** or newer
- An energy sensor entity (kWh) or power sensor (W) already configured (e.g., from an Emporia Vue, Sense, or utility meter helper)
- SSH or Samba access to your HA instance
- Your Portland General Electric (PGE) or Pacific Power rate schedule — use [johnnysolarseed.org/tou-calculator](https://johnnysolarseed.org/tou-calculator) to generate the YAML config

## Option A: Manual Install (recommended for testing)

### 1. Copy the integration files

From this repo on your dev machine, copy the `custom_components/solarseed_tou/` directory to your HA config folder.

**Via SCP/SSH:**
```bash
scp -r custom_components/solarseed_tou/ \
  your-user@portland-ha.local:/config/custom_components/solarseed_tou/
```

**Via Samba share:**
Copy `custom_components/solarseed_tou/` into `\\portland-ha.local\config\custom_components\solarseed_tou\`.

**Via VS Code Remote - SSH:**
If you have the Remote-SSH extension connected to your HA box, drag-and-drop or copy the folder directly.

The resulting structure on the HA instance should be:
```
/config/
  custom_components/
    solarseed_tou/
      __init__.py
      config_flow.py
      const.py
      holiday.py
      manifest.json
      schedule.py
      sensor.py
      storage.py
      strings.json
      translations/
        en.json
```

### 2. Restart Home Assistant

```
Settings → System → Restart
```

Or via SSH:
```bash
ha core restart
```

### 3. Add the integration

1. Go to **Settings → Devices & Services → + Add Integration**
2. Search for **"Solarseed TOU"**
3. Select your energy sensor (any `sensor` entity — supports kWh, Wh, W, kW)
4. Click **Submit**

This creates the integration with default PGE Schedule 7 tier rates.

### 4. Import your PGE rate schedule

1. Go to [johnnysolarseed.org/tou-calculator](https://johnnysolarseed.org/tou-calculator)
2. Walk through the 5-step process with your PGE bill
3. Copy the generated YAML
4. In HA, go to **Settings → Devices & Services → Solarseed TOU Energy Metering → Configure**
5. Paste the YAML into the text area

Example YAML for PGE Schedule 7 (residential TOU):
```yaml
tou_metering:
  energy_sensor: "sensor.home_energy_total"

  tiers:
    off-peak:
      name: "Off-Peak"
      rate: 0.08339
      color: "#22c55e"
    mid-peak:
      name: "Mid-Peak"
      rate: 0.09664
      color: "#f59e0b"
    on-peak:
      name: "On-Peak"
      rate: 0.15728
      color: "#ef4444"

  regulatory_per_kwh: 0.00241
  state_passthrough_per_kwh: 0.00484
  programs_per_kwh: 0.00365
  tax_rate_pct: 2.000
  fixed_monthly: 11.51

  seasons:
    all_year:
      months: [1,2,3,4,5,6,7,8,9,10,11,12]
      grid:
        mon: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","on-peak","on-peak","on-peak","on-peak","on-peak","off-peak","off-peak","off-peak","off-peak"]
        tue: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","on-peak","on-peak","on-peak","on-peak","on-peak","off-peak","off-peak","off-peak","off-peak"]
        wed: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","on-peak","on-peak","on-peak","on-peak","on-peak","off-peak","off-peak","off-peak","off-peak"]
        thu: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","on-peak","on-peak","on-peak","on-peak","on-peak","off-peak","off-peak","off-peak","off-peak"]
        fri: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","on-peak","on-peak","on-peak","on-peak","on-peak","off-peak","off-peak","off-peak","off-peak"]
        sat: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak"]
        sun: ["off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak","off-peak"]

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

> **Note:** The rates above are examples. Run your actual PGE bill through the [rate calculator](https://johnnysolarseed.org/tou-calculator) to get your actual values. PGE on-peak is typically 3–8 PM weekdays.

6. Click **Submit** — the integration validates the YAML, saves it, and immediately starts using the new schedule.

### 5. Verify sensors are working

Go to **Developer Tools → States** and search for `solarseed_tou`. You should see:

| Entity | What to check |
|--------|--------------|
| `sensor.solarseed_tou_current_rate` | Shows effective $/kWh (full formula, changes by hour) |
| `sensor.solarseed_tou_current_tier` | Shows "Off-Peak", "Mid-Peak", or "On-Peak" |
| `sensor.solarseed_tou_fixed_monthly` | Shows the fixed monthly charge |
| `sensor.solarseed_tou_cost_per_hour` | Instantaneous cost rate |
| `sensor.solarseed_tou_cost_today` | Accumulates from midnight |
| `sensor.solarseed_tou_cost_this_week` | Accumulates from Monday |
| `sensor.solarseed_tou_cost_this_month` | Accumulates from 1st |

Check the attributes on `current_rate` — you should see `tier_id`, `tier_name`, `tier_color`, `tier_base_rate`, `regulatory_per_kwh`, `state_passthrough_per_kwh`, `programs_per_kwh`, `tax_rate_pct`, `fixed_monthly`, `is_holiday`, `next_rate_change`, and `next_tier`.

### 6. Set your timezone

Make sure your HA instance timezone is set to `America/Los_Angeles`:

```
Settings → System → General → Time Zone → America/Los_Angeles
```

This is critical — the schedule engine uses `homeassistant.util.dt.now()` which respects your configured timezone. If this is wrong, on-peak hours will be offset.

## Option B: Install via HACS (once repo is published)

1. Open **HACS → Integrations → ⋮ (menu) → Custom repositories**
2. Add `https://github.com/danrichardson/solarseed-tou-metering` as category **Integration**
3. Search for "Solarseed TOU" and click **Install**
4. Restart HA, then follow steps 3–6 above

## Updating During Development

When you make code changes locally:

```bash
# From repo root on your dev machine
scp -r custom_components/solarseed_tou/ \
  your-user@portland-ha.local:/config/custom_components/solarseed_tou/

# Then restart HA (can do via SSH)
ssh your-user@portland-ha.local "ha core restart"
```

## Troubleshooting

**Integration doesn't appear in the Add Integration list:**
- Confirm the directory is at `/config/custom_components/solarseed_tou/` (not nested deeper)
- Confirm `manifest.json` exists in that directory
- Check **Settings → System → Logs** for import errors

**Sensors show "unavailable":**
- Verify your energy sensor entity ID is correct and has state (check Developer Tools → States)
- The sensor must be reporting a numeric value

**Cost isn't accumulating:**
- The integration only accumulates when the energy sensor value *increases* (energy mode) or is positive (power mode)
- If your sensor resets at midnight (utility meter helper), costs will resume after the first new reading

**YAML paste rejected with "invalid_config":**
- Every tier ID used in the grid must be defined in the `tiers:` section
- Each day in `grid:` must have exactly 24 entries
- Holiday `standard` entries must be valid IDs (see `const.py STANDARD_HOLIDAYS`)

**Rates seem wrong after upgrade to v0.7.0:**
- v0.7.0 adds the full formula (regulatory + passthrough + programs + tax). If you haven't pasted new YAML yet, these default to 0 and your old `rate` values are used as-is.
- Re-export from the calculator to get the full formula breakdown.

**Logs:**
```
Settings → System → Logs → search "solarseed"
```

Or via SSH:
```bash
ha core logs | grep -i solarseed
```
