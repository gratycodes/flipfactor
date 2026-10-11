from datetime import date


def next_period_label(today: date | None = None) -> str:
    today = today or date.today()
    # Bug: month 12 + 1 = 13.
    return date(today.year, today.month + 1, 1).strftime("%Y-%m")
