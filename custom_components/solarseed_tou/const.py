"""Constants for Solarseed TOU Energy Metering."""

DOMAIN = "solarseed_tou"
VERSION = "0.5.0"
CONF_ENERGY_SENSOR = "energy_sensor"

# Storage
STORAGE_KEY = f"{DOMAIN}_config"
STORAGE_VERSION = 1

# Defaults
DEFAULT_TIERS = {
    "off-peak": {"name": "Off-Peak", "rate": 0.10, "color": "#22c55e"},
    "on-peak": {"name": "On-Peak", "rate": 0.18, "color": "#ef4444"},
}

DEFAULT_SEASON = {
    "name": "All Year",
    "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "grid": {
        day: ["off-peak"] * 24 for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    },
}

# Standard US holidays (pattern-based, resolved at runtime)
STANDARD_HOLIDAYS = {
    "new_years":    {"name": "New Year's Day",   "rule": "fixed", "month": 1, "day": 1},
    "mlk":          {"name": "MLK Jr. Day",      "rule": "nth",   "month": 1, "weekday": 0, "n": 3},
    "presidents":   {"name": "Presidents' Day",  "rule": "nth",   "month": 2, "weekday": 0, "n": 3},
    "memorial":     {"name": "Memorial Day",     "rule": "last",  "month": 5, "weekday": 0},
    "juneteenth":   {"name": "Juneteenth",       "rule": "fixed", "month": 6, "day": 19},
    "independence": {"name": "Independence Day", "rule": "fixed", "month": 7, "day": 4},
    "labor":        {"name": "Labor Day",        "rule": "nth",   "month": 9, "weekday": 0, "n": 1},
    "columbus":     {"name": "Columbus Day",     "rule": "nth",   "month": 10, "weekday": 0, "n": 2},
    "veterans":     {"name": "Veterans Day",     "rule": "fixed", "month": 11, "day": 11},
    "thanksgiving": {"name": "Thanksgiving",     "rule": "nth",   "month": 11, "weekday": 3, "n": 4},
    "christmas":    {"name": "Christmas Day",    "rule": "fixed", "month": 12, "day": 25},
}
