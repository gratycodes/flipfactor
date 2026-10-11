"""Tests for the flipfactor pytest plugin, run in-process with pytester."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from flipfactor_pytest.plugin import apply_order  # noqa: E402

pytest_plugins = ["pytester"]

OUTCOME_LINE = re.compile(r"^(test_suite\.py::\w+) (PASSED|FAILED)")

SUITE = """
import random

seen = []

def test_a():
    seen.append("a")

def test_b():
    seen.append("b")

def test_c():
    seen.append("c")
    assert seen == ["c"], seen

def test_rand():
    print("RAND", random.random())
"""


class Item:
    def __init__(self, nodeid: str) -> None:
        self.nodeid = nodeid


def test_apply_order_keeps_requested_order_and_reports_missing() -> None:
    items = [Item("t::a"), Item("t::b"), Item("t::c")]
    selected, deselected, missing = apply_order(items, ["t::c", "t::zz", "t::a"])
    assert [i.nodeid for i in selected] == ["t::c", "t::a"]
    assert [i.nodeid for i in deselected] == ["t::b"]
    assert missing == ["t::zz"]


def _report(path: Path) -> dict[str, dict]:
    return {row["id"]: row for row in map(json.loads, path.read_text().splitlines())}


def _run(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch, **env: str) -> dict[str, dict]:
    pytester.makepyfile(test_suite=SUITE)
    report = pytester.path / "report.jsonl"
    monkeypatch.setenv("FLIPFACTOR_REPORT", str(report))
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    pytester.runpytest_subprocess("-p", "flipfactor_pytest.plugin", "-s")
    return _report(report)


def test_runs_tests_in_the_exact_order_given(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> None:
    order = ["test_suite.py::test_c", "test_suite.py::test_a"]
    rows = _run(pytester, monkeypatch, FLIPFACTOR_ORDER=json.dumps(order))
    assert rows["test_suite.py::test_c"]["outcome"] == "pass"  # ran first, so seen == ["c"]
    assert rows["test_suite.py::test_a"]["outcome"] == "pass"
    assert "test_suite.py::test_b" not in rows


def test_default_order_shows_the_pollution(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> None:
    rows = _run(pytester, monkeypatch)
    assert rows["test_suite.py::test_c"]["outcome"] == "fail"
    assert "AssertionError" in rows["test_suite.py::test_c"]["message"]


def test_reports_missing_ids(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> None:
    rows = _run(pytester, monkeypatch, FLIPFACTOR_ORDER=json.dumps(["test_suite.py::test_a", "test_suite.py::nope"]))
    assert rows["test_suite.py::nope"]["outcome"] == "missing"


def test_seed_makes_random_reproducible(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> None:
    pytester.makepyfile(test_suite=SUITE)
    monkeypatch.setenv("FLIPFACTOR_SEED", "7")
    monkeypatch.setenv("FLIPFACTOR_ORDER", json.dumps(["test_suite.py::test_rand"]))
    first = pytester.runpytest_subprocess("-p", "flipfactor_pytest.plugin", "-s").stdout.str()
    second = pytester.runpytest_subprocess("-p", "flipfactor_pytest.plugin", "-s").stdout.str()
    draws = [line for line in (first + second).splitlines() if line.startswith("RAND") or "RAND" in line]
    values = [d.split("RAND", 1)[1].split()[0] for d in draws]
    assert len(values) == 2 and values[0] == values[1]


def test_shuffle_is_deterministic_per_seed(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> None:
    pytester.makepyfile(test_suite=SUITE)
    monkeypatch.setenv("FLIPFACTOR_SHUFFLE", "3")
    a = pytester.runpytest_subprocess("-p", "flipfactor_pytest.plugin", "-v").stdout.lines
    b = pytester.runpytest_subprocess("-p", "flipfactor_pytest.plugin", "-v").stdout.lines

    def order(lines: list[str]) -> list[str]:
        return [m.group(1) for m in map(OUTCOME_LINE.match, lines) if m]

    names = ["test_suite.py::test_a", "test_suite.py::test_b", "test_suite.py::test_c", "test_suite.py::test_rand"]
    assert order(a) == order(b)
    assert sorted(order(a)) == names
    assert order(a) != names


def test_inert_without_env(pytester: pytest.Pytester) -> None:
    pytester.makepyfile(test_ok="def test_ok():\n    assert True\n")
    result = pytester.runpytest_subprocess("-p", "flipfactor_pytest.plugin")
    result.assert_outcomes(passed=1)
