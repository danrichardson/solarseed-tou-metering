# Solarseed TOU v0.7.0 — QA Plan

## 1. Automated Tests (gate)

```bash
.venv/Scripts/python.exe -m pytest tests/ -v
```

79 tests cover pure logic — formula math, holiday resolution, tier lookup, storage migration, round-trip serialization. Run first; if anything's red, stop.

---

## 2. HACS Install on a Test HA Instance

### Fresh install

1. Add the repo in HACS → Install
2. Restart HA
3. Go to Settings → Integrations → Add "Solarseed TOU"
4. Pick any energy/power sensor → Finish
5. Verify: **no sidebar panel appears** (the old panel is gone)
6. Check the device page — you should see **7 sensors**:
   - Current Rate
   - Current Tier
   - Fixed Monthly Charge
   - Cost Per Hour
   - Cost Today
   - Cost This Week
   - Cost This Month

### Upgrade from v0.6.x

1. Existing install with v0.6.x config in place
2. Update via HACS → Restart HA
3. Check logs for: `Solarseed TOU: migrated storage v1 → v2 (added formula fields, adders default to 0)`
4. Verify existing rate values are unchanged (adders default to 0, so `effective = tier.rate × 1.0 = tier.rate`)
5. Verify the old sidebar panel link is gone (may linger in sidebar cache — browser hard-refresh clears it)

---

## 3. YAML Import via Options Flow

This is the primary config path now.

1. Go to the integration → Configure (gear icon)
2. Paste a YAML export from [johnnysolarseed.org/tou-calculator](https://johnnysolarseed.org/tou-calculator)
3. Submit

### Sensor verification after import

| Sensor | Expected behavior |
|---|---|
| **Current Rate** | Shows the formula-computed rate, NOT the bare tier rate. Compare: `(tier.rate + reg + pass + prog) × (1 + tax/100)` |
| **Current Tier** | Shows tier name (Off-Peak / Mid-Peak / On-Peak) matching the current hour's grid cell |
| **Fixed Monthly** | Shows the `fixed_monthly` value from your YAML (e.g. `$11.55/mo`) |
| **Cost Per Hour** | Should be non-zero if the source power sensor is reporting |

### Attributes deep-dive

Click Current Rate and expand attributes. You should see:

```
tier_id: off-peak
tier_name: Off-Peak
tier_base_rate: 0.08339
regulatory_per_kwh: 0.00491
state_passthrough_per_kwh: -0.00198
programs_per_kwh: 0.00873
tax_rate_pct: 1.8
fixed_monthly: 11.55
is_holiday: false
next_rate_change: 2026-02-23T06:00:00
next_tier: Mid-Peak
```

Verify each attribute matches what was in the pasted YAML. Then grab a calculator and confirm the displayed rate matches the formula manually:

```
(0.08339 + 0.00491 + (-0.00198) + 0.00873) × (1 + 1.8/100)
= 0.09505 × 1.018
= 0.096761...
```

The sensor value should match to 4–6 decimal places.

---

## 4. Tier Transition Test

Wait for (or time-travel to) a tier boundary. If your grid has off-peak ending at 6 AM:

1. Watch the **Current Tier** sensor flip at the hour boundary
2. Check HA event log for `solarseed_tou_tier_changed` with:
   - `previous_tier`, `new_tier`
   - `previous_effective_rate`, `new_effective_rate` (both formula-computed)
3. Confirm **Cost Per Hour** changes when the tier flips (higher rate = higher cost)

---

## 5. Holiday Override Test

Check `is_holiday` attribute on a known holiday. For a quick test without waiting:

1. Add a custom holiday to your YAML for today's date:
   ```yaml
   holidays:
     custom:
       - rule: fixed
         month: 2
         day: 22
   ```
2. Re-import via Options flow
3. Current Tier should switch to the holiday tier (usually off-peak) regardless of the grid
4. `is_holiday: true` should appear in Current Rate attributes

---

## 6. Accumulator Reset Tests

| Sensor | Reset trigger | How to verify |
|---|---|---|
| Cost Today | Midnight | Check value resets to `$0.00` after midnight, or restart HA after midnight |
| Cost This Week | Monday 00:00 | Verify on a Monday morning |
| Cost This Month | 1st of month | Check on March 1 |

After a reset, the sensor `last_reset` attribute should update to the new period start date.

---

## 7. Edge Cases to Spot-Check

- **Negative passthrough**: If `state_passthrough_per_kwh` is negative (credit), the effective rate should be *lower* than `tier.rate + regulatory + programs` alone
- **Zero tax**: With `tax_rate_pct: 0`, the rate should equal the raw sum of `tier.rate + adders`
- **Source sensor unavailable**: Disconnect the energy/power sensor entity temporarily — Cost Per Hour should stop updating (not crash), and cost accumulators should skip the gap (logged as "skipping power gap")
- **WebSocket API**: In Developer Tools → Services, check that `solarseed_tou/get_config` still works (kept for debugging)

---

## 8. Checklist

```
[ ] pytest: 79/79 green
[ ] Fresh install: 7 sensors appear, no sidebar panel
[ ] Upgrade from v0.6: migration log message, rates unchanged
[ ] YAML import: sensors update immediately, attributes match YAML
[ ] Formula spot-check: manual calc matches sensor value
[ ] Tier transition: event fires, cost_per_hour changes
[ ] Holiday override: tier forced to off-peak, is_holiday=true
[ ] Accumulator resets: daily/weekly/monthly at correct boundaries
[ ] Negative passthrough: rate is lower
[ ] Source sensor offline: no crash, gap skipped
```

Items 1–4 are the critical path. If those pass, the rest are confidence-building edge cases.
