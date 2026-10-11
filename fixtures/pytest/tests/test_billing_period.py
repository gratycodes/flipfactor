import re

from app.billing import next_period_label


def test_next_period_label():
    assert re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", next_period_label())
