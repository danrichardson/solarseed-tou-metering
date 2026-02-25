"""Constants for Solarseed TOU Energy Metering."""

DOMAIN = "solarseed_tou"
VERSION = "0.7.0"
CONF_ENERGY_SENSOR = "energy_sensor"

# Storage
STORAGE_KEY = f"{DOMAIN}_config"
STORAGE_VERSION = 2  # v2: added formula fields (regulatory, passthrough, programs, tax, fixed)

# Defaults — PGE Schedule 7 example values (Oregon Residential TOU)
DEFAULT_TIERS = {
    "off-peak": {"name": "Off-Peak", "rate": 0.08339, "color": "#22c55e"},
    "mid-peak": {"name": "Mid-Peak", "rate": 0.09664, "color": "#f59e0b"},
    "on-peak":  {"name": "On-Peak",  "rate": 0.15728, "color": "#ef4444"},
}

DEFAULT_SEASON = {
    "name": "All Year",
    "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "grid": {
        day: ["off-peak"] * 24 for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    },
}

# Shared per-kWh formula defaults (zeros — user fills from their bill)
DEFAULT_REGULATORY_PER_KWH = 0.0
DEFAULT_STATE_PASSTHROUGH_PER_KWH = 0.0
DEFAULT_PROGRAMS_PER_KWH = 0.0
DEFAULT_TAX_RATE_PCT = 0.0
DEFAULT_FIXED_MONTHLY = 0.0

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
