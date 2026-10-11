package plugins

import (
	"reflect"
	"testing"
)

func TestAlphaLoads(t *testing.T) {
	if Available()[0] != "alpha" {
		t.Fatal("alpha missing")
	}
}

func TestRegisterPlugin(t *testing.T) {
	Register("beta")
}

func TestLookupMissing(t *testing.T) {
	for _, p := range Available() {
		if p == "gamma" {
			t.Fatal("gamma should not exist")
		}
	}
}

func TestDefaultPlugins(t *testing.T) {
	if got := Available(); !reflect.DeepEqual(got, []string{"alpha"}) {
		t.Fatalf("got %v, want [alpha]", got)
	}
}
