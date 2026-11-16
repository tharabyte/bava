package e2e_test

import (
	"context"
	"net"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/tharabyte/bava/internal/agent"
	"github.com/tharabyte/bava/internal/e2e"
	"github.com/tharabyte/bava/internal/secrets"
)

// A walk's agent step connects as the user's agent would, with the address
// and code the plug shows, and checks what a tool answers.
func TestAgentStepCallsAToolAsAnAgentWould(t *testing.T) {
	echo := agent.Tool{
		Def: &mcp.Tool{Name: "list_pages", Description: "x", InputSchema: map[string]any{"type": "object"}},
		Handle: func(_ context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "Space: Smoke\nFirst page.md\nargs " + string(req.Params.Arguments)}}}, nil
		},
	}
	plug := agent.NewPlug(agent.PlugOptions{Safe: secrets.NewMemory(), Look: []agent.Tool{echo}})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	plug.Configure(true, port, false)
	t.Cleanup(func() { plug.Configure(false, 0, false) })

	s := e2e.NewService(e2e.Options{Quit: func(int) {}, Agent: func() (string, string) {
		status := plug.Status()
		return status.Address, status.Code
	}})
	if failure := s.Agent("list_pages", `{"path":"x"}`, "First page.md"); failure != "" {
		t.Fatalf("agent step: %s", failure)
	}
	if failure := s.Agent("list_pages", "", "Missing.md"); !strings.Contains(failure, "Missing.md") {
		t.Fatalf("a missing text passed: %q", failure)
	}
	if failure := s.Agent("nope", "", "x"); failure == "" {
		t.Fatal("an unknown tool passed")
	}
	off := e2e.NewService(e2e.Options{Quit: func(int) {}, Agent: func() (string, string) { return "", "" }})
	if failure := off.Agent("list_pages", "", "x"); failure != "agents are not allowed" {
		t.Fatalf("plug off: %q", failure)
	}
}

// A walk reads a page, then changes it against the version it read.
func TestAgentStepCarriesTheLastVersionRead(t *testing.T) {
	var got []string
	tool := func(name, answer string) agent.Tool {
		return agent.Tool{
			Def: &mcp.Tool{Name: name, Description: "x", InputSchema: map[string]any{"type": "object"}},
			Handle: func(_ context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				got = append(got, string(req.Params.Arguments))
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: answer}}}, nil
			},
		}
	}
	plug := agent.NewPlug(agent.PlugOptions{Safe: secrets.NewMemory(), Look: []agent.Tool{
		tool("read_page", "Page: A.md\nVersion: 0a1b2c3d\n"),
		tool("change_canvas", "Applied: added n.\n"),
	}})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	plug.Configure(true, port, false)
	t.Cleanup(func() { plug.Configure(false, 0, false) })
	s := e2e.NewService(e2e.Options{Quit: func(int) {}, Agent: func() (string, string) {
		status := plug.Status()
		return status.Address, status.Code
	}})
	if failure := s.Agent("read_page", `{"path":"A.md"}`, "Version"); failure != "" {
		t.Fatal(failure)
	}
	if failure := s.Agent("change_canvas", `{"version":"${VERSION}"}`, "added n"); failure != "" {
		t.Fatal(failure)
	}
	if got[1] != `{"version":"0a1b2c3d"}` {
		t.Fatalf("the change was sent %s", got[1])
	}
}
