"""Shared fixtures for Solarseed TOU tests.

Stubs out Home Assistant and voluptuous so that pure-logic modules
(schedule, holiday, const, storage helpers) can be imported without
the full HA runtime.
"""
from __future__ import annotations

import sys
import types
from datetime import datetime
from unittest.mock import MagicMock

import pytest

# ── Stub external dependencies before any custom_components import ──

def _stub_module(name: str, **attrs) -> types.ModuleType:
    """Create a stub module with optional attributes."""
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod


def _ensure_stubs():
    """Install lightweight stubs for homeassistant packages if not available."""
    if "homeassistant" in sys.modules:
        return  # already available (running inside HA test harness)

    # voluptuous
    vol = _stub_module("voluptuous")
    vol.Schema = lambda *a, **kw: lambda x: x
    vol.Optional = lambda *a, **kw: a[0] if a else None
    vol.Required = lambda *a, **kw: a[0] if a else None

    # homeassistant top-level
    ha = _stub_module("homeassistant")
    _stub_module("homeassistant.components")
    ws_mod = _stub_module("homeassistant.components.websocket_api")
    ws_mod.websocket_command = lambda *a, **kw: lambda fn: fn
    ws_mod.async_response = lambda fn: fn
    ws_mod.async_register_command = lambda *a, **kw: None
    _stub_module("homeassistant.components.sensor",
                 SensorDeviceClass=MagicMock(),
                 SensorEntity=type("SensorEntity", (), {}),
                 SensorStateClass=MagicMock())
    _stub_module("homeassistant.config_entries",
                 ConfigEntry=MagicMock())
    _stub_module("homeassistant.const",
                 UnitOfEnergy=MagicMock(),
                 UnitOfPower=MagicMock())
    _stub_module("homeassistant.core",
                 HomeAssistant=MagicMock(),
                 callback=lambda fn: fn,
                 Event=MagicMock(),
                 State=MagicMock())
    _stub_module("homeassistant.helpers")
    _stub_module("homeassistant.helpers.entity_platform",
                 AddEntitiesCallback=MagicMock())
    _stub_module("homeassistant.helpers.dispatcher",
                 async_dispatcher_connect=MagicMock(),
                 async_dispatcher_send=MagicMock())
    _stub_module("homeassistant.helpers.event",
                 async_track_state_change_event=MagicMock())
    _stub_module("homeassistant.helpers.restore_state",
                 RestoreEntity=type("RestoreEntity", (), {}))
    _stub_module("homeassistant.helpers.storage",
                 Store=MagicMock())
    _stub_module("homeassistant.util")
    _stub_module("homeassistant.util.dt",
                 now=lambda: datetime.now())


_ensure_stubs()

# Now safe to import custom_components
from custom_components.solarseed_tou.schedule import TOUSchedule


def _make_config(
    *,
    tiers: dict | None = None,
    seasons: dict | None = None,
    holidays: dict | None = None,
    regulatory_per_kwh: float = 0.0,
    state_passthrough_per_kwh: float = 0.0,
    programs_per_kwh: float = 0.0,
    tax_rate_pct: float = 0.0,
    fixed_monthly: float = 0.0,
    energy_sensor: str = "sensor.power",
) -> dict:
    """Build a minimal config dict for testing."""
    if tiers is None:
        tiers = {
            "off-peak": {"name": "Off-Peak", "rate": 0.08, "color": "#0f0"},
            "mid-peak": {"name": "Mid-Peak", "rate": 0.12, "color": "#ff0"},
            "on-peak":  {"name": "On-Peak",  "rate": 0.25, "color": "#f00"},
        }

    if seasons is None:
        # Simple schedule: off-peak overnight, mid-peak shoulder, on-peak midday
        off_peak_day = ["off-peak"] * 6 + ["mid-peak"] * 3 + ["on-peak"] * 6 + ["mid-peak"] * 3 + ["off-peak"] * 6
        weekend_day = ["off-peak"] * 24
        seasons = {
            "summer": {
                "name": "Summer",
                "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                "grid": {
                    "mon": off_peak_day,
                    "tue": off_peak_day,
                    "wed": off_peak_day,
                    "thu": off_peak_day,
                    "fri": off_peak_day,
                    "sat": weekend_day,
                    "sun": weekend_day,
                },
            }
        }

    if holidays is None:
        holidays = {
            "rate_tier": "off-peak",
            "observe_nearest_weekday": True,
            "standard": ["christmas", "new_years", "independence"],
            "custom": [],
        }

    return {
        "energy_sensor": energy_sensor,
        "tiers": tiers,
        "seasons": seasons,
        "holidays": holidays,
        "regulatory_per_kwh": regulatory_per_kwh,
        "state_passthrough_per_kwh": state_passthrough_per_kwh,
        "programs_per_kwh": programs_per_kwh,
        "tax_rate_pct": tax_rate_pct,
        "fixed_monthly": fixed_monthly,
    }


@pytest.fixture
def base_config() -> dict:
    """Return a base config dict with sensible test defaults."""
    return _make_config()


@pytest.fixture
def base_schedule(base_config) -> TOUSchedule:
    """Return a TOUSchedule parsed from the base config."""
    return TOUSchedule.from_dict(base_config)


@pytest.fixture
def pge_config() -> dict:
    """PGE-like config with realistic formula values."""
    return _make_config(
        tiers={
            "off-peak": {"name": "Off-Peak", "rate": 0.08339, "color": "#22c55e"},
            "mid-peak": {"name": "Mid-Peak", "rate": 0.09664, "color": "#f59e0b"},
            "on-peak":  {"name": "On-Peak",  "rate": 0.15728, "color": "#ef4444"},
        },
        regulatory_per_kwh=0.00491,
        state_passthrough_per_kwh=-0.00198,
        programs_per_kwh=0.00873,
        tax_rate_pct=1.8,
        fixed_monthly=11.55,
    )


@pytest.fixture
def pge_schedule(pge_config) -> TOUSchedule:
    """Return a TOUSchedule from PGE-like config."""
    return TOUSchedule.from_dict(pge_config)


def make_dt(year: int, month: int, day: int, hour: int = 12) -> datetime:
    """Shorthand for creating a test datetime."""
    return datetime(year, month, day, hour, 0, 0)
