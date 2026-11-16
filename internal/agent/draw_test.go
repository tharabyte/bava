package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestDrawDiagramBadD2AnswersItsErrorsAndPlacesNothing(t *testing.T) {
	page := &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	_, err := applyEdit(t, page, claims).drawDiagram(context.Background(), drawIn{Path: "Notes.md", D2: "a -> b\nc: {\n"})
	if err == nil || !strings.Contains(err.Error(), "does not compile") || !strings.Contains(err.Error(), "line ") {
		t.Fatalf("bad D2: %v", err)
	}
	if len(page.asked) != 0 {
		t.Fatal("a diagram that did not compile reached the page")
	}
}

func TestDrawDiagramSendsTheLayoutToThePage(t *testing.T) {
	page := &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}
	claims := NewClaims(nil)
	_ = claims.Take("Notes.md")
	if _, err := applyEdit(t, page, claims).drawDiagram(context.Background(), drawIn{Path: "Notes.md", D2: "writer -> queue -> db"}); err != nil {
		t.Fatalf("draw: %v", err)
	}
	var change struct {
		Version string `json:"version"`
		Canvas  []struct {
			Op     string `json:"op"`
			Layout struct {
				Shapes      []map[string]any `json:"shapes"`
				Connections []map[string]any `json:"connections"`
			} `json:"layout"`
		} `json:"canvas"`
	}
	if err := json.Unmarshal(page.asked[0].Edit, &change); err != nil {
		t.Fatal(err)
	}
	if change.Version != "" || len(change.Canvas) != 1 || change.Canvas[0].Op != "diagram" {
		t.Fatalf("change sent: %s", page.asked[0].Edit)
	}
	if len(change.Canvas[0].Layout.Shapes) != 3 || len(change.Canvas[0].Layout.Connections) != 2 {
		t.Fatalf("layout: %d shapes, %d connections", len(change.Canvas[0].Layout.Shapes), len(change.Canvas[0].Layout.Connections))
	}
}

func TestDrawDiagramOnAnUnclaimedPageIsRefused(t *testing.T) {
	page := &applyPage{standIn: &standIn{root: lookSpace(t)}, answer: appended}
	_, err := applyEdit(t, page, NewClaims(nil)).drawDiagram(context.Background(), drawIn{Path: "Notes.md", D2: "a -> b"})
	if err == nil || !strings.Contains(err.Error(), "Claim Notes.md") {
		t.Fatalf("unclaimed: %v", err)
	}
}
