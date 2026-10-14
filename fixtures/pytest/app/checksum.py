import hashlib


def checksum(rounds: int = 400_000) -> str:
    digest = b"seed"
    for _ in range(rounds):
        digest = hashlib.sha256(digest).digest()
    return digest.hex()
