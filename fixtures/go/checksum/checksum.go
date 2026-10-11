package checksum

import (
	"crypto/sha256"
	"encoding/hex"
)

func Checksum(rounds int) string {
	digest := []byte("seed")
	for i := 0; i < rounds; i++ {
		sum := sha256.Sum256(digest)
		digest = sum[:]
	}
	return hex.EncodeToString(digest)
}
