from datetime import datetime


def report_day(epoch_seconds: float) -> str:
    # Bug: local time instead of UTC, so the day depends on the machine's TZ.
    return datetime.fromtimestamp(epoch_seconds).date().isoformat()
