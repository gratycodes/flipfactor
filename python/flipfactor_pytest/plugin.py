"""pytest plugin that flipfactor loads into every run it makes.

It does three things and nothing else:

* runs the selected tests in exactly the order given in ``FLIPFACTOR_ORDER``
  (a JSON list of node ids), or shuffles them with ``FLIPFACTOR_SHUFFLE``;
* reseeds ``random`` (and numpy, if it is importable) before each test when
  ``FLIPFACTOR_SEED`` is set;
* writes one JSON line per test outcome to ``FLIPFACTOR_REPORT``.

It is inert when none of those variables are set, so it is safe to leave on.
"""

from __future__ import annotations

import json
import os
import random
from typing import Any

import pytest

_outcomes: dict[str, dict[str, Any]] = {}


def _is_xdist_worker(config: pytest.Config) -> bool:
    return hasattr(config, "workerinput")


def apply_order(items: list[Any], wanted: list[str]) -> tuple[list[Any], list[Any], list[str]]:
    """Return (selected, deselected, missing) with ``selected`` in ``wanted`` order."""
    by_id: dict[str, Any] = {}
    for item in items:
        by_id.setdefault(item.nodeid, item)
    wanted_set = set(wanted)
    selected = [by_id[node_id] for node_id in wanted if node_id in by_id]
    deselected = [item for item in items if item.nodeid not in wanted_set]
    missing = [node_id for node_id in wanted if node_id not in by_id]
    return selected, deselected, missing


def pytest_collection_modifyitems(session: pytest.Session, config: pytest.Config, items: list[Any]) -> None:
    order = os.environ.get("FLIPFACTOR_ORDER")
    if order:
        selected, deselected, missing = apply_order(items, json.loads(order))
        if deselected:
            config.hook.pytest_deselected(items=deselected)
        items[:] = selected
        for node_id in missing:
            _outcomes[node_id] = {"id": node_id, "outcome": "missing", "durationMs": 0}
    shuffle = os.environ.get("FLIPFACTOR_SHUFFLE")
    if shuffle:
        random.Random(int(shuffle)).shuffle(items)


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_setup(item: pytest.Item) -> None:
    seed = os.environ.get("FLIPFACTOR_SEED")
    if not seed:
        return
    random.seed(int(seed))
    try:  # pragma: no cover - numpy is optional
        import numpy

        numpy.random.seed(int(seed) % (2**32))
    except ImportError:
        pass


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    entry = _outcomes.setdefault(report.nodeid, {"id": report.nodeid, "outcome": "pass", "durationMs": 0})
    if report.when == "call":
        entry["durationMs"] = round(report.duration * 1000, 3)
    if report.failed:
        entry["outcome"] = "fail"
        if report.longrepr is not None and "message" not in entry:
            text = str(report.longrepr)
            entry["message"] = text.strip().splitlines()[-1][:300] if text.strip() else ""
    elif report.skipped and entry["outcome"] == "pass":
        entry["outcome"] = "skip"


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    path = os.environ.get("FLIPFACTOR_REPORT")
    if not path or _is_xdist_worker(session.config):
        return
    with open(path, "w", encoding="utf-8") as handle:
        for entry in _outcomes.values():
            handle.write(json.dumps(entry) + "\n")
