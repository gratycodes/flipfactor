import random

TEAM = ["asha", "bruno", "chen", "dara", "intern"]


def reviewers(k: int = 2) -> list[str]:
    return random.sample(TEAM, k)
