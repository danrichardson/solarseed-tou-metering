"""Tests for storage.py — migration and default config generation."""
from __future__ import annotations

import pytest

from custom_components.solarseed_tou.storage import _default_config, _migrate_v1_to_v2
from custom_components.solarseed_tou.const import STORAGE_VERSION


class TestDefaultConfig:
    """Tests for _default_config generation."""

    def test_has_required_keys(self):
        config = _default_config("sensor.energy")
        assert config["energy_sensor"] == "sensor.energy"
        assert "tiers" in config
        assert "seasons" in config
        assert "holidays" in config
        assert config["_schema_version"] == STORAGE_VERSION

    def test_has_formula_fields(self):
        config = _default_config("sensor.energy")
        assert "regulatory_per_kwh" in config
        assert "state_passthrough_per_kwh" in config
        assert "programs_per_kwh" in config
        assert "tax_rate_pct" in config
        assert "fixed_monthly" in config

    def test_default_formula_values_are_zero(self):
        config = _default_config("sensor.energy")
        assert config["regulatory_per_kwh"] == 0.0
        assert config["state_passthrough_per_kwh"] == 0.0
        assert config["programs_per_kwh"] == 0.0
        assert config["tax_rate_pct"] == 0.0
        assert config["fixed_monthly"] == 0.0

    def test_default_tiers_are_pge_schedule_7(self):
        """Default tiers should have 3 PGE Schedule 7 tiers."""
        config = _default_config("sensor.x")
        tiers = config["tiers"]
        assert "off-peak" in tiers
        assert "mid-peak" in tiers
        assert "on-peak" in tiers

    def test_default_holidays_include_standard(self):
        config = _default_config("sensor.x")
        std = config["holidays"]["standard"]
        assert "christmas" in std
        assert "thanksgiving" in std
        assert "independence" in std


class TestMigrateV1ToV2:
    """Tests for _migrate_v1_to_v2."""

    def test_adds_all_formula_fields(self):
        v1 = {"energy_sensor": "sensor.test", "tiers": {}}
        v2 = _migrate_v1_to_v2(v1)
        assert v2["regulatory_per_kwh"] == 0.0
        assert v2["state_passthrough_per_kwh"] == 0.0
        assert v2["programs_per_kwh"] == 0.0
        assert v2["tax_rate_pct"] == 0.0
        assert v2["fixed_monthly"] == 0.0

    def test_sets_schema_version_to_2(self):
        v1 = {}
        v2 = _migrate_v1_to_v2(v1)
        assert v2["_schema_version"] == 2

    def test_preserves_existing_data(self):
        v1 = {
            "energy_sensor": "sensor.power",
            "tiers": {"off-peak": {"rate": 0.10}},
            "seasons": {"all": {"name": "All Year"}},
        }
        v2 = _migrate_v1_to_v2(v1)
        assert v2["energy_sensor"] == "sensor.power"
        assert v2["tiers"]["off-peak"]["rate"] == 0.10
        assert v2["seasons"]["all"]["name"] == "All Year"

    def test_does_not_overwrite_existing_formula_fields(self):
        """If a field already exists (unlikely but safe), don't clobber it."""
        v1 = {"regulatory_per_kwh": 0.005}
        v2 = _migrate_v1_to_v2(v1)
        assert v2["regulatory_per_kwh"] == 0.005

    def test_idempotent(self):
        """Running migration twice should not change the result."""
        v1 = {"energy_sensor": "sensor.test"}
        v2a = _migrate_v1_to_v2(v1.copy())
        v2b = _migrate_v1_to_v2(v2a.copy())
        assert v2a == v2b
