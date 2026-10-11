package plugins

import "sort"

var registry = map[string]bool{"alpha": true}

func Register(name string) { registry[name] = true }

func Available() []string {
	out := make([]string, 0, len(registry))
	for k := range registry {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
