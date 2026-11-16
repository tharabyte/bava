package agent

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/tharabyte/bava/internal/format"
	"github.com/tharabyte/bava/internal/space"
)

// askClaim: the page about to be claimed. The open page waits for a pause in
// typing, saves, and turns read-only before it answers; a closed page is
// read from the file sent with it. The answer says whether it is locked.
const askClaim = "claim"

type claimArgs struct {
	Path string    `json:"path"`
	File *pageFile `json:"file"`
}

type claimAnswer struct {
	Locked bool `json:"locked"`
}

// Tool is one entry on the menu Bava offers an agent: what the agent sees
// (name, description, input schema) and what Bava does when it is called.
type Tool struct {
	Def    *mcp.Tool
	Handle mcp.ToolHandler
}

// edit is what the tools that change pages share.
type edit struct {
	look
	claims *Claims
}

// EditTools claim, release and change pages; they are on the menu only
// while Allow the AI to edit pages is on.
func EditTools(page asking, claims *Claims) []Tool {
	e := edit{look: look{page: page}, claims: claims}
	return append([]Tool{
		textTool("claim_page", "Claims a page before changing it: the page becomes read-only for the user until you release it or they press Stop. Read it with read_page after claiming. You may hold several claims; release each when done.",
			object(map[string]any{"path": stringProperty("The page's path in the Space, as list_pages gives it.")}, "path"),
			e.claimPage),
		textTool("draw_diagram", "Draws a diagram on a page you claimed, from D2 source: Bava lays it out once into ordinary shapes and arrows, placed in free space beside what the canvas holds. The D2 is not kept. If the D2 does not compile, nothing is placed and the errors come back with their lines; fix them and call again. Icons are Bava's own, by name (icon: aws/rds); an icon given as a web address is left out.",
			object(map[string]any{
				"path": stringProperty("The page's path in the Space."),
				"d2":   stringProperty("The diagram in D2."),
			}, "path", "d2"),
			e.drawDiagram),
		textTool("create_page", "Creates an empty page in a folder of the Space (the top when no folder is given) and claims it for you to fill. A name already taken is numbered, as Bava numbers the user's.",
			object(map[string]any{
				"folder": stringProperty("The folder's path in the Space, as list_pages gives it; empty for the top."),
				"name":   stringProperty("The page's name, without .md."),
			}, "name"),
			e.createPage),
		textTool("release_page", "Releases a page you claimed, giving it back to the user. Release every page you claimed when you are done with it.",
			object(map[string]any{"path": stringProperty("The page's path in the Space.")}, "path"),
			e.releasePage),
	}, changeTools(e)...)
}

// pageAt is a page of the open Space, as the Space allows it.
type pageAt struct {
	space  space.Space
	path   string
	source string
	// file is the page's prose and scene when it is not on screen.
	file *pageFile
}

// pagePath finds a page of the open Space: its clean path, the file's
// text, and, when it is not the page on screen, its prose and scene.
func (l look) pagePath(ctx context.Context, p string) (pageAt, error) {
	s, open, err := l.space(ctx)
	if err != nil {
		return pageAt{}, err
	}
	if filepath.IsAbs(p) {
		return pageAt{}, refuse("Give the page's path in the Space, as list_pages gives it.")
	}
	source, err := s.ReadPage(p)
	if err != nil {
		return pageAt{}, refuse("%s", spaceRefusal(err, p))
	}
	at := pageAt{space: s, path: filepath.ToSlash(filepath.Clean(p)), source: source}
	if open != nil && open.Path == at.path {
		return at, nil
	}
	parsed, err := format.Read(source)
	if err != nil {
		return pageAt{}, refuse("The canvas of %s cannot be read.", at.path)
	}
	at.file = &pageFile{Source: format.Prose(parsed.Source), Scene: parsed.Scene}
	return at, nil
}

func (e edit) claimPage(ctx context.Context, in pathIn) (string, error) {
	at, err := e.pagePath(ctx, in.Path)
	if err != nil {
		return "", err
	}
	path, file := at.path, at.file
	if err := e.claims.Check(path); err == nil {
		return fmt.Sprintf("You already hold %s.", path), nil
	} else if errors.Is(err, ErrStopped) {
		return "", stoppedRefusal(path)
	}
	answer, err := ask[claimAnswer](ctx, e.page, askClaim, claimArgs{Path: path, File: file})
	if err != nil {
		// The page may have gone read-only to answer; the list puts it back.
		e.claims.tell()
		return "", err
	}
	if answer.Locked {
		// The page went read-only only to answer; the list puts it back.
		e.claims.tell()
		return "", refuse("%s is locked. Ask the user to unlock it if they want it changed.", path)
	}
	if err := e.claims.Take(path); err != nil {
		return "", stoppedRefusal(path)
	}
	return fmt.Sprintf("Claimed %s. It is read-only for the user until you release it. Read it with read_page before changing it.", path), nil
}

func stoppedRefusal(path string) error {
	return refuse("The user stopped the AI on %s. Leave it unless they ask again.", path)
}

func (e edit) releasePage(_ context.Context, in pathIn) (string, error) {
	path := filepath.ToSlash(filepath.Clean(in.Path))
	if !e.claims.Release(path) {
		return fmt.Sprintf("%s was not claimed.", path), nil
	}
	return fmt.Sprintf("Released %s.", path), nil
}
