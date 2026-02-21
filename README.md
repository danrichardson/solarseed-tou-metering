# ☀ Solarseed TOU Energy Metering

Time-of-use energy cost tracking for Home Assistant.

Home Assistant tracks your energy **consumption** — this integration tracks your energy **costs** by applying the right rate at the right time.

## What It Does

- Multiplies your energy sensor's kWh by the correct rate for the current time of day
- Handles multiple rate tiers (off-peak, on-peak, mid-peak, etc.)
- Supports seasonal rate schedules (summer vs. winter pricing)
- Recognizes holidays with configurable holiday rates
- Creates sensors: current rate, current tier, cost today, cost this week, cost this month

## Installation

### HACS (Recommended)
1. Open HACS → Integrations → Custom Repositories
2. Add: `https://github.com/danrichardson/solarseed-tou-metering`
3. Install "Solarseed TOU Energy Metering"
4. Restart Home Assistant

### Manual
Copy `custom_components/solarseed_tou` to your `config/custom_components/` directory.

## Setup

1. Go to **Settings → Integrations → Add Integration**
2. Search for "Solarseed TOU"
3. Select your energy sensor (must be a kWh sensor)
4. Configure your rate schedule using the [Rate Formula Tool](https://johnnysolarseed.org/tou-calculator) on the website
5. Copy the generated YAML and paste it into the integration's Options flow

## Rate Configuration

### Using the Rate Formula Tool

The [Rate Formula Tool](https://johnnysolarseed.org/tou-calculator) walks you through a 5-step process:

1. **Rates** — Select a preset or scan your bill to auto-detect rate components
2. **Review** — See your all-in effective rates with a full breakdown
3. **Schedule** — Paint your TOU schedule on a 7×24 grid
4. **Validate** — Compare the formula against your actual bill
5. **Export** — Copy the YAML configuration for this plugin

### What Rate Do I Enter?

Enter your **effective (all-in) cost per kWh** — the number that includes all fees, taxes, and surcharges baked in. Not just the published energy rate.

The Rate Formula Tool calculates this automatically from your bill's component charges.

## Sensors Created

| Sensor | Description |
|--------|-------------|
| `sensor.solarseed_tou_current_rate` | Active $/kWh rate right now |
| `sensor.solarseed_tou_current_tier` | Name of active tier (for automations) |
| `sensor.solarseed_tou_cost_today` | Accumulated cost since midnight |
| `sensor.solarseed_tou_cost_this_week` | Since Monday |
| `sensor.solarseed_tou_cost_this_month` | Since 1st of month |

## Automations

Trigger automations on tier changes:

```yaml
trigger:
  - platform: state
    entity_id: sensor.solarseed_tou_current_tier
    to: "On-Peak"
action:
  - service: notify.notify
    data:
      message: "On-peak rates are now active!"
```

## Links

- [Rate Calculator](https://johnnysolarseed.org/tou-calculator) — figure out your effective $/kWh
- [Holiday Lists](https://johnnysolarseed.org/holidays) — find your utility's holidays
- [Johnny Solarseed](https://johnnysolarseed.org) — DIY solar education
- [Issues](https://github.com/throughline-tech/solarseed-tou/issues)

## License

MIT
