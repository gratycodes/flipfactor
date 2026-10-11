package reports

import (
	"testing"
	"time"
)

func TestReportDay(t *testing.T) {
	evening := time.Date(2026, 3, 1, 19, 0, 0, 0, time.UTC)
	if got := ReportDay(evening); got != "2026-03-01" {
		t.Fatalf("got %s, want 2026-03-01", got)
	}
}
