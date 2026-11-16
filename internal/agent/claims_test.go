package agent

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/tharabyte/bava/internal/space"
)

func TestClaimsHoldPagesUntilReleased(t *testing.T) {
	var told [][]string
	c := NewClaims(func(pages []string) { told = append(told, pages) })
	if err := c.Check("Notes.md"); !errors.Is(err, ErrNotClaimed) {
		t.Fatalf("an unclaimed page: %v", err)
	}
	if err := c.Take("Notes.md"); err != nil {
		t.Fatal(err)
	}
	if err := c.Take("Designs/Ingest.md"); err != nil {
		t.Fatal(err)
	}
	if err := c.Check("Notes.md"); err != nil {
		t.Fatalf("a claimed page: %v", err)
	}
	if got := c.Held(); !slices.Equal(got, []string{"Designs/Ingest.md", "Notes.md"}) {
		t.Fatalf("held: %v", got)
	}
	if !c.Release("Notes.md") || c.Release("Notes.md") {
		t.Fatal("release answered wrongly")
	}
	if err := c.Check("Notes.md"); !errors.Is(err, ErrNotClaimed) {
		t.Fatalf("a released page: %v", err)
	}
	if last := told[len(told)-1]; !slices.Equal(last, []string{"Designs/Ingest.md"}) {
		t.Fatalf("the window was told %v", last)
	}
}

func TestClaimsStopRefusesTheRestOfTheRound(t *testing.T) {
	c := NewClaims(nil)
	_ = c.Take("Notes.md")
	_ = c.Take("Other.md")
	c.Stop("Notes.md")
	if err := c.Check("Notes.md"); !errors.Is(err, ErrStopped) {
		t.Fatalf("a change after Stop: %v", err)
	}
	if err := c.Take("Notes.md"); !errors.Is(err, ErrStopped) {
		t.Fatalf("a claim after Stop in the same round: %v", err)
	}
	// The round ends with its last claim; the next one may claim the page.
	c.Release("Other.md")
	if err := c.Take("Notes.md"); err != nil {
		t.Fatalf("a claim in a new round: %v", err)
	}
}

func TestClaimsAllReleasedAtOnce(t *testing.T) {
	c := NewClaims(nil)
	_ = c.Take("A.md")
	_ = c.Take("B.md")
	c.ReleaseAll()
	if len(c.Held()) != 0 {
		t.Fatalf("held after ReleaseAll: %v", c.Held())
	}
}

// claimPage answers a claim question as the window does: the page saved
// first when it is open, then whether it is locked.
type claimPage struct {
	*standIn
	mu     sync.Mutex
	locked map[string]bool
	asked  []claimArgs
}

func (p *claimPage) Ask(ctx context.Context, kind string, args any) (json.RawMessage, error) {
	if kind == askClaim {
		a := args.(claimArgs)
		p.mu.Lock()
		p.asked = append(p.asked, a)
		p.mu.Unlock()
		return json.Marshal(claimAnswer{Locked: p.locked[a.Path]})
	}
	return p.standIn.Ask(ctx, kind, args)
}

func editSession(t *testing.T, page *claimPage, claims *Claims) func(name string, args map[string]any) (string, bool) {
	t.Helper()
	tools := append(LookTools(page), EditTools(page, claims)...)
	_, port := started(t, tools...)
	session, err := connect(t, port, testCode)
	if err != nil {
		t.Fatal(err)
	}
	return func(name string, args map[string]any) (string, bool) { return call(t, session, name, args) }
}

func TestClaimPageAsksThePageAndHoldsIt(t *testing.T) {
	root := lookSpace(t)
	page := &claimPage{standIn: &standIn{root: root, open: &space.OpenPage{Path: "Notes.md"}}, locked: map[string]bool{}}
	claims := NewClaims(nil)
	run := editSession(t, page, claims)

	got, isErr := run("claim_page", map[string]any{"path": "Notes.md"})
	if isErr || !strings.Contains(got, "Claimed Notes.md") {
		t.Fatalf("claim_page: %q", got)
	}
	if err := claims.Check("Notes.md"); err != nil {
		t.Fatalf("not held after claim_page: %v", err)
	}
	// The open page is asked without its file: it saves what is typed first.
	if len(page.asked) != 1 || page.asked[0].File != nil {
		t.Fatalf("asked: %+v", page.asked)
	}
	// A closed page is asked with its file, to read whether it is locked.
	if _, isErr := run("claim_page", map[string]any{"path": "Designs/Ingest.md"}); isErr {
		t.Fatal("claiming a closed page failed")
	}
	if page.asked[1].File == nil {
		t.Fatalf("a closed page was asked without its file: %+v", page.asked[1])
	}

	got, _ = run("release_page", map[string]any{"path": "Notes.md"})
	if !strings.Contains(got, "Released Notes.md") {
		t.Fatalf("release_page: %q", got)
	}
	if err := claims.Check("Notes.md"); !errors.Is(err, ErrNotClaimed) {
		t.Fatalf("held after release_page: %v", err)
	}
}

func TestClaimPageRefusesALockedPage(t *testing.T) {
	page := &claimPage{standIn: &standIn{root: lookSpace(t)}, locked: map[string]bool{"Notes.md": true}}
	claims := NewClaims(nil)
	run := editSession(t, page, claims)
	got, isErr := run("claim_page", map[string]any{"path": "Notes.md"})
	if !isErr || !strings.Contains(got, "locked") {
		t.Fatalf("claiming a locked page: %q", got)
	}
	if len(claims.Held()) != 0 {
		t.Fatal("a locked page was held")
	}
}

func TestClaimPageRefusesWhatTheSpaceRefuses(t *testing.T) {
	page := &claimPage{standIn: &standIn{root: lookSpace(t)}, locked: map[string]bool{}}
	run := editSession(t, page, NewClaims(nil))
	for _, p := range []string{"../outside.md", ".hidden.md", "Missing.md"} {
		if _, isErr := run("claim_page", map[string]any{"path": p}); !isErr {
			t.Errorf("claimed %q", p)
		}
	}
	if len(page.asked) != 0 {
		t.Fatalf("the page was asked about a refused path: %+v", page.asked)
	}
}

func TestClaimPageAfterStopIsRefusedWithWhy(t *testing.T) {
	page := &claimPage{standIn: &standIn{root: lookSpace(t)}, locked: map[string]bool{}}
	claims := NewClaims(nil)
	run := editSession(t, page, claims)
	_, _ = run("claim_page", map[string]any{"path": "Notes.md"})
	_, _ = run("claim_page", map[string]any{"path": "Designs/Ingest.md"})
	claims.Stop("Notes.md")
	got, isErr := run("claim_page", map[string]any{"path": "Notes.md"})
	if !isErr || !strings.Contains(got, "stopped") {
		t.Fatalf("claim after Stop: %q", got)
	}
}

// The common case: one page, stopped. The agent may not take it back.
func TestClaimsStopOnTheOnlyClaimStillRefuses(t *testing.T) {
	c := NewClaims(nil)
	_ = c.Take("Notes.md")
	c.Stop("Notes.md")
	if err := c.Take("Notes.md"); !errors.Is(err, ErrStopped) {
		t.Fatalf("a claim after Stop on the only claim: %v", err)
	}
	// Finishing other work ends the round; then the page may be claimed again.
	_ = c.Take("Other.md")
	c.Release("Other.md")
	if err := c.Take("Notes.md"); err != nil {
		t.Fatalf("a claim in a later round: %v", err)
	}
}

// A claim the page could not answer gives the page back.
func TestClaimPageThatFailsGivesThePageBack(t *testing.T) {
	var told [][]string
	claims := NewClaims(func(pages []string) { told = append(told, pages) })
	page := &failingClaim{standIn: &standIn{root: lookSpace(t)}}
	e := edit{look: look{page: page}, claims: claims}
	if _, err := e.claimPage(context.Background(), pathIn{Path: "Notes.md"}); err == nil {
		t.Fatal("a failed claim answered")
	}
	if len(told) == 0 || len(told[len(told)-1]) != 0 {
		t.Fatalf("the window was not given the page back: %v", told)
	}
}

type failingClaim struct{ *standIn }

func (p *failingClaim) Ask(ctx context.Context, kind string, args any) (json.RawMessage, error) {
	if kind == askClaim {
		return nil, ErrNoAnswer
	}
	return p.standIn.Ask(ctx, kind, args)
}
