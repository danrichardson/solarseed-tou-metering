"""Persistent storage for Solarseed TOU configuration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION, DEFAULT_TIERS, DEFAULT_SEASON

_LOGGER = logging.getLogger(__name__)


def _default_config(energy_sensor: str) -> dict[str, Any]:
    """Create default configuration."""
    return {
        "energy_sensor": energy_sensor,
        "tiers": DEFAULT_TIERS,
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
    }


class TOUStorage:
    """Manage persistent TOU configuration storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize storage."""
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] | None = None

    async def async_load(self) -> dict[str, Any]:
        """Load configuration from storage."""
        self._data = await self._store.async_load()
        if self._data is None:
            _LOGGER.debug("No stored TOU config found, using defaults")
            self._data = _default_config("")
        return self._data

    async def async_save(self, data: dict[str, Any]) -> None:
        """Save configuration to storage."""
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
