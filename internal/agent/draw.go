package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tharabyte/bava/internal/render"
)

type drawIn struct {
	Path string `json:"path"`
	D2   string `json:"d2"`
}

// drawDiagram lays the D2 out through Bava's one render path and places the
// result on the page as ordinary elements; a diagram that does not compile
// places nothing, and its errors go back to the agent.
func (e edit) drawDiagram(ctx context.Context, in drawIn) (string, error) {
	if strings.TrimSpace(in.D2) == "" {
		return "", refuse("Give the diagram in D2.")
	}
	result, err := render.Render(ctx, in.D2, render.Options{})
	if err != nil {
		return "", refuse("The diagram could not be laid out.")
	}
	if len(result.Errors) > 0 {
		var b strings.Builder
		b.WriteString("The D2 does not compile, so nothing was placed. Fix these and call again:\n")
		for _, d := range result.Errors {
			fmt.Fprintf(&b, "line %d: %s\n", d.Line, d.Message)
		}
		return "", refusal{b.String()}
	}
	if len(result.Layout.Shapes) == 0 && len(result.Layout.Connections) == 0 {
		return "", refuse("The D2 draws nothing.")
	}
	change, err := json.Marshal(map[string]any{
		"version": "",
		"canvas":  []any{map[string]any{"op": "diagram", "layout": result.Layout}},
	})
	if err != nil {
		return "", err
	}
	return e.apply(ctx, in.Path, change)
}
