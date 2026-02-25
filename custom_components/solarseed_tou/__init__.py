"""Solarseed TOU Energy Metering integration for Home Assistant.

Rate configuration is managed via YAML exported from the Johnny Solarseed
Rate Calculator (johnnysolarseed.org/tou-calculator) and pasted into the
integration's Options flow.  No frontend panel is shipped — the website
handles all rate decomposition and schedule painting.
"""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, CONF_ENERGY_SENSOR
from .schedule import TOUSchedule
from .storage import TOUStorage

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Solarseed TOU component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Solarseed TOU from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Initialize storage
    storage = TOUStorage(hass)
    stored_config = await storage.async_load()

    # Ensure energy sensor is set from config entry
    energy_sensor = entry.data.get(CONF_ENERGY_SENSOR, "")
    if stored_config.get("energy_sensor") != energy_sensor:
        stored_config["energy_sensor"] = energy_sensor
        await storage.async_save(stored_config)

    # Parse schedule
    schedule = TOUSchedule.from_dict(stored_config)

    # Store references
    hass.data[DOMAIN][entry.entry_id] = {
        "storage": storage,
        "schedule": schedule,
        "entry": entry,
    }

    # Register WebSocket API (useful for debugging / external tooling)
    _async_register_websocket(hass)

    # Set up sensor platform
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


@callback
def _async_register_websocket(hass: HomeAssistant) -> None:
    """Register WebSocket commands for config read/write."""

    @websocket_api.websocket_command(
        {vol.Required("type"): "solarseed_tou/get_config"}
    )
    @websocket_api.async_response
    async def ws_get_config(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) -> None:
        """Return current TOU configuration."""
        entry_data = _get_entry_data(hass)
        if entry_data is None:
            connection.send_error(msg["id"], "not_configured", "No TOU entry found")
            return

        storage: TOUStorage = entry_data["storage"]
        config = await storage.async_get_config()
        connection.send_result(msg["id"], config)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "solarseed_tou/set_config",
            vol.Required("config"): dict,
        }
    )
    @websocket_api.async_response
    async def ws_set_config(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) -> None:
        """Update TOU configuration (used by external tooling / automations)."""
        entry_data = _get_entry_data(hass)
        if entry_data is None:
            connection.send_error(msg["id"], "not_configured", "No TOU entry found")
            return

        storage: TOUStorage = entry_data["storage"]
        new_config = msg["config"]

        # Validate and save
        try:
            schedule = TOUSchedule.from_dict(new_config)
        except Exception as err:
            connection.send_error(msg["id"], "invalid_config", str(err))
            return

        await storage.async_save(new_config)

        # Update the live schedule
        entry_data["schedule"] = schedule

        # Notify sensors to pick up new schedule immediately
        async_dispatcher_send(hass, f"{DOMAIN}_config_updated", schedule)

        connection.send_result(msg["id"], {"success": True})

    # Only register once
    if not hass.data[DOMAIN].get("_ws_registered"):
        websocket_api.async_register_command(hass, ws_get_config)
        websocket_api.async_register_command(hass, ws_set_config)
        hass.data[DOMAIN]["_ws_registered"] = True


def _get_entry_data(hass: HomeAssistant) -> dict[str, Any] | None:
    """Get the first entry's data dict."""
    domain_data = hass.data.get(DOMAIN, {})
    for entry_data in domain_data.values():
        if isinstance(entry_data, dict) and "storage" in entry_data:
            return entry_data
    return None
