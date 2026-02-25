"""Tests for holiday.py — pattern-based holiday resolution."""
from __future__ import annotations

import pytest
from datetime import date

from custom_components.solarseed_tou.holiday import (
    resolve_fixed,
    resolve_nth_weekday,
    resolve_last_weekday,
    observe_nearest_weekday,
    resolve_holiday,
    resolve_holidays_for_year,
)
from custom_components.solarseed_tou.const import STANDARD_HOLIDAYS


# ── Fixed-date holidays ────────────────────────────────────────


class TestResolveFixed:
    """Tests for resolve_fixed."""

    def test_new_years(self):
        assert resolve_fixed(2025, 1, 1) == date(2025, 1, 1)

    def test_christmas(self):
        assert resolve_fixed(2025, 12, 25) == date(2025, 12, 25)

    def test_juneteenth(self):
        assert resolve_fixed(2025, 6, 19) == date(2025, 6, 19)


# ── Nth-weekday holidays ──────────────────────────────────────


class TestResolveNthWeekday:
    """Tests for resolve_nth_weekday."""

    def test_mlk_2025(self):
        """MLK 2025: 3rd Monday in January → Jan 20, 2025."""
        d = resolve_nth_weekday(2025, 1, 0, 3)  # weekday 0=Mon, n=3
        assert d == date(2025, 1, 20)

    def test_labor_day_2025(self):
        """Labor Day 2025: 1st Monday in September → Sep 1, 2025."""
        d = resolve_nth_weekday(2025, 9, 0, 1)
        assert d == date(2025, 9, 1)

    def test_thanksgiving_2025(self):
        """Thanksgiving 2025: 4th Thursday in November → Nov 27, 2025."""
        d = resolve_nth_weekday(2025, 11, 3, 4)  # weekday 3=Thu
        assert d == date(2025, 11, 27)

    def test_presidents_day_2025(self):
        """Presidents' Day 2025: 3rd Monday in February → Feb 17, 2025."""
        d = resolve_nth_weekday(2025, 2, 0, 3)
        assert d == date(2025, 2, 17)

    def test_columbus_day_2025(self):
        """Columbus Day 2025: 2nd Monday in October → Oct 13, 2025."""
        d = resolve_nth_weekday(2025, 10, 0, 2)
        assert d == date(2025, 10, 13)


# ── Last-weekday holidays ─────────────────────────────────────


class TestResolveLastWeekday:
    """Tests for resolve_last_weekday."""

    def test_memorial_day_2025(self):
        """Memorial Day 2025: last Monday in May → May 26, 2025."""
        d = resolve_last_weekday(2025, 5, 0)  # weekday 0=Mon
        assert d == date(2025, 5, 26)

    def test_memorial_day_2024(self):
        """Memorial Day 2024: last Monday in May → May 27, 2024."""
        d = resolve_last_weekday(2024, 5, 0)
        assert d == date(2024, 5, 27)


# ── Observed-weekday shifting ─────────────────────────────────


class TestObserveNearestWeekday:
    """Saturday → Friday, Sunday → Monday, weekday unchanged."""

    def test_saturday_shifts_to_friday(self):
        """July 4, 2026 is Saturday → observed Friday July 3."""
        d = date(2026, 7, 4)
        assert d.weekday() == 5  # Saturday
        assert observe_nearest_weekday(d) == date(2026, 7, 3)

    def test_sunday_shifts_to_monday(self):
        """Jan 1, 2023 is Sunday → observed Monday Jan 2."""
        d = date(2023, 1, 1)
        assert d.weekday() == 6  # Sunday
        assert observe_nearest_weekday(d) == date(2023, 1, 2)

    def test_weekday_unchanged(self):
        """Dec 25, 2025 is Thursday → no shift."""
        d = date(2025, 12, 25)
        assert d.weekday() == 3  # Thursday
        assert observe_nearest_weekday(d) == d

    def test_friday_unchanged(self):
        """A Friday stays as Friday."""
        d = date(2025, 7, 4)  # Friday
        assert d.weekday() == 4
        assert observe_nearest_weekday(d) == d


# ── resolve_holiday dispatcher ─────────────────────────────────


class TestResolveHoliday:
    """Tests for the resolve_holiday dispatcher function."""

    def test_fixed_rule(self):
        rule = {"rule": "fixed", "month": 12, "day": 25}
        assert resolve_holiday(rule, 2025) == date(2025, 12, 25)

    def test_nth_rule(self):
        rule = {"rule": "nth", "month": 11, "weekday": 3, "n": 4}
        assert resolve_holiday(rule, 2025) == date(2025, 11, 27)

    def test_last_rule(self):
        rule = {"rule": "last", "month": 5, "weekday": 0}
        assert resolve_holiday(rule, 2025) == date(2025, 5, 26)

    def test_unknown_rule_raises(self):
        with pytest.raises(ValueError, match="Unknown holiday rule"):
            resolve_holiday({"rule": "random"}, 2025)


# ── Full-year resolution ──────────────────────────────────────


class TestResolveHolidaysForYear:
    """Integration tests for resolving a full set of holidays for a year."""

    def test_standard_holidays_2025(self):
        """Resolve all 11 standard holidays for 2025 with observed shifting."""
        all_ids = list(STANDARD_HOLIDAYS.keys())
        holidays = resolve_holidays_for_year(all_ids, [], 2025, shift_observed=True)
        assert len(holidays) == 11
        # Spot-check some known dates
        assert date(2025, 1, 1) in holidays      # New Year's (Wednesday)
        assert date(2025, 1, 20) in holidays      # MLK (3rd Mon)
        assert date(2025, 7, 4) in holidays       # July 4 (Friday)
        assert date(2025, 12, 25) in holidays     # Christmas (Thursday)
        assert date(2025, 11, 27) in holidays     # Thanksgiving (4th Thu)

    def test_subset_of_standard_holidays(self):
        """Resolve only a few selected holidays."""
        holidays = resolve_holidays_for_year(
            ["christmas", "new_years", "independence"], [], 2025, shift_observed=True
        )
        assert len(holidays) == 3

    def test_custom_holidays(self):
        """Custom holiday rules should be resolved alongside standard."""
        custom = [{"rule": "fixed", "month": 4, "day": 15}]  # Tax Day
        holidays = resolve_holidays_for_year([], custom, 2025, shift_observed=True)
        assert date(2025, 4, 15) in holidays  # Tuesday, no shift

    def test_observed_shifting_disabled(self):
        """With shift_observed=False, Sat/Sun holidays stay on their actual date."""
        # July 4, 2026 is Saturday
        holidays_shifted = resolve_holidays_for_year(
            ["independence"], [], 2026, shift_observed=True
        )
        holidays_unshifted = resolve_holidays_for_year(
            ["independence"], [], 2026, shift_observed=False
        )
        assert date(2026, 7, 3) in holidays_shifted      # Friday (shifted)
        assert date(2026, 7, 4) in holidays_unshifted     # Saturday (actual)

    def test_unknown_holiday_id_ignored(self):
        """Unknown standard holiday IDs should be silently ignored."""
        holidays = resolve_holidays_for_year(
            ["christmas", "bogus_holiday"], [], 2025, shift_observed=True
        )
        assert len(holidays) == 1
        assert date(2025, 12, 25) in holidays

    def test_empty_inputs(self):
        """No standard and no custom → empty set."""
        holidays = resolve_holidays_for_year([], [], 2025)
        assert len(holidays) == 0


# ── Cross-year validation ─────────────────────────────────────


class TestCrossYear:
    """Validate holidays across multiple years for consistency."""

    @pytest.mark.parametrize("year", [2024, 2025, 2026, 2027, 2028])
    def test_thanksgiving_always_fourth_thursday(self, year):
        """Thanksgiving is always a Thursday."""
        rule = STANDARD_HOLIDAYS["thanksgiving"]
        d = resolve_holiday(rule, year)
        assert d.weekday() == 3  # Thursday

    @pytest.mark.parametrize("year", [2024, 2025, 2026, 2027, 2028])
    def test_memorial_day_always_last_monday(self, year):
        """Memorial Day is always a Monday."""
        rule = STANDARD_HOLIDAYS["memorial"]
        d = resolve_holiday(rule, year)
        assert d.weekday() == 0  # Monday
        # And it should be in May
        assert d.month == 5
        # And it should be the last Monday (no more Mondays in May after it)
        from datetime import timedelta
        next_monday = d + timedelta(days=7)
        assert next_monday.month != 5
