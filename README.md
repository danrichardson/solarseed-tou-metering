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
4. Configure your rate schedule in the **TOU Metering** panel (appears in sidebar)

## Rate Configuration

### What Rate Do I Enter?

Enter your **effective (all-in) cost per kWh** — the number that includes all fees, taxes, and surcharges baked in. Not just the published energy rate.

Use the [Rate Calculator](https://johnnysolarseed.com/tou-calculator) to figure out your effective rate from your actual utility bill.

### Example: PGE Oregon

Your bill shows 790 kWh at $169.50. That's an effective rate of $0.2145/kWh — much higher than the published $0.0354/kWh energy charge, because it includes transmission ($0.00862), distribution ($0.07014), fixed fees ($28.80/month), and taxes (3%).

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

- [Rate Calculator](https://johnnysolarseed.com/tou-calculator) — figure out your effective $/kWh
- [Holiday Lists](https://johnnysolarseed.com/holidays) — find your utility's holidays
- [Johnny Solarseed](https://johnnysolarseed.com) — DIY solar education
- [Issues](https://github.com/throughline-tech/solarseed-tou/issues)

## License

MIT
