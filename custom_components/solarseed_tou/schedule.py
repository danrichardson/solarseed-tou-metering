"""Rate schedule resolution for Solarseed TOU.

Given a datetime, determines the active rate tier by:
1. Checking if the date is a holiday → use holiday tier
2. Finding the active season from the current month
3. Looking up the day-of-week row in the season grid
4. Indexing by hour to get the tier ID
5. Returning the tier's rate
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Any

from .holiday import resolve_holidays_for_year


DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class RateTier:
    """A rate tier with an effective $/kWh."""
    id: str
    name: str
    rate: float
    color: str = "#888888"


@dataclass
class Season:
    """A seasonal schedule: months it applies to and a 7×24 grid of tier IDs."""
    name: str
    months: list[int]  # 1-12
    grid: dict[str, list[str]]  # day_key -> [24 tier IDs]


@dataclass
class HolidayConfig:
    """Holiday configuration."""
    rate_tier: str  # tier ID to use on holidays
    observe_nearest_weekday: bool = True
    standard: list[str] = field(default_factory=list)  # holiday IDs
    custom: list[dict] = field(default_factory=list)


@dataclass
class TOUSchedule:
    """Complete TOU schedule configuration."""
    energy_sensor: str
    tiers: dict[str, RateTier]
    seasons: list[Season]
    holidays: HolidayConfig

    # Resolved holidays for current year (cached)
    _holiday_dates: set[date] = field(default_factory=set, repr=False)
    _holiday_year: int = 0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TOUSchedule:
        """Parse configuration dict into a TOUSchedule."""
        tiers = {}
        for tid, tdata in data.get("tiers", {}).items():
            tiers[tid] = RateTier(
                id=tid,
                name=tdata.get("name", tid),
                rate=float(tdata.get("rate", 0)),
                color=tdata.get("color", "#888888"),
            )

        seasons = []
        for _sid, sdata in data.get("seasons", {}).items():
            seasons.append(Season(
                name=sdata.get("name", _sid),
                months=sdata.get("months", []),
                grid=sdata.get("grid", {}),
            ))

        hdata = data.get("holidays", {})
        holidays = HolidayConfig(
            rate_tier=hdata.get("rate_tier", next(iter(tiers), "off-peak")),
            observe_nearest_weekday=hdata.get("observe_nearest_weekday", True),
            standard=hdata.get("standard", []),
            custom=hdata.get("custom", []),
        )

        return cls(
            energy_sensor=data.get("energy_sensor", ""),
            tiers=tiers,
            seasons=seasons,
            holidays=holidays,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to configuration dict."""
        result: dict[str, Any] = {
            "energy_sensor": self.energy_sensor,
            "tiers": {},
            "seasons": {},
            "holidays": {
                "rate_tier": self.holidays.rate_tier,
                "observe_nearest_weekday": self.holidays.observe_nearest_weekday,
                "standard": self.holidays.standard,
                "custom": self.holidays.custom,
            },
        }
        for tid, t in self.tiers.items():
            result["tiers"][tid] = {
                "name": t.name, "rate": t.rate, "color": t.color,
            }
        for i, s in enumerate(self.seasons):
            key = s.name.lower().replace(" ", "_").replace("-", "_")
            result["seasons"][key] = {
                "name": s.name, "months": s.months, "grid": s.grid,
            }
        return result

    def _ensure_holidays(self, year: int) -> None:
        """Resolve holiday dates for the given year (cached)."""
        if self._holiday_year != year:
            self._holiday_dates = resolve_holidays_for_year(
                self.holidays.standard,
                self.holidays.custom,
                year,
                self.holidays.observe_nearest_weekday,
            )
            self._holiday_year = year

    def is_holiday(self, d: date) -> bool:
        """Check if a date is a configured holiday."""
        self._ensure_holidays(d.year)
        return d in self._holiday_dates

    def get_season(self, month: int) -> Season | None:
        """Find the season for a given month (1-12)."""
        for season in self.seasons:
            if month in season.months:
                return season
        # Fallback: return first season
        return self.seasons[0] if self.seasons else None

    def get_tier_id(self, now: datetime) -> str:
        """Resolve the active tier ID for a given datetime."""
        # Holiday check
        if self.is_holiday(now.date()):
            return self.holidays.rate_tier

        # Find season
        season = self.get_season(now.month)
        if season is None:
            return next(iter(self.tiers), "off-peak")

        # Get day-of-week grid row
        day_key = DAY_KEYS[now.weekday()]  # 0=Mon -> "mon"
        day_grid = season.grid.get(day_key, [])

        # Index by hour
        if now.hour < len(day_grid):
            return day_grid[now.hour]

        return next(iter(self.tiers), "off-peak")

    def get_rate(self, now: datetime) -> float:
        """Get the effective $/kWh rate for a given datetime."""
        tier_id = self.get_tier_id(now)
        tier = self.tiers.get(tier_id)
        return tier.rate if tier else 0.0

    def get_tier(self, now: datetime) -> RateTier | None:
        """Get the full RateTier for a given datetime."""
        tier_id = self.get_tier_id(now)
        return self.tiers.get(tier_id)

    def get_next_rate_change(self, now: datetime) -> tuple[datetime, str] | None:
        """Find the next time the rate changes. Returns (datetime, new_tier_id)."""
        current_tier = self.get_tier_id(now)

        # Check remaining hours today
        for h in range(now.hour + 1, 24):
            check = now.replace(hour=h, minute=0, second=0, microsecond=0)
            tid = self.get_tier_id(check)
            if tid != current_tier:
                return (check, tid)

        # Check tomorrow from hour 0
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        for h in range(24):
            check = tomorrow.replace(hour=h)
            tid = self.get_tier_id(check)
            if tid != current_tier:
                return (check, tid)

        return None
