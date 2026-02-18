"""Holiday pattern resolution for Solarseed TOU."""
from datetime import date, timedelta
import calendar

from .const import STANDARD_HOLIDAYS


def resolve_fixed(year: int, month: int, day: int) -> date:
    """Resolve a fixed-date holiday."""
    return date(year, month, day)


def resolve_nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """Resolve nth weekday of month. weekday: 0=Mon..6=Sun. n: 1-based."""
    # Find first occurrence of weekday in the month
    first_day = date(year, month, 1)
    first_weekday = first_day.weekday()
    # Days until first target weekday
    delta = (weekday - first_weekday) % 7
    first_occurrence = first_day + timedelta(days=delta)
    # Advance to nth occurrence
    return first_occurrence + timedelta(weeks=n - 1)


def resolve_last_weekday(year: int, month: int, weekday: int) -> date:
    """Resolve last weekday of month. weekday: 0=Mon..6=Sun."""
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    delta = (last_day.weekday() - weekday) % 7
    return last_day - timedelta(days=delta)


def observe_nearest_weekday(d: date) -> date:
    """If date falls on Sat, observe Fri. If Sun, observe Mon."""
    if d.weekday() == 5:  # Saturday
        return d - timedelta(days=1)
    if d.weekday() == 6:  # Sunday
        return d + timedelta(days=1)
    return d


def resolve_holiday(rule: dict, year: int) -> date:
    """Resolve a single holiday rule to a date for the given year."""
    rule_type = rule["rule"]
    if rule_type == "fixed":
        return resolve_fixed(year, rule["month"], rule["day"])
    elif rule_type == "nth":
        return resolve_nth_weekday(year, rule["month"], rule["weekday"], rule["n"])
    elif rule_type == "last":
        return resolve_last_weekday(year, rule["month"], rule["weekday"])
    raise ValueError(f"Unknown holiday rule type: {rule_type}")


def resolve_holidays_for_year(
    standard_ids: list[str],
    custom_rules: list[dict],
    year: int,
    shift_observed: bool = True,
) -> set[date]:
    """Resolve all holiday patterns to concrete dates for a given year.

    Returns a set of dates that are considered holidays.
    """
    holidays: set[date] = set()

    # Standard holidays
    for hid in standard_ids:
        rule = STANDARD_HOLIDAYS.get(hid)
        if rule is None:
            continue
        d = resolve_holiday(rule, year)
        if shift_observed:
            d = observe_nearest_weekday(d)
        holidays.add(d)

    # Custom holidays
    for rule in custom_rules:
        d = resolve_holiday(rule, year)
        if shift_observed:
            d = observe_nearest_weekday(d)
        holidays.add(d)

    return holidays
