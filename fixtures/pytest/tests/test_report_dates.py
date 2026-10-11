from datetime import datetime, timezone

from app.reports import report_day

# 2026-03-01 19:00 UTC: still March 1st in UTC and the Americas,
# already March 2nd in India, New Zealand and Kiribati.
EVENING_UTC = datetime(2026, 3, 1, 19, 0, tzinfo=timezone.utc).timestamp()


def test_report_day():
    assert report_day(EVENING_UTC) == "2026-03-01"
