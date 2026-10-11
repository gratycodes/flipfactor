package reports

import "time"

// ReportDay has a bug: it formats the local calendar day.
func ReportDay(ts time.Time) string { return ts.Local().Format("2006-01-02") }
