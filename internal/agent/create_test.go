package agent

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreatePageMakesAClaimedEmptyPage(t *testing.T) {
	root := lookSpace(t)
	claims := NewClaims(nil)
	e := applyEdit(t, &applyPage{standIn: &standIn{root: root}, answer: appended}, claims)
	got, err := e.createPage(context.Background(), createIn{Folder: "Designs", Name: "Overview"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "Created Designs/Overview.md") {
		t.Fatalf("answer: %q", got)
	}
	data, err := os.ReadFile(filepath.Join(root, "Designs", "Overview.md"))
	if err != nil || len(data) != 0 {
		t.Fatalf("page: %q, %v", data, err)
	}
	if err := claims.Check("Designs/Overview.md"); err != nil {
		t.Fatalf("a new page starts claimed: %v", err)
	}
}

func TestCreatePageNumbersATakenName(t *testing.T) {
	root := lookSpace(t)
	e := applyEdit(t, &applyPage{standIn: &standIn{root: root}, answer: appended}, NewClaims(nil))
	got, err := e.createPage(context.Background(), createIn{Name: "Notes"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "Created Notes 2.md") {
		t.Fatalf("answer: %q", got)
	}
}

func TestCreatePageRefusesOutsideTheSpace(t *testing.T) {
	e := applyEdit(t, &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}, NewClaims(nil))
	for _, in := range []createIn{{Folder: "../elsewhere", Name: "X"}, {Name: "a/b"}, {Name: ""}} {
		if _, err := e.createPage(context.Background(), in); err == nil {
			t.Errorf("created %+v", in)
		}
	}
}
