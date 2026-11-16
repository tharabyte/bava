package secrets

import (
	"crypto/rand"
	"os"
	"strings"
	"testing"
)

// TestSystemSafe writes to the real safe of this machine, so it runs only
// when asked (BAVA_SYSTEM_SAFE=1), on CI's own machines. It uses a name of
// its own and removes it.
func TestSystemSafe(t *testing.T) {
	if os.Getenv("BAVA_SYSTEM_SAFE") != "1" {
		t.Skip("writes to this machine's password safe; set BAVA_SYSTEM_SAFE=1")
	}
	name := "test-" + rand.Text()
	safe := System()
	t.Cleanup(func() { _ = safe.Delete(name) })
	long := strings.Repeat("k", 6000)
	if err := safe.Set(name, long); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if got, err := safe.Get(name); err != nil || got != long {
		t.Fatalf("Get: %d bytes, %v", len(got), err)
	}
	if err := safe.Delete(name); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := safe.Get(name); err != ErrNotFound {
		t.Fatalf("Get after Delete: %v", err)
	}
}
