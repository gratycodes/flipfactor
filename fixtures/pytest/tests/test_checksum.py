import time

from app.checksum import checksum


def test_checksum_is_fast():
    started = time.perf_counter()
    checksum()
    assert time.perf_counter() - started < 0.25
