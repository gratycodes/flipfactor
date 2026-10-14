import os
import tempfile
import time

PATH = os.path.join(tempfile.gettempdir(), f"flipfactor-fixture-{os.getuid()}.json")


def _settle(seconds: float) -> None:
    # Busy-wait on the monotonic clock. time.sleep can hang under libfaketime
    # when CLOCK_REALTIME is frozen, which falsely blames the clock axis.
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        pass


def roundtrip(payload: str, settle_seconds: float = 0.6) -> str:
    # Bug: every caller shares one fixed temp file.
    with open(PATH, "w", encoding="utf-8") as handle:
        handle.write(payload)
    _settle(settle_seconds)
    with open(PATH, encoding="utf-8") as handle:
        return handle.read()
