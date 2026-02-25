"""Tests for schedule.py — rate resolution and formula computation."""
from __future__ import annotations

import math
import pytest
from datetime import datetime, date

from custom_components.solarseed_tou.schedule import (
    TOUSchedule,
    RateTier,
    Season,
    HolidayConfig,
)
from tests.conftest import _make_config, make_dt


# ── from_dict parsing ──────────────────────────────────────────


class TestFromDict:
    """Parsing YAML config dicts into TOUSchedule objects."""

    def test_parses_tiers(self, base_schedule):
        assert len(base_schedule.tiers) == 3
        assert "off-peak" in base_schedule.tiers
        assert base_schedule.tiers["off-peak"].rate == 0.08

    def test_parses_seasons(self, base_schedule):
        assert len(base_schedule.seasons) == 1
        assert base_schedule.seasons[0].name == "Summer"
        assert 7 in base_schedule.seasons[0].months

    def test_parses_holidays(self, base_schedule):
        assert base_schedule.holidays.rate_tier == "off-peak"
        assert "christmas" in base_schedule.holidays.standard

    def test_parses_formula_fields(self, pge_schedule):
        assert pge_schedule.regulatory_per_kwh == pytest.approx(0.00491)
        assert pge_schedule.state_passthrough_per_kwh == pytest.approx(-0.00198)
        assert pge_schedule.programs_per_kwh == pytest.approx(0.00873)
        assert pge_schedule.tax_rate_pct == pytest.approx(1.8)
        assert pge_schedule.fixed_monthly == pytest.approx(11.55)

    def test_formula_fields_default_to_zero(self, base_schedule):
        assert base_schedule.regulatory_per_kwh == 0.0
        assert base_schedule.state_passthrough_per_kwh == 0.0
        assert base_schedule.programs_per_kwh == 0.0
        assert base_schedule.tax_rate_pct == 0.0
        assert base_schedule.fixed_monthly == 0.0

    def test_unwraps_tou_metering_root_key(self, base_config):
        """Config exported from the website calculator may be wrapped in tou_metering:."""
        wrapped = {"tou_metering": base_config}
        schedule = TOUSchedule.from_dict(wrapped)
        assert len(schedule.tiers) == 3
        assert schedule.energy_sensor == "sensor.power"

    def test_missing_sections_produce_empty_defaults(self):
        """Minimal config with only energy_sensor should not crash."""
        schedule = TOUSchedule.from_dict({"energy_sensor": "sensor.x"})
        assert schedule.energy_sensor == "sensor.x"
        assert len(schedule.tiers) == 0
        assert len(schedule.seasons) == 0


# ── to_dict round-trip ─────────────────────────────────────────


class TestToDict:
    """Serialization round-trip tests."""

    def test_round_trip_preserves_tiers(self, base_schedule):
        d = base_schedule.to_dict()
        restored = TOUSchedule.from_dict(d)
        assert set(restored.tiers.keys()) == set(base_schedule.tiers.keys())
        for tid in base_schedule.tiers:
            assert restored.tiers[tid].rate == base_schedule.tiers[tid].rate

    def test_round_trip_preserves_formula_fields(self, pge_schedule):
        d = pge_schedule.to_dict()
        restored = TOUSchedule.from_dict(d)
        assert restored.regulatory_per_kwh == pytest.approx(pge_schedule.regulatory_per_kwh)
        assert restored.state_passthrough_per_kwh == pytest.approx(pge_schedule.state_passthrough_per_kwh)
        assert restored.programs_per_kwh == pytest.approx(pge_schedule.programs_per_kwh)
        assert restored.tax_rate_pct == pytest.approx(pge_schedule.tax_rate_pct)
        assert restored.fixed_monthly == pytest.approx(pge_schedule.fixed_monthly)

    def test_round_trip_preserves_seasons(self, base_schedule):
        d = base_schedule.to_dict()
        restored = TOUSchedule.from_dict(d)
        assert len(restored.seasons) == len(base_schedule.seasons)
        for orig, rest in zip(base_schedule.seasons, restored.seasons):
            assert set(orig.months) == set(rest.months)


# ── compute_effective_rate ─────────────────────────────────────


class TestComputeEffectiveRate:
    """Tests for the YAML-contract formula implementation."""

    def test_zero_adders_returns_bare_rate(self, base_schedule):
        """With all adders = 0 and tax = 0, effective = tier.rate."""
        rate = base_schedule.compute_effective_rate("off-peak")
        assert rate == pytest.approx(0.08)

    def test_formula_with_all_adders(self, pge_schedule):
        """effective = (rate + reg + pass + prog) × (1 + tax/100)."""
        # off-peak: (0.08339 + 0.00491 + (-0.00198) + 0.00873) × (1 + 1.8/100)
        base_sum = 0.08339 + 0.00491 - 0.00198 + 0.00873
        expected = base_sum * (1 + 1.8 / 100)
        actual = pge_schedule.compute_effective_rate("off-peak")
        assert actual == pytest.approx(expected, rel=1e-9)

    def test_formula_on_peak(self, pge_schedule):
        """Same formula with on-peak tier rate."""
        base_sum = 0.15728 + 0.00491 - 0.00198 + 0.00873
        expected = base_sum * (1 + 1.8 / 100)
        actual = pge_schedule.compute_effective_rate("on-peak")
        assert actual == pytest.approx(expected, rel=1e-9)

    def test_negative_passthrough_lowers_rate(self, pge_schedule):
        """Confirming negative credits reduce the effective rate."""
        # Compare with and without the negative passthrough
        rate_with = pge_schedule.compute_effective_rate("off-peak")
        # Temporarily zero out passthrough
        pge_schedule.state_passthrough_per_kwh = 0.0
        rate_without = pge_schedule.compute_effective_rate("off-peak")
        assert rate_with < rate_without

    def test_unknown_tier_returns_zero(self, base_schedule):
        """Requesting an unknown tier ID should return 0.0, not crash."""
        assert base_schedule.compute_effective_rate("nonexistent") == 0.0

    def test_zero_tax_means_no_tax_multiplier(self):
        """tax_rate_pct = 0 should produce a 1.0 multiplier."""
        config = _make_config(
            tiers={"flat": {"name": "Flat", "rate": 0.10}},
            regulatory_per_kwh=0.01,
            tax_rate_pct=0.0,
        )
        sched = TOUSchedule.from_dict(config)
        assert sched.compute_effective_rate("flat") == pytest.approx(0.11)

    def test_high_tax_rate(self):
        """Edge case: very high tax rate (like 10%)."""
        config = _make_config(
            tiers={"flat": {"name": "Flat", "rate": 0.10}},
            tax_rate_pct=10.0,
        )
        sched = TOUSchedule.from_dict(config)
        assert sched.compute_effective_rate("flat") == pytest.approx(0.10 * 1.10)


# ── Tier resolution (get_tier_id, get_rate) ────────────────────


class TestTierResolution:
    """Tier ID resolution from datetime."""

    def test_weekday_on_peak_hour(self, base_schedule):
        """Wednesday at 10 AM should be on-peak (hour 10 in grid)."""
        # 2025-01-08 is a Wednesday
        dt = make_dt(2025, 1, 8, 10)
        assert base_schedule.get_tier_id(dt) == "on-peak"

    def test_weekday_off_peak_hour(self, base_schedule):
        """Wednesday at 2 AM should be off-peak."""
        dt = make_dt(2025, 1, 8, 2)
        assert base_schedule.get_tier_id(dt) == "off-peak"

    def test_weekday_mid_peak_hour(self, base_schedule):
        """Wednesday at 7 AM should be mid-peak (hour 7 in grid: shoulder)."""
        dt = make_dt(2025, 1, 8, 7)
        assert base_schedule.get_tier_id(dt) == "mid-peak"

    def test_weekend_always_off_peak(self, base_schedule):
        """Saturday at any hour should be off-peak."""
        # 2025-01-11 is a Saturday
        for hour in range(24):
            dt = make_dt(2025, 1, 11, hour)
            assert base_schedule.get_tier_id(dt) == "off-peak"

    def test_get_rate_uses_formula(self, pge_schedule):
        """get_rate() should return the formula-computed effective rate, not bare tier.rate."""
        # 2025-01-11 is a Saturday → off-peak (weekend grid is all off-peak)
        dt = make_dt(2025, 1, 11, 12)
        rate = pge_schedule.get_rate(dt)
        expected = pge_schedule.compute_effective_rate("off-peak")
        assert rate == pytest.approx(expected)
        # Make sure it's NOT the bare rate
        assert rate != pytest.approx(0.08339)

    def test_holiday_overrides_grid(self, base_schedule):
        """Christmas 2025 (Thu) should use the holiday tier (off-peak) regardless of grid."""
        # Christmas 2025 is a Thursday, normally hour 10 would be on-peak
        dt = make_dt(2025, 12, 25, 10)
        assert base_schedule.get_tier_id(dt) == "off-peak"

    def test_holiday_observed_shift(self, base_schedule):
        """July 4, 2026 is a Saturday → observed on Friday July 3."""
        fri_before = make_dt(2026, 7, 3, 10)  # Friday
        assert base_schedule.is_holiday(fri_before.date())
        actual_july4 = make_dt(2026, 7, 4, 10)  # Saturday
        assert not base_schedule.is_holiday(actual_july4.date())

    def test_get_tier_base_rate(self, pge_schedule):
        """get_tier_base_rate should return bare tier.rate without adders."""
        dt = make_dt(2025, 1, 11, 12)  # Saturday → off-peak
        assert pge_schedule.get_tier_base_rate(dt) == pytest.approx(0.08339)


# ── Season resolution ──────────────────────────────────────────


class TestSeasonResolution:
    """Season lookup and fallback."""

    def test_month_in_season(self, base_schedule):
        """July should resolve to the single 'Summer' season."""
        season = base_schedule.get_season(7)
        assert season is not None
        assert season.name == "Summer"

    def test_multi_season_config(self):
        """Config with two seasons resolves correctly by month."""
        config = _make_config(seasons={
            "winter": {
                "name": "Winter",
                "months": [1, 2, 3, 10, 11, 12],
                "grid": {"mon": ["off-peak"] * 24, "tue": ["off-peak"] * 24,
                         "wed": ["off-peak"] * 24, "thu": ["off-peak"] * 24,
                         "fri": ["off-peak"] * 24, "sat": ["off-peak"] * 24,
                         "sun": ["off-peak"] * 24},
            },
            "summer": {
                "name": "Summer",
                "months": [4, 5, 6, 7, 8, 9],
                "grid": {"mon": ["on-peak"] * 24, "tue": ["on-peak"] * 24,
                         "wed": ["on-peak"] * 24, "thu": ["on-peak"] * 24,
                         "fri": ["on-peak"] * 24, "sat": ["on-peak"] * 24,
                         "sun": ["on-peak"] * 24},
            },
        })
        sched = TOUSchedule.from_dict(config)
        assert sched.get_season(1).name == "Winter"
        assert sched.get_season(7).name == "Summer"

    def test_fallback_to_first_season(self):
        """Month not in any season falls back to first defined season."""
        config = _make_config(seasons={
            "summer": {
                "name": "Summer",
                "months": [6, 7, 8],
                "grid": {"mon": ["on-peak"] * 24, "tue": ["on-peak"] * 24,
                         "wed": ["on-peak"] * 24, "thu": ["on-peak"] * 24,
                         "fri": ["on-peak"] * 24, "sat": ["on-peak"] * 24,
                         "sun": ["on-peak"] * 24},
            },
        })
        sched = TOUSchedule.from_dict(config)
        # January is not in [6,7,8] → falls back to first season
        season = sched.get_season(1)
        assert season is not None
        assert season.name == "Summer"


# ── Next rate change ───────────────────────────────────────────


class TestNextRateChange:
    """Tests for get_next_rate_change."""

    def test_next_change_later_today(self, base_schedule):
        """At 5 AM on a weekday, next change should be at 6 AM (transition to mid-peak)."""
        dt = make_dt(2025, 1, 8, 5)  # Wednesday, hour 5 → off-peak
        result = base_schedule.get_next_rate_change(dt)
        assert result is not None
        change_dt, new_tier = result
        assert change_dt.hour == 6  # off-peak → mid-peak at 6
        assert new_tier == "mid-peak"

    def test_next_change_tomorrow_from_late_night(self, base_schedule):
        """At 20:00 (off-peak) the next change should be tomorrow at 6 AM."""
        dt = make_dt(2025, 1, 8, 20)  # Wednesday, hour 20 → off-peak
        result = base_schedule.get_next_rate_change(dt)
        assert result is not None
        change_dt, new_tier = result
        assert change_dt.day == 9  # Tomorrow

    def test_no_change_on_static_day(self):
        """Weekend with all off-peak has no rate change until Monday."""
        config = _make_config()
        sched = TOUSchedule.from_dict(config)
        # Saturday 0:00 — entire day is off-peak, but tomorrow (Sunday) is also off-peak
        dt = make_dt(2025, 1, 11, 0)  # Saturday
        result = sched.get_next_rate_change(dt)
        # Sunday is also all off-peak, so the next change is Monday at 6 AM
        # But get_next_rate_change only checks 24h ahead (today + tomorrow)
        # So it should find the change on Monday since tomorrow for Sat is Sun (off-peak all day)
        # Actually, schedule only checks today + tomorrow → if both are off-peak, returns None
        # Let me verify: Sat at hour 0, rest of Sat is off-peak, then Sun (tomorrow) all off-peak → None
        assert result is None


# ── Storage migration ──────────────────────────────────────────


class TestStorageMigration:
    """V1 → V2 migration of stored configs."""

    def test_v1_config_gets_formula_defaults(self):
        """A v1 config missing formula fields should parse with 0.0 defaults."""
        v1_config = {
            "energy_sensor": "sensor.test",
            "tiers": {
                "off-peak": {"name": "Off-Peak", "rate": 0.1598},
                "on-peak": {"name": "On-Peak", "rate": 0.5189},
            },
            "seasons": {
                "all_year": {
                    "name": "All Year",
                    "months": list(range(1, 13)),
                    "grid": {d: ["off-peak"] * 24 for d in
                             ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
                }
            },
            "holidays": {
                "rate_tier": "off-peak",
                "observe_nearest_weekday": True,
                "standard": [],
                "custom": [],
            },
        }
        sched = TOUSchedule.from_dict(v1_config)
        # Formula fields should all be 0
        assert sched.regulatory_per_kwh == 0.0
        assert sched.state_passthrough_per_kwh == 0.0
        assert sched.programs_per_kwh == 0.0
        assert sched.tax_rate_pct == 0.0
        assert sched.fixed_monthly == 0.0
        # But tier rates should be preserved
        assert sched.tiers["off-peak"].rate == pytest.approx(0.1598)
        assert sched.tiers["on-peak"].rate == pytest.approx(0.5189)
        # Effective rate with 0 adders should equal bare rate
        assert sched.compute_effective_rate("off-peak") == pytest.approx(0.1598)

    def test_migrate_function_adds_fields(self):
        """The _migrate_v1_to_v2 function should add missing keys."""
        from custom_components.solarseed_tou.storage import _migrate_v1_to_v2

        v1 = {"energy_sensor": "sensor.test", "tiers": {}}
        v2 = _migrate_v1_to_v2(v1)
        assert v2["regulatory_per_kwh"] == 0.0
        assert v2["state_passthrough_per_kwh"] == 0.0
        assert v2["programs_per_kwh"] == 0.0
        assert v2["tax_rate_pct"] == 0.0
        assert v2["fixed_monthly"] == 0.0
        assert v2["_schema_version"] == 2

    def test_migrate_does_not_overwrite_existing(self):
        """If a v1 config somehow already has a field, don't overwrite."""
        from custom_components.solarseed_tou.storage import _migrate_v1_to_v2

        v1 = {"regulatory_per_kwh": 0.005, "tiers": {}}
        v2 = _migrate_v1_to_v2(v1)
        assert v2["regulatory_per_kwh"] == 0.005  # preserved


# ── Single-tier (flat rate) edge case ──────────────────────────


class TestSingleTierFlatRate:
    """YAML-contract edge case: single tier with formula still applied."""

    def test_flat_rate_formula(self):
        config = _make_config(
            tiers={"flat": {"name": "Flat", "rate": 0.10}},
            seasons={
                "all": {
                    "name": "All Year",
                    "months": list(range(1, 13)),
                    "grid": {d: ["flat"] * 24 for d in
                             ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]},
                }
            },
            regulatory_per_kwh=0.02,
            tax_rate_pct=5.0,
        )
        sched = TOUSchedule.from_dict(config)
        # effective = (0.10 + 0.02) * 1.05 = 0.126
        assert sched.compute_effective_rate("flat") == pytest.approx(0.126)
        # Any datetime should resolve to 'flat'
        assert sched.get_tier_id(make_dt(2025, 3, 15, 14)) == "flat"
