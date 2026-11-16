package secrets

import (
	"errors"
	"runtime"
	"testing"
)

// roundTrip is what every safe must do: keep a value, give it back, replace
// it, and forget it.
func roundTrip(t *testing.T, safe Safe) {
	t.Helper()
	if _, err := safe.Get("agent-code"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get before Set: got %v, want ErrNotFound", err)
	}
	if err := safe.Set("agent-code", "ABCD-EFGH-JKLM-NPQR"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if got, err := safe.Get("agent-code"); err != nil || got != "ABCD-EFGH-JKLM-NPQR" {
		t.Fatalf("Get: got %q, %v", got, err)
	}
	if err := safe.Set("agent-code", "WXYZ-2345-6789-ABCD"); err != nil {
		t.Fatalf("Set again: %v", err)
	}
	if got, _ := safe.Get("agent-code"); got != "WXYZ-2345-6789-ABCD" {
		t.Fatalf("Get after replace: got %q", got)
	}
	if err := safe.Set("other", "kept"); err != nil {
		t.Fatalf("Set other: %v", err)
	}
	if err := safe.Delete("agent-code"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := safe.Get("agent-code"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get after Delete: got %v, want ErrNotFound", err)
	}
	if got, _ := safe.Get("other"); got != "kept" {
		t.Fatalf("Delete took another value: got %q", got)
	}
	if err := safe.Delete("never-set"); err != nil {
		t.Fatalf("Delete of nothing: %v", err)
	}
}

func TestMemoryRoundTrip(t *testing.T) {
	roundTrip(t, NewMemory())
}

// runtimeCanCheckModes: Windows has no Unix file modes to compare.
func runtimeCanCheckModes() bool { return runtime.GOOS != "windows" }
