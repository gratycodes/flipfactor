import os
import tempfile
import time

PATH = os.path.join(tempfile.gettempdir(), f"flipfactor-fixture-{os.getuid()}.json")


def roundtrip(payload: str, settle_seconds: float = 0.6) -> str:
    # Bug: every caller shares one fixed temp file.
    with open(PATH, "w", encoding="utf-8") as handle:
        handle.write(payload)
    time.sleep(settle_seconds)
    with open(PATH, encoding="utf-8") as handle:
        return handle.read()
