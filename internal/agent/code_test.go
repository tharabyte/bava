package agent

import (
	"errors"
	"regexp"
	"testing"

	"github.com/tharabyte/bava/internal/secrets"
)

var codeShape = regexp.MustCompile(`^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$`)

func TestNewCodeShape(t *testing.T) {
	seen := map[string]bool{}
	for range 200 {
		code, err := randomCode()
		if err != nil {
			t.Fatalf("randomCode: %v", err)
		}
		if !codeShape.MatchString(code) {
			t.Fatalf("code %q is not four groups of four", code)
		}
		if seen[code] {
			t.Fatalf("code %q came twice", code)
		}
		seen[code] = true
	}
}

func TestLoadCodeKeepsTheCode(t *testing.T) {
	safe := secrets.NewMemory()
	first, err := LoadCode(safe)
	if err != nil {
		t.Fatalf("LoadCode: %v", err)
	}
	again, _ := LoadCode(safe)
	if again != first {
		t.Fatalf("code changed between loads: %q then %q", first, again)
	}
	fresh, err := NewCode(safe)
	if err != nil || fresh == first {
		t.Fatalf("NewCode: %q, %v", fresh, err)
	}
	if kept, _ := LoadCode(safe); kept != fresh {
		t.Fatalf("new code not kept: got %q, want %q", kept, fresh)
	}
}

func TestLoadCodeWithNoSafeStillGivesACode(t *testing.T) {
	code, err := LoadCode(noSafeForTest{})
	if !errors.Is(err, secrets.ErrNoSafe) {
		t.Fatalf("err: got %v, want ErrNoSafe", err)
	}
	if !codeShape.MatchString(code) {
		t.Fatalf("no code for the session: %q", code)
	}
}

type noSafeForTest struct{}

func (noSafeForTest) Get(string) (string, error) { return "", secrets.ErrNoSafe }
func (noSafeForTest) Set(string, string) error   { return secrets.ErrNoSafe }
func (noSafeForTest) Delete(string) error        { return secrets.ErrNoSafe }
