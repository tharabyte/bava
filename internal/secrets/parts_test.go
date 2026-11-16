package secrets

import (
	"errors"
	"strings"
	"testing"
)

// fakeCreds stands in for Credential Manager: it refuses a blob over the
// limit, as the real one does.
type fakeCreds map[string]cred

func (f fakeCreds) read(target string) (cred, error) {
	c, ok := f[target]
	if !ok {
		return cred{}, ErrNotFound
	}
	return c, nil
}

func (f fakeCreds) write(target string, c cred) error {
	if len(c.blob) > partSize {
		return errors.New("blob over the limit")
	}
	f[target] = c
	return nil
}

func (f fakeCreds) remove(target string) error {
	if _, ok := f[target]; !ok {
		return ErrNotFound
	}
	delete(f, target)
	return nil
}

func TestPartsRoundTrip(t *testing.T) {
	roundTrip(t, partsSafe{store: fakeCreds{}})
}

func TestPartsLongValueComesBackWhole(t *testing.T) {
	store := fakeCreds{}
	safe := partsSafe{store: store}
	long := strings.Repeat("0123456789", 700) // 7,000 bytes: three parts
	if err := safe.Set("openai", long); err != nil {
		t.Fatalf("Set: %v", err)
	}
	if len(store) != 3 {
		t.Fatalf("parts written: got %d, want 3", len(store))
	}
	got, err := safe.Get("openai")
	if err != nil || got != long {
		t.Fatalf("Get: %d bytes, %v; want %d bytes", len(got), err, len(long))
	}
}

func TestPartsShorterValueLeavesNoOldParts(t *testing.T) {
	store := fakeCreds{}
	safe := partsSafe{store: store}
	if err := safe.Set("openai", strings.Repeat("x", 3*partSize)); err != nil {
		t.Fatalf("Set long: %v", err)
	}
	if err := safe.Set("openai", "short"); err != nil {
		t.Fatalf("Set short: %v", err)
	}
	if len(store) != 1 {
		t.Fatalf("parts left: got %d, want 1", len(store))
	}
	if got, _ := safe.Get("openai"); got != "short" {
		t.Fatalf("Get: got %q", got)
	}
	if err := safe.Delete("openai"); err != nil || len(store) != 0 {
		t.Fatalf("Delete: %v, %d parts left", err, len(store))
	}
}

func TestPartsMissingPartIsAnError(t *testing.T) {
	store := fakeCreds{}
	safe := partsSafe{store: store}
	if err := safe.Set("openai", strings.Repeat("x", 2*partSize+1)); err != nil {
		t.Fatalf("Set: %v", err)
	}
	delete(store, partTarget("openai", 1))
	if _, err := safe.Get("openai"); err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("Get with a part missing: got %v, want a broken-value error", err)
	}
}

func TestPartTargetsAreUnderTheService(t *testing.T) {
	if got := partTarget("openai", 0); got != "com.tharabyte.bava/openai" {
		t.Fatalf("first part: got %q", got)
	}
	if got := partTarget("openai", 2); got != "com.tharabyte.bava/openai#2" {
		t.Fatalf("third part: got %q", got)
	}
}
