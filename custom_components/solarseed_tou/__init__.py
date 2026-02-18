"""Solarseed TOU Energy Metering integration for Home Assistant."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
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

    # Register custom panel
    await _async_register_panel(hass)

    # Register WebSocket API
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


async def _async_register_panel(hass: HomeAssistant) -> None:
    """Register the custom frontend panel."""
    frontend_path = str(Path(__file__).parent / "frontend")
    _LOGGER.debug("Registering panel, frontend path: %s", frontend_path)

    try:
        hass.http.register_static_path(
            "/solarseed-tou/frontend",
            frontend_path,
            cache_headers=False,
        )
        _LOGGER.debug("Static path registered OK")
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Static path already registered or error: %s", err)

    try:
        frontend.async_register_built_in_panel(
            hass,
            "custom",
            sidebar_title="TOU Metering",
            sidebar_icon="mdi:lightning-bolt",
            frontend_url_path="solarseed-tou",
            config={
                "_panel_custom": {
                    "name": "solarseed-tou-panel",
                    "module_url": "/solarseed-tou/frontend/panel.js",
                }
            },
            require_admin=True,
        )
        _LOGGER.info("TOU Metering panel registered successfully")
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Failed to register TOU panel: %s", err)


@callback
def _async_register_websocket(hass: HomeAssistant) -> None:
    """Register WebSocket commands for config CRUD."""

    @websocket_api.websocket_command(
        {vol.Required("type"): "solarseed_tou/get_config"}
    )
    @websocket_api.async_response
    async def ws_get_config(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) -> None:
        """Return current TOU configuration."""
        # Find the first entry
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
        """Update TOU configuration."""
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
