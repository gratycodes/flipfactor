import os
from pathlib import Path

import pytest

PACKAGE_ROOT = str(Path(__file__).resolve().parent.parent)


@pytest.fixture(autouse=True)
def _plugin_importable(monkeypatch: pytest.MonkeyPatch) -> None:
    # pytester's subprocesses run in a temp dir; make the plugin importable there.
    existing = os.environ.get("PYTHONPATH")
    monkeypatch.setenv("PYTHONPATH", PACKAGE_ROOT + (os.pathsep + existing if existing else ""))
    for var in ("FLIPFACTOR_ORDER", "FLIPFACTOR_SEED", "FLIPFACTOR_SHUFFLE", "FLIPFACTOR_REPORT"):
        monkeypatch.delenv(var, raising=False)
