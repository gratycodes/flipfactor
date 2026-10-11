import hashlib


def checksum(rounds: int = 140_000) -> str:
    digest = b"seed"
    for _ in range(rounds):
        digest = hashlib.sha256(digest).digest()
    return digest.hex()
