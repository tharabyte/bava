package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestChangeCanvasSendsTheChangesAgainstTheVersion(t *testing.T) {
	page := &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	e := applyEdit(t, page, claims)
	in := changeIn{Path: "Notes.md", Version: "1a2b3c4d", Changes: []json.RawMessage{json.RawMessage(`{"op":"update","id":"e1","set":{"label":"X"}}`)}}
	if _, err := e.change(context.Background(), in, "canvas", canvasOps); err != nil {
		t.Fatal(err)
	}
	if got := string(page.asked[0].Edit); got != `{"canvas":[{"op":"update","id":"e1","set":{"label":"X"}}],"version":"1a2b3c4d"}` {
		t.Fatalf("sent: %s", got)
	}
}

func TestChangeRefusesBavasOwnStepsAndAMissingVersion(t *testing.T) {
	page := &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	e := applyEdit(t, page, claims)
	for _, op := range []string{`{"op":"insert","elements":[]}`, `{"op":"diagram"}`, `{"nope":1}`} {
		in := changeIn{Path: "Notes.md", Version: "v", Changes: []json.RawMessage{json.RawMessage(op)}}
		if _, err := e.change(context.Background(), in, "canvas", canvasOps); err == nil || !strings.Contains(err.Error(), "not a canvas change") {
			t.Errorf("%s: %v", op, err)
		}
	}
	in := changeIn{Path: "Notes.md", Changes: []json.RawMessage{json.RawMessage(`{"op":"remove","block":"b1"}`)}}
	if _, err := e.change(context.Background(), in, "document", documentOps); err == nil || !strings.Contains(err.Error(), "version") {
		t.Errorf("no version: %v", err)
	}
	if len(page.asked) != 0 {
		t.Fatal("a refused change reached the page")
	}
}

func TestEditToolsAreTheEditMenu(t *testing.T) {
	var names []string
	for _, tool := range EditTools(&standIn{}, NewClaims(nil)) {
		names = append(names, tool.Def.Name)
	}
	if got := strings.Join(names, " "); got != "claim_page draw_diagram create_page release_page change_canvas change_document" {
		t.Fatalf("edit tools: %s", got)
	}
}
