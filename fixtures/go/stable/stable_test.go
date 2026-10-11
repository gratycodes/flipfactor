package stable

import "testing"

func TestAddition(t *testing.T) {
	if 1+1 != 2 {
		t.Fatal("math broke")
	}
}
