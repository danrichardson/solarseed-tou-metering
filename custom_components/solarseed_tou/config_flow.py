"""Config flow for Solarseed TOU Energy Metering."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
import yaml

from homeassistant import config_entries
from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.helpers import selector

from .const import DOMAIN, CONF_ENERGY_SENSOR
from .schedule import TOUSchedule

_LOGGER = logging.getLogger(__name__)


class SolarseedTOUConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Solarseed TOU."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step — select energy sensor."""
        errors: dict[str, str] = {}

        if user_input is not None:
            energy_sensor = user_input.get(CONF_ENERGY_SENSOR)

            if not energy_sensor:
                errors[CONF_ENERGY_SENSOR] = "sensor_required"
            else:
                # Check sensor exists
                state = self.hass.states.get(energy_sensor)
                if state is None:
                    errors[CONF_ENERGY_SENSOR] = "sensor_not_found"
                else:
                    # Prevent duplicate entries
                    await self.async_set_unique_id(energy_sensor)
                    self._abort_if_unique_id_configured()

                    return self.async_create_entry(
                        title=f"TOU Metering ({energy_sensor})",
                        data={CONF_ENERGY_SENSOR: energy_sensor},
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_ENERGY_SENSOR): selector.EntitySelector(
                    selector.EntitySelectorConfig(
                        domain="sensor",
                        device_class=SensorDeviceClass.ENERGY,
                    ),
                ),
            }),
            errors=errors,
            description_placeholders={
                "docs_url": "https://johnnysolarseed.com/tou",
            },
        )

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> SolarseedTOUOptionsFlow:
        """Get the options flow handler."""
        return SolarseedTOUOptionsFlow()


class SolarseedTOUOptionsFlow(config_entries.OptionsFlow):
    """Handle options for Solarseed TOU — YAML paste import."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Options step — paste YAML config to import schedule."""
        errors: dict[str, str] = {}

        if user_input is not None:
            yaml_text = user_input.get("yaml_config", "").strip()

            if not yaml_text:
                # Nothing pasted — close without changes
                return self.async_create_entry(title="", data={})

            try:
                parsed = yaml.safe_load(yaml_text)
            except yaml.YAMLError:
                errors["yaml_config"] = "invalid_yaml"
            else:
                # Accept with or without the tou_metering wrapper
                if isinstance(parsed, dict) and "tou_metering" in parsed:
                    parsed = parsed["tou_metering"]

                if not isinstance(parsed, dict):
                    errors["yaml_config"] = "invalid_yaml"
                else:
                    try:
                        # Preserve energy sensor from the config entry
                        parsed["energy_sensor"] = self.config_entry.data.get(
                            CONF_ENERGY_SENSOR, ""
                        )
                        # Validate by building a schedule
                        schedule = TOUSchedule.from_dict(parsed)

                        # Persist and update live schedule
                        entry_data = self.hass.data[DOMAIN].get(
                            self.config_entry.entry_id
                        )
                        if entry_data:
                            storage = entry_data["storage"]
                            await storage.async_save(parsed)
                            entry_data["schedule"] = schedule

                        return self.async_create_entry(title="", data={})
                    except Exception:  # noqa: BLE001
                        errors["yaml_config"] = "invalid_config"

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional("yaml_config", default=""): selector.TextSelector(
                        selector.TextSelectorConfig(multiline=True),
                    ),
                }
            ),
            errors=errors,
            description_placeholders={
                "panel_url": "/solarseed-tou",
            },
        )
