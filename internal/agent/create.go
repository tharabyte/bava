package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"

	"github.com/tharabyte/bava/internal/space"
)

type createIn struct {
	Folder string `json:"folder"`
	Name   string `json:"name"`
}

// createPage makes an empty page in a folder (the Space's top when none is
// named), its name made free as Bava makes one for the user, and claims it
// for the agent to fill.
func (e edit) createPage(ctx context.Context, in createIn) (string, error) {
	s, _, err := e.space(ctx)
	if err != nil {
		return "", err
	}
	name := strings.TrimSuffix(strings.TrimSpace(in.Name), space.PageExt)
	if name == "" {
		return "", refuse("Give the page a name.")
	}
	folder := strings.Trim(path.Clean("/"+strings.ReplaceAll(in.Folder, `\`, "/")), "/")
	if strings.HasPrefix(path.Clean(in.Folder), "..") {
		return "", refuse("%s is outside the Space.", in.Folder)
	}
	if folder != "" {
		if _, err := s.List(folder); err != nil {
			return "", refuse("There is no folder %s.", folder)
		}
	}
	taken := func(file string) bool {
		abs, err := s.Abs(path.Join(folder, file))
		if err != nil {
			return true
		}
		_, err = os.Stat(abs)
		return err == nil
	}
	file := space.FreeName(name+space.PageExt, taken)
	created, err := s.CreatePage(folder, strings.TrimSuffix(file, space.PageExt))
	if err != nil {
		var msg string
		switch {
		case errors.Is(err, space.ErrOutside), errors.Is(err, space.ErrThroughLink):
			msg = fmt.Sprintf("%s is outside the Space.", in.Folder)
		default:
			msg = fmt.Sprintf("%s cannot be a page name: %s", name, space.Code(err))
		}
		return "", refusal{msg}
	}
	if err := e.claims.Take(created); err != nil {
		return "", stoppedRefusal(created)
	}
	return fmt.Sprintf("Created %s, empty and claimed. Read it with read_page, fill it with change_document and change_canvas, and release it when done.", created), nil
}
