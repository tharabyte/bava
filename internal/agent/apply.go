package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/tharabyte/bava/internal/format"
	"github.com/tharabyte/bava/internal/space"
)

// askApply: the AI's changes to a page it holds. The open page applies them
// in its editor and scene; a page not on screen is changed by the page
// worker from the file sent with it, and its new file comes back for Go to
// save.
const askApply = "apply"

type applyArgs struct {
	Path string          `json:"path"`
	Edit json.RawMessage `json:"edit"`
	File *pageFile       `json:"file"`
}

type applyReport struct {
	Applied []string `json:"applied"`
	Refused []string `json:"refused"`
}

type applyAnswer struct {
	Text   string      `json:"text"`
	Report applyReport `json:"report"`
	Stale  bool        `json:"stale"`
	Locked bool        `json:"locked"`
	File   *pageFile   `json:"file"`
}

// apply sends one tool call's changes to a page the AI holds and answers
// what was applied, what was refused and why, and the page as it now reads.
func (e edit) apply(ctx context.Context, p string, change json.RawMessage) (string, error) {
	at, err := e.pagePath(ctx, p)
	if err != nil {
		return "", err
	}
	switch err := e.claims.Check(at.path); {
	case errors.Is(err, ErrStopped):
		return "", stoppedRefusal(at.path)
	case err != nil:
		return "", refuse("Claim %s with claim_page before changing it.", at.path)
	}
	answer, err := ask[applyAnswer](ctx, e.page, askApply, applyArgs{Path: at.path, Edit: change, File: at.file})
	if err != nil {
		return "", err
	}
	if answer.Locked {
		return "", refuse("%s is locked. Ask the user to unlock it if they want it changed.", at.path)
	}
	if answer.Stale {
		return "", refuse("%s changed since you read it, so nothing was applied. It reads now:\n\n%s", at.path, answer.Text)
	}
	if at.file != nil {
		// The user may have pressed Stop while the worker worked.
		if err := e.claims.Check(at.path); err != nil {
			return "", stoppedRefusal(at.path)
		}
		if answer.File == nil {
			return "", refuse("%s could not be changed.", at.path)
		}
		if err := save(at.space, at.path, at.source, *answer.File); err != nil {
			return "", err
		}
	}
	return reportText(answer), nil
}

// save writes a page not on screen as Bava writes a page, only if it still
// reads as it did when the change began.
func save(s space.Space, path, before string, file pageFile) error {
	after, err := format.Write(format.File{Source: file.Source, Scene: file.Scene})
	if err != nil {
		return refuse("%s could not be written.", path)
	}
	if err := s.WriteIfUnchanged(path, before, after); err != nil {
		if errors.Is(err, space.ErrChanged) {
			return refuse("%s changed on disk while it was being changed, so nothing was saved. Read it again.", path)
		}
		return refuse("%s could not be saved.", path)
	}
	return nil
}

func reportText(answer applyAnswer) string {
	var b strings.Builder
	if len(answer.Report.Applied) > 0 {
		fmt.Fprintf(&b, "Applied: %s.\n", strings.Join(answer.Report.Applied, "; "))
	}
	if len(answer.Report.Refused) > 0 {
		fmt.Fprintf(&b, "Refused: %s.\n", strings.Join(answer.Report.Refused, "; "))
	}
	if b.Len() == 0 {
		b.WriteString("Nothing changed.\n")
	}
	b.WriteString("\n")
	b.WriteString(answer.Text)
	return b.String()
}
