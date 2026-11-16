package secrets

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func fixedKey(b byte) keyFunc {
	return func() ([]byte, error) { return bytes.Repeat([]byte{b}, 64), nil }
}

func TestSealedRoundTrip(t *testing.T) {
	roundTrip(t, &fileSafe{path: filepath.Join(t.TempDir(), "keys.sealed"), key: fixedKey(7)})
}

func TestSealedFileHoldsNoPlainText(t *testing.T) {
	path := filepath.Join(t.TempDir(), "keys.sealed")
	safe := &fileSafe{path: path, key: fixedKey(7)}
	if err := safe.Set("anthropic", "sk-ant-very-secret-value"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read sealed file: %v", err)
	}
	for _, plain := range []string{"sk-ant-very-secret-value", "anthropic"} {
		if bytes.Contains(data, []byte(plain)) {
			t.Fatalf("sealed file holds %q in plain text", plain)
		}
	}
	if runtimeCanCheckModes() {
		info, _ := os.Stat(path)
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("sealed file mode: got %v, want 0600", info.Mode().Perm())
		}
	}
}

func TestSealedFileFailsWithAnotherKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "keys.sealed")
	if err := (&fileSafe{path: path, key: fixedKey(7)}).Set("anthropic", "sk-ant"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	_, err := (&fileSafe{path: path, key: fixedKey(8)}).Get("anthropic")
	if err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("Get with another key: got %v, want an open error", err)
	}
}

func TestSealedNonceIsFreshPerWrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "keys.sealed")
	safe := &fileSafe{path: path, key: fixedKey(7)}
	_ = safe.Set("a", "same")
	first, _ := os.ReadFile(path)
	_ = safe.Set("a", "same")
	second, _ := os.ReadFile(path)
	if bytes.Equal(first, second) {
		t.Fatal("two writes of the same value sealed the same bytes")
	}
}

func TestNoSafeWritesNothing(t *testing.T) {
	dir := t.TempDir()
	safe := &fileSafe{path: filepath.Join(dir, "keys.sealed"), key: func() ([]byte, error) { return nil, ErrNoSafe }}
	if err := safe.Set("anthropic", "sk-ant"); !errors.Is(err, ErrNoSafe) {
		t.Fatalf("Set: got %v, want ErrNoSafe", err)
	}
	if _, err := safe.Get("anthropic"); !errors.Is(err, ErrNoSafe) {
		t.Fatalf("Get: got %v, want ErrNoSafe", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("no safe still wrote %d files", len(entries))
	}
	if err := (noSafe{}).Set("anthropic", "sk-ant"); !errors.Is(err, ErrNoSafe) {
		t.Fatalf("noSafe Set: got %v, want ErrNoSafe", err)
	}
}
