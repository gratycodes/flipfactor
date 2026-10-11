package checksum

import (
	"testing"
	"time"
)

func TestChecksumIsFast(t *testing.T) {
	started := time.Now()
	Checksum(600_000)
	if elapsed := time.Since(started); elapsed > 250*time.Millisecond {
		t.Fatalf("took %s, budget 250ms", elapsed)
	}
}
