package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"strconv"
	"strings"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/tharabyte/bava/internal/secrets"
)

// Step states, one per tool call as the agent view shows it.
const (
	StepRunning = "running"
	StepDone    = "done"
	StepFailed  = "failed"
	// StepUnavailable: the agent named a tool not on Bava's menu.
	StepUnavailable = "unavailable"
)

// What can keep the plug from opening, as the settings say it.
const (
	// ProblemPortInUse: another program holds the port the settings name.
	ProblemPortInUse = "portInUse"
	// ProblemStart: the port could not be opened for another reason.
	ProblemStart = "start"
)

// editingOff answers a call to a tool that changes pages while editing is off.
const editingOff = "Editing pages is turned off in Bava. Ask the user to turn on Allow the AI to edit pages in AI settings."

// Step is one tool call, as the agent view lists it. Subject is the page
// or words the call was about.
type Step struct {
	ID      string `json:"id"`
	Tool    string `json:"tool"`
	State   string `json:"state"`
	Subject string `json:"subject"`
}

// Status is the plug as AI settings and the agent view show it.
type Status struct {
	On      bool   `json:"on"`
	Address string `json:"address"`
	Code    string `json:"code"`
	// CodeKept is false when there is no password safe: the code then lasts
	// until Bava quits.
	CodeKept  bool   `json:"codeKept"`
	Connected int    `json:"connected"`
	Editing   bool   `json:"editing"`
	Problem   string `json:"problem"`
}

// PlugOptions are the plug's tools and who hears from it.
type PlugOptions struct {
	Safe secrets.Safe
	// Look reads; Edit changes pages and is on the menu only while editing
	// is allowed.
	Look, Edit []Tool
	// Step hears each tool call start and end; nil hears nothing.
	Step func(Step)
	// Changed hears the status change (an agent connecting or going).
	Changed func(Status)
}

// Plug runs the server as AI settings say: on or off, on which port, with
// or without the tools that change pages.
type Plug struct {
	opts   PlugOptions
	server *Server

	mu       sync.Mutex
	on       bool
	port     int
	editing  bool
	code     string
	kept     bool
	problem  string
	edits    map[string]bool
	nextCall uint64
}

// NewPlug is a plug, off until Configure turns it on.
func NewPlug(opts PlugOptions) *Plug {
	p := &Plug{opts: opts, server: NewServer(), edits: map[string]bool{}}
	for _, t := range opts.Edit {
		p.edits[t.Def.Name] = true
	}
	p.server.Guard(p.guard)
	p.server.OnSessions(func() {
		if p.opts.Changed != nil {
			p.opts.Changed(p.Status())
		}
	})
	return p
}

// Configure turns the plug on or off, on port, offering the tools that
// change pages only when editing.
func (p *Plug) Configure(allow bool, port int, editing bool) Status {
	p.mu.Lock()
	wasOn, oldPort := p.on, p.port
	p.editing = editing
	p.mu.Unlock()
	p.server.SetTools(p.menu(editing))

	if !allow {
		_ = p.server.Stop()
		p.mu.Lock()
		p.on, p.code, p.problem = false, "", ""
		p.mu.Unlock()
		return p.Status()
	}
	if wasOn && oldPort == port {
		return p.Status()
	}
	code, err := LoadCode(p.opts.Safe)
	kept := err == nil
	if err != nil && code == "" {
		// The safe could not be read: a code for this run only, rather than
		// no plug at all.
		if code, err = randomCode(); err != nil {
			p.mu.Lock()
			p.on, p.problem = false, ProblemStart
			p.mu.Unlock()
			return p.Status()
		}
	}
	startErr := p.server.Start(port, code)
	p.mu.Lock()
	p.port, p.code, p.kept = port, code, kept
	p.on, p.problem = startErr == nil, ""
	if errors.Is(startErr, ErrPortInUse) {
		p.problem = ProblemPortInUse
	} else if startErr != nil {
		p.problem = ProblemStart
	}
	if !p.on {
		p.code = ""
	}
	p.mu.Unlock()
	return p.Status()
}

// NewCode makes a fresh connection code; agents using the old one are
// dropped and must connect again with the new one.
func (p *Plug) NewCode() Status {
	code, err := NewCode(p.opts.Safe)
	if err != nil && !errors.Is(err, secrets.ErrNoSafe) {
		return p.Status()
	}
	p.mu.Lock()
	on := p.on
	if on {
		p.code, p.kept = code, err == nil
	}
	p.mu.Unlock()
	if on {
		p.server.SetCode(code)
	}
	return p.Status()
}

// Status is the plug now.
func (p *Plug) Status() Status {
	p.mu.Lock()
	s := Status{On: p.on, Code: p.code, CodeKept: p.kept, Editing: p.editing, Problem: p.problem}
	port := p.port
	p.mu.Unlock()
	if s.On {
		s.Address = fmt.Sprintf("http://127.0.0.1:%d%s", port, Path)
		s.Connected = p.server.Connected()
	}
	return s
}

// Sessions describes the agents' sessions held now, for a failure to name.
func (p *Plug) Sessions() []string {
	return p.server.Sessions()
}

func (p *Plug) menu(editing bool) []Tool {
	tools := append([]Tool(nil), p.opts.Look...)
	if editing {
		tools = append(tools, p.opts.Edit...)
	}
	return tools
}

// guard tells the agent view of every tool call, and answers a call to a
// tool that changes pages while editing is off with why.
func (p *Plug) guard(next mcp.MethodHandler) mcp.MethodHandler {
	return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
		call, ok := req.(*mcp.CallToolRequest)
		if method != "tools/call" || !ok || call.Params == nil {
			return next(ctx, method, req)
		}
		p.mu.Lock()
		p.nextCall++
		id := "call-" + strconv.FormatUint(p.nextCall, 10)
		editing := p.editing
		p.mu.Unlock()
		name := call.Params.Name
		subject := subjectOf(call.Params.Arguments)
		if p.edits[name] && !editing {
			p.step(Step{ID: id, Tool: name, State: StepFailed, Subject: subject})
			return failed(editingOff), nil
		}
		if !p.known(name) {
			p.step(Step{ID: id, Tool: name, State: StepUnavailable})
			return next(ctx, method, req)
		}
		p.step(Step{ID: id, Tool: name, State: StepRunning, Subject: subject})
		result, err := next(ctx, method, req)
		state := StepDone
		if r, isTool := result.(*mcp.CallToolResult); err != nil || (isTool && r.IsError) {
			state = StepFailed
		}
		p.step(Step{ID: id, Tool: name, State: state, Subject: subject})
		return result, err
	}
}

func (p *Plug) known(name string) bool {
	for _, t := range p.opts.Look {
		if t.Def.Name == name {
			return true
		}
	}
	return p.edits[name]
}

func (p *Plug) step(s Step) {
	if p.opts.Step != nil {
		p.opts.Step(s)
	}
}

// subjectOf is what a call is about, for its step line: a page's name, or
// the words searched for.
func subjectOf(raw json.RawMessage) string {
	var args struct {
		Path  string `json:"path"`
		Query string `json:"query"`
		Name  string `json:"name"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &args) != nil {
		return ""
	}
	if args.Path != "" {
		base := path.Base(strings.ReplaceAll(args.Path, `\`, "/"))
		return strings.TrimSuffix(base, path.Ext(base))
	}
	if args.Name != "" {
		return args.Name
	}
	return args.Query
}
