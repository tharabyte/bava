package agent

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/tharabyte/bava/internal/secrets"
)

type steps struct {
	mu  sync.Mutex
	got []Step
}

func (s *steps) add(step Step) {
	s.mu.Lock()
	s.got = append(s.got, step)
	s.mu.Unlock()
}

func (s *steps) all() []Step {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Step(nil), s.got...)
}

func namedTool(name string, fail bool) Tool {
	return Tool{
		Def: &mcp.Tool{Name: name, Description: name, InputSchema: map[string]any{"type": "object"}},
		Handle: func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			return &mcp.CallToolResult{IsError: fail, Content: []mcp.Content{&mcp.TextContent{Text: name}}}, nil
		},
	}
}

func newPlug(t *testing.T, recorded *steps, changed chan Status) *Plug {
	t.Helper()
	p := NewPlug(PlugOptions{
		Safe: secrets.NewMemory(),
		Look: []Tool{namedTool("read_page", false), namedTool("search", true)},
		Edit: []Tool{namedTool("claim_page", false)},
		Step: func(s Step) {
			if recorded != nil {
				recorded.add(s)
			}
		},
		Changed: func(s Status) {
			if changed != nil {
				select {
				case changed <- s:
				default:
				}
			}
		},
	})
	t.Cleanup(func() { p.Configure(false, 0, false) })
	return p
}

func plugSession(t *testing.T, status Status, opts *mcp.ClientOptions) *mcp.ClientSession {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test-agent", Version: "1"}, opts)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint:   status.Address,
		HTTPClient: &http.Client{Transport: bearer{status.Code}},
		MaxRetries: -1,
	}, nil)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func toolNames(t *testing.T, session *mcp.ClientSession) []string {
	t.Helper()
	list, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	var names []string
	for _, tool := range list.Tools {
		names = append(names, tool.Name)
	}
	return names
}

func TestPlugOnGivesTheAddressAndAKeptCode(t *testing.T) {
	p := newPlug(t, nil, nil)
	port := freePort(t)
	status := p.Configure(true, port, false)
	if !status.On || status.Problem != "" {
		t.Fatalf("status: %+v", status)
	}
	if status.Address != fmt.Sprintf("http://127.0.0.1:%d/bava", port) {
		t.Fatalf("address: %q", status.Address)
	}
	if !codeShape.MatchString(status.Code) || !status.CodeKept {
		t.Fatalf("code: %q kept %v", status.Code, status.CodeKept)
	}
	off := p.Configure(false, port, false)
	if off.On || off.Code != "" {
		t.Fatalf("off: %+v", off)
	}
	if _, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second); err == nil {
		t.Fatal("still listening when off")
	}
}

func TestPlugBusyPortIsAProblemTheSettingsShow(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	status := newPlug(t, nil, nil).Configure(true, ln.Addr().(*net.TCPAddr).Port, false)
	if status.On || status.Problem != ProblemPortInUse {
		t.Fatalf("status on a busy port: %+v", status)
	}
}

func TestPlugEditingOffLeavesOnlyLook(t *testing.T) {
	p := newPlug(t, nil, nil)
	port := freePort(t)
	status := p.Configure(true, port, false)
	changed := make(chan struct{}, 4)
	session := plugSession(t, status, &mcp.ClientOptions{ToolListChangedHandler: func(context.Context, *mcp.ToolListChangedRequest) {
		changed <- struct{}{}
	}})
	if got := fmt.Sprint(toolNames(t, session)); got != "[read_page search]" {
		t.Fatalf("editing off: %s", got)
	}
	p.Configure(true, port, true)
	select {
	case <-changed:
	case <-time.After(5 * time.Second):
		t.Fatal("no tool-list-changed notice when editing turned on")
	}
	if got := fmt.Sprint(toolNames(t, session)); got != "[claim_page read_page search]" {
		t.Fatalf("editing on: %s", got)
	}
	p.Configure(true, port, false)
	select {
	case <-changed:
	case <-time.After(5 * time.Second):
		t.Fatal("no tool-list-changed notice when editing turned off")
	}
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "claim_page"})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if !result.IsError || result.Content[0].(*mcp.TextContent).Text != editingOff {
		t.Fatalf("a removed edit tool answered: %+v", result.Content[0])
	}
}

func TestPlugStepsFollowEachToolCall(t *testing.T) {
	recorded := &steps{}
	p := newPlug(t, recorded, nil)
	status := p.Configure(true, freePort(t), false)
	session := plugSession(t, status, nil)
	ctx := context.Background()
	_, _ = session.CallTool(ctx, &mcp.CallToolParams{Name: "read_page", Arguments: map[string]any{"path": "Designs/Ingest.md"}})
	_, _ = session.CallTool(ctx, &mcp.CallToolParams{Name: "search", Arguments: map[string]any{"query": "billing"}})
	_, _ = session.CallTool(ctx, &mcp.CallToolParams{Name: "send_email"})
	got := recorded.all()
	want := []Step{
		{Tool: "read_page", State: StepRunning, Subject: "Ingest"},
		{Tool: "read_page", State: StepDone, Subject: "Ingest"},
		{Tool: "search", State: StepRunning, Subject: "billing"},
		{Tool: "search", State: StepFailed, Subject: "billing"},
		{Tool: "send_email", State: StepUnavailable},
	}
	if len(got) != len(want) {
		t.Fatalf("steps: %+v", got)
	}
	for i := range want {
		g := got[i]
		if g.Tool != want[i].Tool || g.State != want[i].State || g.Subject != want[i].Subject || g.ID == "" {
			t.Errorf("step %d: got %+v, want %+v", i, g, want[i])
		}
	}
	if got[0].ID != got[1].ID || got[0].ID == got[2].ID {
		t.Errorf("a call's steps share one id, another call has its own: %+v", got)
	}
}

func TestPlugNewCodeDropsAgentsAndIsKept(t *testing.T) {
	p := newPlug(t, nil, nil)
	status := p.Configure(true, freePort(t), false)
	session := plugSession(t, status, nil)
	fresh := p.NewCode()
	if fresh.Code == status.Code || !codeShape.MatchString(fresh.Code) {
		t.Fatalf("new code: %q after %q", fresh.Code, status.Code)
	}
	if _, err := session.ListTools(context.Background(), nil); err == nil {
		t.Fatal("an agent with the old code kept working")
	}
	again := p.Configure(true, freePort(t), false)
	if again.Code != fresh.Code {
		t.Fatalf("the new code was not kept: %q, want %q", again.Code, fresh.Code)
	}
}

func TestPlugTellsWhenAgentsComeAndGo(t *testing.T) {
	changed := make(chan Status, 8)
	p := newPlug(t, nil, changed)
	status := p.Configure(true, freePort(t), false)
	session := plugSession(t, status, nil)
	waitFor := func(n int) {
		t.Helper()
		deadline := time.After(5 * time.Second)
		for {
			select {
			case s := <-changed:
				if s.Connected == n {
					return
				}
			case <-deadline:
				t.Fatalf("never told %d connected (now %d)", n, p.Status().Connected)
			}
		}
	}
	waitFor(1)
	_ = session.Close()
	waitFor(0)
}

func TestPlugWithNoSafeStillRuns(t *testing.T) {
	p := NewPlug(PlugOptions{Safe: noSafeForTest{}})
	defer p.Configure(false, 0, false)
	status := p.Configure(true, freePort(t), false)
	if !status.On || status.CodeKept || !codeShape.MatchString(status.Code) {
		t.Fatalf("no safe: %+v", status)
	}
}
