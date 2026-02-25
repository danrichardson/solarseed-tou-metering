"""Persistent storage for Solarseed TOU configuration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    DOMAIN,
    STORAGE_KEY,
    STORAGE_VERSION,
    DEFAULT_TIERS,
    DEFAULT_SEASON,
    DEFAULT_REGULATORY_PER_KWH,
    DEFAULT_STATE_PASSTHROUGH_PER_KWH,
    DEFAULT_PROGRAMS_PER_KWH,
    DEFAULT_TAX_RATE_PCT,
    DEFAULT_FIXED_MONTHLY,
)

_LOGGER = logging.getLogger(__name__)


def _default_config(energy_sensor: str) -> dict[str, Any]:
    """Create default configuration."""
    return {
        "energy_sensor": energy_sensor,
        "tiers": DEFAULT_TIERS,
        "regulatory_per_kwh": DEFAULT_REGULATORY_PER_KWH,
        "state_passthrough_per_kwh": DEFAULT_STATE_PASSTHROUGH_PER_KWH,
        "programs_per_kwh": DEFAULT_PROGRAMS_PER_KWH,
        "tax_rate_pct": DEFAULT_TAX_RATE_PCT,
        "fixed_monthly": DEFAULT_FIXED_MONTHLY,
        "seasons": {
            "all_year": DEFAULT_SEASON,
        },
        "holidays": {
            "rate_tier": "off-peak",
            "observe_nearest_weekday": True,
            "standard": [
                "new_years", "memorial", "independence",
                "labor", "thanksgiving", "christmas",
            ],
            "custom": [],
        },
        "_schema_version": STORAGE_VERSION,
    }


def _migrate_v1_to_v2(config: dict[str, Any]) -> dict[str, Any]:
    """Migrate v1 config to v2 — add formula fields with safe defaults.

    Existing v1 configs stored a single ``rate`` per tier that may have been
    an *effective* rate (all-in after taxes/fees) or a bare rate — we can't
    know.  By defaulting all adders to 0 the v1 ``rate`` values will be used
    as-is, which is the safest behaviour until the user re-exports from the
    calculator.
    """
    config.setdefault("regulatory_per_kwh", 0.0)
    config.setdefault("state_passthrough_per_kwh", 0.0)
    config.setdefault("programs_per_kwh", 0.0)
    config.setdefault("tax_rate_pct", 0.0)
    config.setdefault("fixed_monthly", 0.0)
    config["_schema_version"] = 2
    _LOGGER.info(
        "Solarseed TOU: migrated storage v1 → v2 (added formula fields, "
        "adders default to 0)"
    )
    return config


class TOUStorage:
    """Manage persistent TOU configuration storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize storage."""
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] | None = None

    async def async_load(self) -> dict[str, Any]:
        """Load configuration from storage, running migrations if needed."""
        self._data = await self._store.async_load()
        if self._data is None:
            _LOGGER.debug("No stored TOU config found, using defaults")
            self._data = _default_config("")
        else:
            # Run migrations
            schema = self._data.get("_schema_version", 1)
            if schema < 2:
                self._data = _migrate_v1_to_v2(self._data)
                await self._store.async_save(self._data)
        return self._data

    async def async_save(self, data: dict[str, Any]) -> None:
        """Save configuration to storage."""
        data.setdefault("_schema_version", STORAGE_VERSION)
        self._data = data
        await self._store.async_save(data)

    async def async_get_config(self) -> dict[str, Any]:
        """Get current config, loading if needed."""
        if self._data is None:
            await self.async_load()
        return self._data  # type: ignore[return-value]

    async def async_update_config(self, updates: dict[str, Any]) -> dict[str, Any]:
        """Merge updates into config and save."""
        config = await self.async_get_config()
        config.update(updates)
        await self.async_save(config)
        return config

    @staticmethod
    def create_default(energy_sensor: str) -> dict[str, Any]:
        """Create a new default config with the given sensor."""
        return _default_config(energy_sensor)
