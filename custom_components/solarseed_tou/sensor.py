"""Sensor platform for Solarseed TOU Energy Metering."""
from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy, UnitOfPower
from homeassistant.core import HomeAssistant, callback, Event, State
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN, CONF_ENERGY_SENSOR

# Unit → multiplier to get kW (for power sensors) or kWh (for energy sensors)
_POWER_UNITS = {
    UnitOfPower.WATT: 0.001,      # W → kW
    UnitOfPower.KILO_WATT: 1.0,   # kW → kW
    "mW": 0.000001,               # mW → kW
}
_ENERGY_UNITS = {
    UnitOfEnergy.KILO_WATT_HOUR: 1.0,   # kWh
    UnitOfEnergy.WATT_HOUR: 0.001,       # Wh → kWh
    UnitOfEnergy.MEGA_WATT_HOUR: 1000.0, # MWh → kWh
}


def _detect_sensor_mode(hass: HomeAssistant, entity_id: str) -> tuple[str, float]:
    """Detect whether sensor is power or energy and return (mode, multiplier).

    Returns ('power', mult) or ('energy', mult).  Defaults to ('energy', 1.0).
    """
    state = hass.states.get(entity_id)
    if state is None:
        return ("energy", 1.0)
    unit = state.attributes.get("unit_of_measurement", "")
    if unit in _POWER_UNITS:
        return ("power", _POWER_UNITS[unit])
    if unit in _ENERGY_UNITS:
        return ("energy", _ENERGY_UNITS[unit])
    # Fallback: check device_class
    dc = state.attributes.get("device_class", "")
    if dc == "power":
        return ("power", 0.001)  # assume W
    return ("energy", 1.0)  # assume kWh
from .schedule import TOUSchedule

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Solarseed TOU sensors from a config entry."""
    data = hass.data[DOMAIN][entry.entry_id]
    schedule: TOUSchedule = data["schedule"]
    energy_sensor: str = entry.data[CONF_ENERGY_SENSOR]

    entities = [
        TOUCurrentRateSensor(entry, schedule),
        TOUCurrentTierSensor(entry, schedule),
        TOUCostTodaySensor(entry, schedule, energy_sensor),
        TOUCostWeekSensor(entry, schedule, energy_sensor),
        TOUCostMonthSensor(entry, schedule, energy_sensor),
    ]

    async_add_entities(entities, True)


class TOUBaseSensor(SensorEntity):
    """Base class for TOU sensors."""

    _attr_has_entity_name = True

    def __init__(self, entry: ConfigEntry, schedule: TOUSchedule) -> None:
        """Initialize."""
        self._entry = entry
        self._schedule = schedule
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "Solarseed TOU Metering",
            "manufacturer": "Johnny Solarseed",
            "model": "TOU Energy Metering",
            "sw_version": "0.4.0",
        }

    async def async_added_to_hass(self) -> None:
        """Register dispatcher listener when added to HA."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                f"{DOMAIN}_config_updated",
                self._handle_config_update,
            )
        )

    @callback
    def _handle_config_update(self, schedule: TOUSchedule) -> None:
        """Handle config changes from the panel or options flow."""
        self._schedule = schedule
        self.async_write_ha_state()


class TOUCurrentRateSensor(TOUBaseSensor):
    """Sensor showing the current $/kWh rate."""

    _attr_name = "Current Rate"
    _attr_icon = "mdi:currency-usd"
    _attr_native_unit_of_measurement = "$/kWh"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 4

    def __init__(self, entry: ConfigEntry, schedule: TOUSchedule) -> None:
        """Initialize."""
        super().__init__(entry, schedule)
        self._attr_unique_id = f"{entry.entry_id}_current_rate"

    def update(self) -> None:
        """Update current rate."""
        now = dt_util.now()
        self._attr_native_value = round(self._schedule.get_rate(now), 6)

        tier = self._schedule.get_tier(now)
        if tier:
            self._attr_extra_state_attributes = {
                "tier_id": tier.id,
                "tier_name": tier.name,
                "tier_color": tier.color,
                "is_holiday": self._schedule.is_holiday(now.date()),
            }

            next_change = self._schedule.get_next_rate_change(now)
            if next_change:
                nxt_dt, nxt_tid = next_change
                nxt_tier = self._schedule.tiers.get(nxt_tid)
                self._attr_extra_state_attributes["next_rate_change"] = nxt_dt.isoformat()
                self._attr_extra_state_attributes["next_tier"] = nxt_tier.name if nxt_tier else nxt_tid


class TOUCurrentTierSensor(TOUBaseSensor):
    """Sensor showing the current tier name (for automations)."""

    _attr_name = "Current Tier"
    _attr_icon = "mdi:tag-outline"

    def __init__(self, entry: ConfigEntry, schedule: TOUSchedule) -> None:
        """Initialize."""
        super().__init__(entry, schedule)
        self._attr_unique_id = f"{entry.entry_id}_current_tier"

    def update(self) -> None:
        """Update current tier."""
        now = dt_util.now()
        tier = self._schedule.get_tier(now)
        self._attr_native_value = tier.name if tier else "Unknown"
        if tier:
            self._attr_extra_state_attributes = {
                "tier_id": tier.id,
                "rate": tier.rate,
                "color": tier.color,
            }


class TOUCostAccumulatorSensor(TOUBaseSensor, RestoreEntity):
    """Base class for cost accumulation sensors.

    Supports two source sensor modes:
      - 'energy' (kWh / Wh / MWh): cumulative meter, cost = delta_kWh * rate
      - 'power'  (W / kW):         instantaneous,  cost = power_kW * dt_h * rate
    Mode is auto-detected from the source sensor's unit_of_measurement.
    """

    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_native_unit_of_measurement = "$"
    _attr_state_class = SensorStateClass.TOTAL
    _attr_suggested_display_precision = 2

    def __init__(
        self,
        entry: ConfigEntry,
        schedule: TOUSchedule,
        energy_sensor: str,
    ) -> None:
        """Initialize."""
        super().__init__(entry, schedule)
        self._energy_sensor = energy_sensor
        self._cost: float = 0.0
        self._last_energy: float | None = None  # energy mode: last kWh reading
        self._last_power_time: datetime | None = None  # power mode: last timestamp
        self._last_reset: date | None = None
        self._sensor_mode: str = "energy"  # 'energy' or 'power'
        self._unit_multiplier: float = 1.0  # converts source unit → kW or kWh
        self._unsub: callback | None = None

    async def async_added_to_hass(self) -> None:
        """Restore state and start tracking energy/power sensor."""
        await super().async_added_to_hass()

        # Detect whether source sensor reports energy or power
        self._sensor_mode, self._unit_multiplier = _detect_sensor_mode(
            self.hass, self._energy_sensor
        )
        _LOGGER.info(
            "Solarseed TOU: source sensor %s detected as %s (multiplier=%s)",
            self._energy_sensor,
            self._sensor_mode,
            self._unit_multiplier,
        )

        # Restore previous state
        last_state = await self.async_get_last_state()
        if last_state and last_state.state not in (None, "unknown", "unavailable"):
            try:
                self._cost = float(last_state.state)
            except (ValueError, TypeError):
                self._cost = 0.0

            attrs = last_state.attributes
            if "last_energy_reading" in attrs:
                try:
                    self._last_energy = float(attrs["last_energy_reading"])
                except (ValueError, TypeError):
                    pass
            if "last_reset" in attrs:
                try:
                    self._last_reset = date.fromisoformat(attrs["last_reset"])
                except (ValueError, TypeError):
                    pass

        # Check if we need to reset (e.g., HA restarted on a new day)
        self._check_reset()

        # Track sensor state changes
        self._unsub = async_track_state_change_event(
            self.hass, [self._energy_sensor], self._handle_sensor_change
        )

    async def async_will_remove_from_hass(self) -> None:
        """Clean up."""
        if self._unsub:
            self._unsub()

    @callback
    def _handle_sensor_change(self, event: Event) -> None:
        """Handle source sensor state change (power or energy)."""
        new_state: State | None = event.data.get("new_state")
        if new_state is None or new_state.state in ("unknown", "unavailable"):
            # Sensor went unavailable — clear power timestamp so we don't
            # accumulate a huge gap when it comes back.
            if self._sensor_mode == "power":
                self._last_power_time = None
            return

        try:
            raw_value = float(new_state.state)
        except (ValueError, TypeError):
            return

        # Re-detect mode in case sensor unit changed (rare, but safe)
        new_mode, new_mult = _detect_sensor_mode(self.hass, self._energy_sensor)
        if new_mode != self._sensor_mode:
            _LOGGER.info(
                "Solarseed TOU: source sensor mode changed %s → %s",
                self._sensor_mode,
                new_mode,
            )
            self._sensor_mode = new_mode
            self._unit_multiplier = new_mult
            # Reset tracking state for the new mode
            self._last_energy = None
            self._last_power_time = None

        self._check_reset()
        now = dt_util.now()

        if self._sensor_mode == "power":
            self._accumulate_power(raw_value, now)
        else:
            self._accumulate_energy(raw_value, now)

        self._attr_native_value = round(self._cost, 4)
        self._attr_extra_state_attributes = {
            "last_energy_reading": self._last_energy,
            "sensor_mode": self._sensor_mode,
            "last_reset": self._last_reset.isoformat() if self._last_reset else None,
        }
        self.async_write_ha_state()

    def _accumulate_energy(self, new_kwh_raw: float, now: datetime) -> None:
        """Energy mode: delta between cumulative readings."""
        new_kwh = new_kwh_raw * self._unit_multiplier
        if self._last_energy is not None:
            delta = new_kwh - self._last_energy
            if delta > 0:
                rate = self._schedule.get_rate(now)
                self._cost += delta * rate
        self._last_energy = new_kwh

    def _accumulate_power(self, power_raw: float, now: datetime) -> None:
        """Power mode: integrate instantaneous power over time."""
        if self._last_power_time is not None:
            dt_hours = (now - self._last_power_time).total_seconds() / 3600.0
            # Sanity: ignore gaps > 1 hour (sensor was likely unavailable)
            if 0 < dt_hours <= 1.0:
                power_kw = power_raw * self._unit_multiplier
                delta_kwh = power_kw * dt_hours
                rate = self._schedule.get_rate(now)
                self._cost += delta_kwh * rate
            elif dt_hours > 1.0:
                _LOGGER.debug(
                    "Solarseed TOU: skipping %.1fh power gap for %s",
                    dt_hours,
                    self._energy_sensor,
                )
        self._last_power_time = now
        # Store equivalent energy for attributes (running total not meaningful for power,
        # but keep the field populated for consistency)
        self._last_energy = power_raw

    def _check_reset(self) -> None:
        """Check if accumulator should reset. Override in subclasses."""
        pass

    def update(self) -> None:
        """Periodic update."""
        self._check_reset()
        self._attr_native_value = round(self._cost, 4)


class TOUCostTodaySensor(TOUCostAccumulatorSensor):
    """Cost accumulated today."""

    _attr_name = "Cost Today"
    _attr_icon = "mdi:calendar-today"

    def __init__(self, entry, schedule, energy_sensor):
        super().__init__(entry, schedule, energy_sensor)
        self._attr_unique_id = f"{entry.entry_id}_cost_today"

    def _check_reset(self):
        today = dt_util.now().date()
        if self._last_reset != today:
            self._cost = 0.0
            self._last_reset = today


class TOUCostWeekSensor(TOUCostAccumulatorSensor):
    """Cost accumulated this week (Mon-Sun)."""

    _attr_name = "Cost This Week"
    _attr_icon = "mdi:calendar-week"

    def __init__(self, entry, schedule, energy_sensor):
        super().__init__(entry, schedule, energy_sensor)
        self._attr_unique_id = f"{entry.entry_id}_cost_week"

    def _check_reset(self):
        today = dt_util.now().date()
        # Monday = 0
        week_start = today - timedelta(days=today.weekday())
        if self._last_reset is None or self._last_reset < week_start:
            self._cost = 0.0
            self._last_reset = week_start


class TOUCostMonthSensor(TOUCostAccumulatorSensor):
    """Cost accumulated this month."""

    _attr_name = "Cost This Month"
    _attr_icon = "mdi:calendar-month"

    def __init__(self, entry, schedule, energy_sensor):
        super().__init__(entry, schedule, energy_sensor)
        self._attr_unique_id = f"{entry.entry_id}_cost_month"

    def _check_reset(self):
        today = dt_util.now().date()
        month_start = today.replace(day=1)
        if self._last_reset is None or self._last_reset < month_start:
            self._cost = 0.0
            self._last_reset = month_start
