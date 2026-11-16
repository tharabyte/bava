package agent

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/tharabyte/bava/internal/space"
	"github.com/tharabyte/bava/internal/testutil"
)

// standIn answers the plug's questions as the window does, recording each.
type standIn struct {
	root  string
	open  *space.OpenPage
	asked []Ask
	// pageText answers a pageText question; it sees whether the file came
	// with it (a closed page, for the worker) or not (the open page).
	pageText func(args pageTextArgs) string
}

func (p *standIn) Ask(_ context.Context, kind string, args any) (json.RawMessage, error) {
	p.asked = append(p.asked, Ask{Kind: kind, Args: args})
	switch kind {
	case askSpace:
		if p.root == "" {
			return json.RawMessage("null"), nil
		}
		return json.Marshal(spaceAnswer{Root: p.root, Open: p.open})
	case askPageText:
		return json.Marshal(textAnswer{Text: p.pageText(args.(pageTextArgs))})
	case askSelection:
		return json.Marshal(textAnswer{Text: "e1 rect \"Writer\" box 40,24 160x90"})
	case askIcons:
		q := args.(iconArgs).Query
		return json.Marshal(iconAnswer{Names: []string{"aws/" + q, "azure/" + q}})
	}
	return nil, errors.New("unknown question")
}

func lookSpace(t *testing.T) string {
	t.Helper()
	parent := t.TempDir()
	s, err := space.Create(parent, "Work")
	if err != nil {
		t.Fatalf("space: %v", err)
	}
	testutil.WriteTree(t, s.Root, map[string]string{
		"Notes.md":          "# Notes\n\nThe queue drains at night.\n",
		"Designs/Ingest.md": "# Ingest\n\nEvents arrive over HTTP.\n\n```bava-canvas\n{\n  \"version\": 1,\n  \"elements\": [\n    { \"id\": \"e1\", \"type\": \"rect\", \"x\": 40, \"y\": 24, \"w\": 160, \"h\": 90, \"z\": 1, \"label\": \"Queue\" }\n  ]\n}\n```\n",
		".hidden.md":        "secret",
	})
	return s.Root
}

func lookSession(t *testing.T, page *standIn) *mcp.ClientSession {
	t.Helper()
	_, port := started(t, LookTools(page)...)
	session, err := connect(t, port, testCode)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	return session
}

func call(t *testing.T, session *mcp.ClientSession, name string, args map[string]any) (string, bool) {
	t.Helper()
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	var b strings.Builder
	for _, c := range result.Content {
		b.WriteString(c.(*mcp.TextContent).Text)
	}
	return b.String(), result.IsError
}

func TestLookToolsAreTheLookMenu(t *testing.T) {
	var names []string
	for _, tool := range LookTools(&standIn{}) {
		names = append(names, tool.Def.Name)
		if tool.Def.Description == "" || tool.Def.InputSchema == nil {
			t.Errorf("%s has no description or schema", tool.Def.Name)
		}
	}
	want := "list_pages search read_page read_selection find_icon"
	if got := strings.Join(names, " "); got != want {
		t.Fatalf("tools: got %q, want %q", got, want)
	}
}

func TestListPagesInTheSpaceOrder(t *testing.T) {
	session := lookSession(t, &standIn{root: lookSpace(t)})
	got, isErr := call(t, session, "list_pages", nil)
	if isErr {
		t.Fatalf("list_pages failed: %s", got)
	}
	want := "Space: Work\nDesigns/\n  Designs/Ingest.md\nNotes.md\n"
	if got != want {
		t.Fatalf("list_pages:\n%s\nwant:\n%s", got, want)
	}
	if strings.Contains(got, "hidden") {
		t.Fatal("a hidden page was listed")
	}
}

func TestLookWithNoSpaceOpenSaysSo(t *testing.T) {
	session := lookSession(t, &standIn{})
	got, isErr := call(t, session, "list_pages", nil)
	if !isErr || got != "No Space is open in Bava." {
		t.Fatalf("list_pages with no Space: %q, error %v", got, isErr)
	}
}

func TestSearchFindsPagesAndTheOpenPageAsOnScreen(t *testing.T) {
	root := lookSpace(t)
	open := &space.OpenPage{Path: "Notes.md", Source: "# Notes\n\nUnsaved words about pelicans.\n"}
	session := lookSession(t, &standIn{root: root, open: open})
	got, _ := call(t, session, "search", map[string]any{"query": "pelicans"})
	if !strings.Contains(got, "Notes.md") || !strings.Contains(got, "pelicans") {
		t.Fatalf("search missed the open page's unsaved text:\n%s", got)
	}
	got, _ = call(t, session, "search", map[string]any{"query": "events"})
	if !strings.Contains(got, "Designs/Ingest.md") {
		t.Fatalf("search missed a closed page:\n%s", got)
	}
	got, _ = call(t, session, "search", map[string]any{"query": "zebra"})
	if got != "Nothing found for \"zebra\"." {
		t.Fatalf("search with no hits: %q", got)
	}
}

func TestReadPageOpenComesFromThePage(t *testing.T) {
	root := lookSpace(t)
	page := &standIn{
		root: root,
		open: &space.OpenPage{Path: "Notes.md", Source: "# Notes\n\nUnsaved.\n"},
		pageText: func(args pageTextArgs) string {
			if args.File != nil {
				return "from the worker"
			}
			return "from the editor"
		},
	}
	session := lookSession(t, page)
	if got, _ := call(t, session, "read_page", map[string]any{"path": "Notes.md"}); got != "from the editor" {
		t.Fatalf("open page: %q", got)
	}
}

func TestReadPageClosedSendsTheFileForTheWorker(t *testing.T) {
	root := lookSpace(t)
	var sent pageTextArgs
	page := &standIn{root: root, pageText: func(args pageTextArgs) string {
		sent = args
		return "from the worker"
	}}
	session := lookSession(t, page)
	if got, _ := call(t, session, "read_page", map[string]any{"path": "Designs/Ingest.md"}); got != "from the worker" {
		t.Fatalf("closed page: %q", got)
	}
	if sent.File == nil || sent.Path != "Designs/Ingest.md" {
		t.Fatalf("no file sent for the worker: %+v", sent)
	}
	if sent.File.Source != "# Ingest\n\nEvents arrive over HTTP.\n" {
		t.Fatalf("prose sent: %q", sent.File.Source)
	}
	if len(sent.File.Scene.Elements) != 1 || sent.File.Scene.Elements[0].ID != "e1" {
		t.Fatalf("scene sent: %+v", sent.File.Scene)
	}
}

func TestReadPageRefusesWhatTheSpaceRefuses(t *testing.T) {
	root := lookSpace(t)
	page := &standIn{root: root, pageText: func(pageTextArgs) string { return "should not be asked" }}
	session := lookSession(t, page)
	for _, p := range []string{"../outside.md", ".hidden.md", "Missing.md", filepath.Join(root, "Notes.md"), "Designs"} {
		got, isErr := call(t, session, "read_page", map[string]any{"path": p})
		if !isErr || strings.Contains(got, "should not be asked") {
			t.Errorf("read_page %q: got %q, error %v", p, got, isErr)
		}
	}
}

func TestReadSelectionAndFindIconAskThePage(t *testing.T) {
	page := &standIn{root: lookSpace(t)}
	session := lookSession(t, page)
	if got, _ := call(t, session, "read_selection", nil); !strings.Contains(got, "Writer") {
		t.Fatalf("read_selection: %q", got)
	}
	got, _ := call(t, session, "find_icon", map[string]any{"query": "database"})
	if got != "aws/database\nazure/database\n" {
		t.Fatalf("find_icon: %q", got)
	}
}
