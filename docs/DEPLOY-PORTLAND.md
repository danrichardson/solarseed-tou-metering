# Deploying Solarseed TOU to Portland HA Instance

## Prerequisites

- Home Assistant **2024.1.0** or newer
- An energy sensor entity (kWh) already configured (e.g., from an Emporia Vue, Sense, or utility meter helper)
- SSH or Samba access to your HA instance
- Your Portland General Electric (PGE) or Pacific Power rate schedule — use [johnnysolarseed.org/tou-calculator](https://johnnysolarseed.org/tou-calculator) to compute effective $/kWh rates

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
      frontend/          (empty — Phase 2)
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
3. Select your energy sensor (must be a `sensor` with device class `energy`)
4. Click **Submit**

This creates the integration with default rates (all off-peak at $0.10/kWh).

### 4. Import your PGE rate schedule

1. Go to **Settings → Devices & Services → Solarseed TOU Energy Metering → Configure**
2. Paste your YAML config into the text area

Example YAML for PGE Schedule 7 (residential TOU):
```yaml
tou_metering:
  tiers:
    off-peak:
      name: "Off-Peak"
      rate: 0.1042
      color: "#22c55e"
    on-peak:
      name: "On-Peak"
      rate: 0.1827
      color: "#ef4444"

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

> **Note:** The rates above are examples. Run your actual PGE bill through the [rate calculator](https://johnnysolarseed.org/tou-calculator) to get your effective all-in $/kWh. PGE on-peak is typically 3–8 PM weekdays.

3. Click **Submit** — the integration validates the YAML, saves it, and immediately starts using the new schedule.

### 5. Verify sensors are working

Go to **Developer Tools → States** and search for `solarseed_tou`. You should see:

| Entity | What to check |
|--------|--------------|
| `sensor.solarseed_tou_current_rate` | Shows current $/kWh (changes by hour) |
| `sensor.solarseed_tou_current_tier` | Shows "Off-Peak" or "On-Peak" |
| `sensor.solarseed_tou_cost_today` | Accumulates from midnight |
| `sensor.solarseed_tou_cost_this_week` | Accumulates from Monday |
| `sensor.solarseed_tou_cost_this_month` | Accumulates from 1st |

Check the attributes on `current_rate` — you should see `tier_id`, `tier_name`, `tier_color`, `is_holiday`, `next_rate_change`, and `next_tier`.

### 6. Set your timezone

Make sure your HA instance timezone is set to `America/Los_Angeles`:

```
Settings → System → General → Time Zone → America/Los_Angeles
```

This is critical — the schedule engine uses `homeassistant.util.dt.now()` which respects your configured timezone. If this is wrong, on-peak hours will be offset.

## Option B: Install via HACS (once repo is published)

1. Open **HACS → Integrations → ⋮ (menu) → Custom repositories**
2. Add `https://github.com/throughline-tech/solarseed-tou` as category **Integration**
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

Or use a file watcher for faster iteration:
```bash
# Requires fswatch (macOS) or inotifywait (Linux)
fswatch -o custom_components/ | xargs -n1 -I{} \
  scp -r custom_components/solarseed_tou/ \
  your-user@portland-ha.local:/config/custom_components/solarseed_tou/
```

## Troubleshooting

**Integration doesn't appear in the Add Integration list:**
- Confirm the directory is at `/config/custom_components/solarseed_tou/` (not nested deeper)
- Confirm `manifest.json` exists in that directory
- Check **Settings → System → Logs** for import errors

**Sensors show "unavailable":**
- Verify your energy sensor entity ID is correct and has state (check Developer Tools → States)
- The energy sensor must have `device_class: energy` — check its attributes

**Cost isn't accumulating:**
- The integration only accumulates when the energy sensor value *increases*
- If your sensor resets at midnight (utility meter helper), costs will resume after the first new reading

**YAML paste rejected with "invalid_config":**
- Every tier ID used in the grid must be defined in the `tiers:` section
- Each day in `grid:` must have exactly 24 entries
- Holiday `standard` entries must be valid IDs (see `const.py STANDARD_HOLIDAYS`)

**Logs:**
```
Settings → System → Logs → search "solarseed"
```

Or via SSH:
```bash
ha core logs | grep -i solarseed
```
