package agent

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const testCode = "ABCD-EFGH-JKMN-PQRS"

// bearer adds the connection code to every request, as an agent's settings do.
type bearer struct{ code string }

func (b bearer) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	if b.code != "" {
		r.Header.Set("Authorization", "Bearer "+b.code)
	}
	return http.DefaultTransport.RoundTrip(r)
}

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("free port: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	return port
}

func pingTool() Tool {
	return Tool{
		Def: &mcp.Tool{Name: "ping", Description: "Answers pong.", InputSchema: map[string]any{"type": "object"}},
		Handle: func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "pong"}}}, nil
		},
	}
}

func started(t *testing.T, tools ...Tool) (*Server, int) {
	t.Helper()
	s := NewServer()
	s.SetTools(tools)
	port := freePort(t)
	if err := s.Start(port, testCode); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = s.Stop() })
	return s, port
}

func connect(t *testing.T, port int, code string) (*mcp.ClientSession, error) {
	t.Helper()
	client := mcp.NewClient(&mcp.Implementation{Name: "test-agent", Version: "1"}, nil)
	transport := &mcp.StreamableClientTransport{
		Endpoint:   fmt.Sprintf("http://127.0.0.1:%d/bava", port),
		HTTPClient: &http.Client{Transport: bearer{code}},
		MaxRetries: -1,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	session, err := client.Connect(ctx, transport, nil)
	if err == nil {
		t.Cleanup(func() { _ = session.Close() })
	}
	return session, err
}

func TestServerConnectsWithTheCodeAndListsTools(t *testing.T) {
	_, port := started(t, pingTool())
	session, err := connect(t, port, testCode)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	if len(tools.Tools) != 1 || tools.Tools[0].Name != "ping" {
		t.Fatalf("tools: got %+v", tools.Tools)
	}
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "ping"})
	if err != nil || result.Content[0].(*mcp.TextContent).Text != "pong" {
		t.Fatalf("CallTool: %v, %+v", err, result)
	}
}

func post(t *testing.T, port int, host, code string) int {
	t.Helper()
	body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"x","version":"1"}}}`
	req, _ := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/bava", port), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if host != "" {
		req.Host = host
	}
	if code != "" {
		req.Header.Set("Authorization", "Bearer "+code)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

func TestServerRefusesWithoutTheCode(t *testing.T) {
	_, port := started(t, pingTool())
	if got := post(t, port, "", ""); got != http.StatusUnauthorized {
		t.Fatalf("no code: got %d, want 401", got)
	}
	if got := post(t, port, "", "WRONG-CODE-0000-0000"); got != http.StatusUnauthorized {
		t.Fatalf("wrong code: got %d, want 401", got)
	}
	if _, err := connect(t, port, ""); err == nil {
		t.Fatal("an agent without the code connected")
	}
}

func TestServerRefusesAnotherHost(t *testing.T) {
	_, port := started(t, pingTool())
	if got := post(t, port, "evil.example:80", testCode); got != http.StatusForbidden {
		t.Fatalf("another host: got %d, want 403", got)
	}
}

func TestServerNewCodeDropsAgentsUsingTheOld(t *testing.T) {
	s, port := started(t, pingTool())
	session, err := connect(t, port, testCode)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if got := s.Connected(); got != 1 {
		t.Fatalf("Connected: got %d, want 1", got)
	}
	s.SetCode("NEWC-ODE2-3456-789A")
	if got := s.Connected(); got != 0 {
		t.Fatalf("Connected after a new code: got %d, want 0", got)
	}
	if _, err := session.ListTools(context.Background(), nil); err == nil {
		t.Fatal("an agent with the old code still listed tools")
	}
	if got := post(t, port, "", testCode); got != http.StatusUnauthorized {
		t.Fatalf("old code: got %d, want 401", got)
	}
	if _, err := connect(t, port, "NEWC-ODE2-3456-789A"); err != nil {
		t.Fatalf("new code: %v", err)
	}
}

func TestServerListensOnLoopbackOnly(t *testing.T) {
	s, port := started(t)
	addr := s.Addr()
	tcp, ok := addr.(*net.TCPAddr)
	if !ok || !tcp.IP.Equal(net.IPv4(127, 0, 0, 1)) || tcp.Port != port {
		t.Fatalf("listening on %v, want 127.0.0.1:%d", addr, port)
	}
}

func TestServerBusyPortIsErrPortInUse(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer ln.Close()
	s := NewServer()
	err = s.Start(ln.Addr().(*net.TCPAddr).Port, testCode)
	if !errors.Is(err, ErrPortInUse) {
		t.Fatalf("Start on a busy port: got %v, want ErrPortInUse", err)
	}
}

func TestServerStopEndsAgents(t *testing.T) {
	s, port := started(t, pingTool())
	if _, err := connect(t, port, testCode); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if err := s.Stop(); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got := s.Connected(); got != 0 {
		t.Fatalf("Connected after Stop: got %d", got)
	}
	if _, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second); err == nil {
		t.Fatal("still listening after Stop")
	}
}

func TestServerSetToolsTellsAgents(t *testing.T) {
	s, port := started(t, pingTool())
	changed := make(chan struct{}, 1)
	client := mcp.NewClient(&mcp.Implementation{Name: "test-agent", Version: "1"}, &mcp.ClientOptions{
		ToolListChangedHandler: func(context.Context, *mcp.ToolListChangedRequest) {
			select {
			case changed <- struct{}{}:
			default:
			}
		},
	})
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint:   fmt.Sprintf("http://127.0.0.1:%d/bava", port),
		HTTPClient: &http.Client{Transport: bearer{testCode}},
	}, nil)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer session.Close()
	other := pingTool()
	other.Def = &mcp.Tool{Name: "pong", Description: "Answers ping.", InputSchema: map[string]any{"type": "object"}}
	s.SetTools([]Tool{other})
	select {
	case <-changed:
	case <-time.After(5 * time.Second):
		t.Fatal("no tool-list-changed notice")
	}
	tools, _ := session.ListTools(context.Background(), nil)
	if len(tools.Tools) != 1 || tools.Tools[0].Name != "pong" {
		t.Fatalf("tools after SetTools: %+v", tools.Tools)
	}
}
