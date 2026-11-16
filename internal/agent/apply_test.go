package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tharabyte/bava/internal/format"
	"github.com/tharabyte/bava/internal/space"
)

// applyPage answers an apply question as the window does, through the
// worker for a closed page: here, by appending a line to the prose.
type applyPage struct {
	*standIn
	answer func(a applyArgs) applyAnswer
	asked  []applyArgs
}

func (p *applyPage) Ask(ctx context.Context, kind string, args any) (json.RawMessage, error) {
	if kind == askApply {
		a := args.(applyArgs)
		p.asked = append(p.asked, a)
		return json.Marshal(p.answer(a))
	}
	return p.standIn.Ask(ctx, kind, args)
}

func appended(a applyArgs) applyAnswer {
	answer := applyAnswer{Text: "Page: " + a.Path, Report: applyReport{Applied: []string{"inserted a block after b2"}}}
	if a.File != nil {
		answer.File = &pageFile{Source: a.File.Source + "\nAdded by the AI.\n", Scene: a.File.Scene}
	}
	return answer
}

func applyEdit(t *testing.T, page *applyPage, claims *Claims) edit {
	t.Helper()
	return edit{look: look{page: page}, claims: claims}
}

func TestApplyRefusesAnUnclaimedPage(t *testing.T) {
	page := &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}
	_, err := applyEdit(t, page, NewClaims(nil)).apply(context.Background(), "Notes.md", json.RawMessage(`{}`))
	if err == nil || !strings.Contains(err.Error(), "Claim Notes.md") {
		t.Fatalf("an unclaimed page: %v", err)
	}
	if len(page.asked) != 0 {
		t.Fatal("the page was asked to change an unclaimed page")
	}
}

func TestApplyToAClosedPageSavesItsNewFile(t *testing.T) {
	root := lookSpace(t)
	page := &applyPage{standIn: &standIn{root: root}, answer: appended}
	claims := NewClaims(nil)
	_ = claims.Take("Designs/Ingest.md")
	got, err := applyEdit(t, page, claims).apply(context.Background(), "Designs/Ingest.md", json.RawMessage(`{"version":"x"}`))
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !strings.Contains(got, "Applied: inserted a block after b2.") || !strings.Contains(got, "Page: Designs/Ingest.md") {
		t.Fatalf("answer: %q", got)
	}
	data, _ := os.ReadFile(filepath.Join(root, "Designs", "Ingest.md"))
	parsed, err := format.Read(string(data))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(format.Prose(parsed.Source), "Added by the AI.") || len(parsed.Scene.Elements) != 1 {
		t.Fatalf("saved file:\n%s", data)
	}
	if string(page.asked[0].Edit) != `{"version":"x"}` {
		t.Fatalf("the change reached the page as %s", page.asked[0].Edit)
	}
}

func TestApplyToTheOpenPageSavesNothingItself(t *testing.T) {
	root := lookSpace(t)
	page := &applyPage{standIn: &standIn{root: root, open: &space.OpenPage{Path: "Notes.md"}}, answer: appended}
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	before, _ := os.ReadFile(filepath.Join(root, "Notes.md"))
	if _, err := applyEdit(t, page, claims).apply(context.Background(), "Notes.md", json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(filepath.Join(root, "Notes.md"))
	if string(before) != string(after) || page.asked[0].File != nil {
		t.Fatal("the open page was written by Go, or sent its file")
	}
}

func TestApplyStaleOrLockedIsRefusedWithWhy(t *testing.T) {
	root := lookSpace(t)
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	stale := &applyPage{standIn: &standIn{root: root}, answer: func(a applyArgs) applyAnswer {
		return applyAnswer{Stale: true, Text: "Page: Notes.md\nVersion: 1234abcd"}
	}}
	_, err := applyEdit(t, stale, claims).apply(context.Background(), "Notes.md", json.RawMessage(`{}`))
	if err == nil || !strings.Contains(err.Error(), "changed since you read it") || !strings.Contains(err.Error(), "1234abcd") {
		t.Fatalf("stale: %v", err)
	}
	locked := &applyPage{standIn: &standIn{root: root}, answer: func(applyArgs) applyAnswer { return applyAnswer{Locked: true} }}
	if _, err := applyEdit(t, locked, claims).apply(context.Background(), "Notes.md", json.RawMessage(`{}`)); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("locked: %v", err)
	}
}

func TestApplyLeavesAFileChangedOnDiskMeanwhile(t *testing.T) {
	root := lookSpace(t)
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	path := filepath.Join(root, "Notes.md")
	page := &applyPage{standIn: &standIn{root: root}, answer: func(a applyArgs) applyAnswer {
		// Another program writes the file while the worker works.
		_ = os.WriteFile(path, []byte("# Rewritten elsewhere\n"), 0o644)
		return appended(a)
	}}
	_, err := applyEdit(t, page, claims).apply(context.Background(), "Notes.md", json.RawMessage(`{}`))
	if err == nil || !strings.Contains(err.Error(), "changed on disk") {
		t.Fatalf("a file changed meanwhile: %v", err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != "# Rewritten elsewhere\n" {
		t.Fatalf("the other program's file was overwritten: %q", data)
	}
}
