package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/tharabyte/bava/internal/format"
	"github.com/tharabyte/bava/internal/space"
)

// What the plug asks the page.
const (
	// askSpace: the Space open in the window and the page on screen, as on
	// screen (unsaved typing included), or null when no Space is open.
	askSpace = "space"
	// askPageText: a page as short text, from the editor when it is the open
	// page, or from the page worker reading the file sent with it.
	askPageText = "pageText"
	// askSelection: what is selected on the open page, as short text.
	askSelection = "selection"
	// askIcons: icon names from the bundled and custom sets.
	askIcons = "icons"
)

type spaceAnswer struct {
	Root string          `json:"root"`
	Open *space.OpenPage `json:"open"`
}

// pageFile is a closed page as the worker reads it: its prose and scene.
type pageFile struct {
	Source string       `json:"source"`
	Scene  format.Scene `json:"scene"`
}

type pageTextArgs struct {
	Path string    `json:"path"`
	File *pageFile `json:"file"`
}

type textAnswer struct {
	Text string `json:"text"`
}

type iconArgs struct {
	Query string `json:"query"`
}

type iconAnswer struct {
	Names []string `json:"names"`
}

// asking is the page's side, as the tools see it.
type asking interface {
	Ask(ctx context.Context, kind string, args any) (json.RawMessage, error)
}

// refusal is an answer the agent reads as the tool failing, with why.
type refusal struct{ text string }

func (r refusal) Error() string { return r.text }

func refuse(format string, args ...any) error { return refusal{fmt.Sprintf(format, args...)} }

func object(properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{"type": "object", "properties": properties}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func stringProperty(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

// textTool is a tool whose answer is text; an error is answered as the
// tool failing, with its text.
func textTool[In any](name, description string, schema map[string]any, run func(context.Context, In) (string, error)) Tool {
	return Tool{
		Def: &mcp.Tool{Name: name, Description: description, InputSchema: schema},
		Handle: func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			var in In
			if raw := req.Params.Arguments; len(raw) > 0 && string(raw) != "null" {
				if err := json.Unmarshal(raw, &in); err != nil {
					return failed("The arguments do not match the tool's schema."), nil
				}
			}
			text, err := run(ctx, in)
			if err != nil {
				return failed(err.Error()), nil
			}
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}, nil
		},
	}
}

func failed(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

// look is what the Look tools share: the page to ask.
type look struct{ page asking }

func ask[Out any](ctx context.Context, page asking, kind string, args any) (Out, error) {
	var out Out
	raw, err := page.Ask(ctx, kind, args)
	if err != nil {
		if errors.Is(err, ErrNoWindow) || errors.Is(err, ErrNoAnswer) {
			return out, refuse("Bava's window did not answer: %v.", err)
		}
		return out, refusal{err.Error()}
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, refuse("Bava's window answered something unreadable.")
	}
	return out, nil
}

// space is the Space open in the window, and the page on screen.
func (l look) space(ctx context.Context) (space.Space, *space.OpenPage, error) {
	answer, err := ask[*spaceAnswer](ctx, l.page, askSpace, nil)
	if err != nil {
		return space.Space{}, nil, err
	}
	if answer == nil || answer.Root == "" {
		return space.Space{}, nil, refuse("No Space is open in Bava.")
	}
	s, err := space.Load(answer.Root)
	if err != nil {
		return space.Space{}, nil, refuse("The Space open in Bava cannot be read.")
	}
	return s, answer.Open, nil
}

// LookTools read the Space and the open page; they change nothing.
func LookTools(page asking) []Tool {
	l := look{page: page}
	return []Tool{
		textTool("list_pages", "Lists the folders and pages of the Space open in Bava, in the order the user arranged them. Paths are relative to the Space.",
			object(map[string]any{}), func(ctx context.Context, _ struct{}) (string, error) { return l.listPages(ctx) }),
		textTool("search", "Finds the pages and folders holding every word of the query, in their names, documents and canvas text. The open page is searched as on screen.",
			object(map[string]any{"query": stringProperty("Words to find; capitals are ignored and a word matches the start of longer words.")}, "query"),
			l.search),
		textTool("read_page", "Reads a page as short text: its version, its document as Markdown with each block numbered (b1, b2, ...), and its canvas one line per element with its id. The open page is read as on screen.",
			object(map[string]any{"path": stringProperty("The page's path in the Space, as list_pages gives it.")}, "path"),
			l.readPage),
		textTool("read_selection", "Reads what the user has selected on the open page: canvas elements as short text, or the selected words.",
			object(map[string]any{}), func(ctx context.Context, _ struct{}) (string, error) { return l.readSelection(ctx) }),
		textTool("find_icon", "Finds icon names in Bava's bundled and custom icon sets, for placing an icon on a canvas by name.",
			object(map[string]any{"query": stringProperty("What the icon shows, such as database or queue.")}, "query"),
			l.findIcon),
	}
}

func (l look) listPages(ctx context.Context) (string, error) {
	s, _, err := l.space(ctx)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Space: %s\n", filepath.Base(s.Root))
	var walk func(folder string, depth int) error
	walk = func(folder string, depth int) error {
		entries, err := s.List(folder)
		if err != nil {
			return err
		}
		for _, e := range entries {
			indent := strings.Repeat("  ", depth)
			switch e.Kind {
			case space.KindFolder:
				fmt.Fprintf(&b, "%s%s/\n", indent, e.Path)
				_ = walk(e.Path, depth+1)
			case space.KindPage:
				fmt.Fprintf(&b, "%s%s\n", indent, e.Path)
			}
		}
		return nil
	}
	if err := walk("", 0); err != nil {
		return "", refuse("The Space cannot be listed.")
	}
	return b.String(), nil
}

type queryIn struct {
	Query string `json:"query"`
}

func (l look) search(ctx context.Context, in queryIn) (string, error) {
	if strings.TrimSpace(in.Query) == "" {
		return "", refuse("Give some words to find.")
	}
	s, open, err := l.space(ctx)
	if err != nil {
		return "", err
	}
	hits, more, err := s.Search(in.Query, open)
	if err != nil {
		return "", refuse("The search could not be run.")
	}
	if len(hits) == 0 {
		return fmt.Sprintf("Nothing found for %q.", in.Query), nil
	}
	var b strings.Builder
	for _, h := range hits {
		path := h.Path
		if h.Kind == space.KindFolder {
			path += "/"
		}
		fmt.Fprintf(&b, "%s (%d)", path, h.Count)
		if h.Best.Text != "" {
			fmt.Fprintf(&b, ": %s", h.Best.Text)
		}
		b.WriteByte('\n')
	}
	if more {
		b.WriteString("More pages match; narrow the query to see them.\n")
	}
	return b.String(), nil
}

type pathIn struct {
	Path string `json:"path"`
}

func (l look) readPage(ctx context.Context, in pathIn) (string, error) {
	s, open, err := l.space(ctx)
	if err != nil {
		return "", err
	}
	if filepath.IsAbs(in.Path) {
		return "", refuse("Give the page's path in the Space, as list_pages gives it.")
	}
	// The Space refuses a path outside it, hidden or through a link, and a
	// page that is not there.
	source, err := s.ReadPage(in.Path)
	if err != nil {
		return "", refuse("%s", spaceRefusal(err, in.Path))
	}
	path := filepath.ToSlash(filepath.Clean(in.Path))
	args := pageTextArgs{Path: path}
	if open == nil || open.Path != path {
		parsed, err := format.Read(source)
		if err != nil {
			return "", refuse("The canvas of %s cannot be read.", path)
		}
		args.File = &pageFile{Source: format.Prose(parsed.Source), Scene: parsed.Scene}
	}
	answer, err := ask[textAnswer](ctx, l.page, askPageText, args)
	if err != nil {
		return "", err
	}
	return answer.Text, nil
}

// spaceRefusal says why the Space refused a path, without its own wording,
// which can carry the absolute path.
func spaceRefusal(err error, p string) string {
	switch {
	case errors.Is(err, space.ErrOutside):
		return fmt.Sprintf("%s is outside the Space.", p)
	case errors.Is(err, space.ErrThroughLink):
		return fmt.Sprintf("%s goes through a link.", p)
	case errors.Is(err, fs.ErrNotExist):
		return fmt.Sprintf("There is no page %s.", p)
	}
	return fmt.Sprintf("%s is not a page of the Space.", p)
}

func (l look) readSelection(ctx context.Context) (string, error) {
	answer, err := ask[textAnswer](ctx, l.page, askSelection, nil)
	if err != nil {
		return "", err
	}
	if answer.Text == "" {
		return "Nothing is selected.", nil
	}
	return answer.Text, nil
}

func (l look) findIcon(ctx context.Context, in queryIn) (string, error) {
	if strings.TrimSpace(in.Query) == "" {
		return "", refuse("Say what the icon shows.")
	}
	answer, err := ask[iconAnswer](ctx, l.page, askIcons, iconArgs{Query: in.Query})
	if err != nil {
		return "", err
	}
	if len(answer.Names) == 0 {
		return fmt.Sprintf("No icon matches %q.", in.Query), nil
	}
	return strings.Join(answer.Names, "\n") + "\n", nil
}
