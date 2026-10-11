_REGISTRY: set[str] = {"alpha"}


def register(name: str) -> None:
    _REGISTRY.add(name)


def available() -> set[str]:
    return set(_REGISTRY)
