package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
)

// The canvas changes an agent may ask for; Bava's own steps (a drawn
// diagram's insert) are not among them.
var canvasOps = []string{"add", "update", "remove", "connect", "group", "frame", "arrange"}

// The document changes an agent may ask for.
var documentOps = []string{"insert", "replace", "remove", "move"}

type changeIn struct {
	Path    string            `json:"path"`
	Version string            `json:"version"`
	Changes []json.RawMessage `json:"changes"`
}

// changeTools change a page the AI holds, against the version it read.
func changeTools(e edit) []Tool {
	changes := func(ops []string, about string) map[string]any {
		return map[string]any{
			"type":        "array",
			"description": about,
			"items": map[string]any{
				"type":       "object",
				"properties": map[string]any{"op": map[string]any{"type": "string", "enum": ops}},
				"required":   []string{"op"},
			},
		}
	}
	return []Tool{
		textTool("change_canvas", "Changes the canvas of a page you claimed, against the version read_page gave. Each change names elements by id: add {element}, update {id, set}, remove {id}, connect {from, to, fromRow?, toRow?, label?, id?}, group {ids}, frame {ids, label?}, arrange {ids, how: front|back|left|centre|right|top|middle|bottom}. Colours are Bava's swatches (gray, blue, green, yellow, orange, red, purple, pink); sizes are Bava's steps. Bava measures text, sizes shapes to their labels and routes arrows. Pen strokes and pictures are never added; locked elements refuse. The answer lists what was applied and refused, and the page as it now reads.",
			object(map[string]any{
				"path":    stringProperty("The page's path in the Space."),
				"version": stringProperty("The version from read_page."),
				"changes": changes(canvasOps, "The changes, applied in order as one step."),
			}, "path", "version", "changes"),
			func(ctx context.Context, in changeIn) (string, error) { return e.change(ctx, in, "canvas", canvasOps) }),
		textTool("change_document", "Changes the document of a page you claimed, against the version read_page gave. Each change names blocks by the numbers read_page gave (b1, b2, ...), which hold for the whole list: insert {after?, markdown} (no after: at the start), replace {block, markdown}, remove {block}, move {block, after?}. Write blocks as Markdown. Web links, web cards, pictures, videos and raw HTML are never added or changed, only removed. The answer lists what was applied and refused, and the page as it now reads.",
			object(map[string]any{
				"path":    stringProperty("The page's path in the Space."),
				"version": stringProperty("The version from read_page."),
				"changes": changes(documentOps, "The changes, applied in order as one step."),
			}, "path", "version", "changes"),
			func(ctx context.Context, in changeIn) (string, error) {
				return e.change(ctx, in, "document", documentOps)
			}),
	}
}

func (e edit) change(ctx context.Context, in changeIn, part string, allowed []string) (string, error) {
	if in.Version == "" {
		return "", refuse("Give the version read_page gave; read the page first.")
	}
	if len(in.Changes) == 0 {
		return "", refuse("Give at least one change.")
	}
	for i, raw := range in.Changes {
		var head struct {
			Op string `json:"op"`
		}
		if json.Unmarshal(raw, &head) != nil || !slices.Contains(allowed, head.Op) {
			return "", refuse("Change %d: %q is not a %s change; use one of %v.", i+1, head.Op, part, allowed)
		}
	}
	change, err := json.Marshal(map[string]any{"version": in.Version, part: in.Changes})
	if err != nil {
		return "", fmt.Errorf("change: %w", err)
	}
	return e.apply(ctx, in.Path, change)
}
