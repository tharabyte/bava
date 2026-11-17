package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// versionLine is how a page's text gives its version.
var versionLine = regexp.MustCompile(`(?m)^Version: ([0-9a-f]{8})$`)

// agentWait bounds one agent step: connecting and the tool's answer.
const agentWait = 20 * time.Second

type bearer struct{ code string }

func (b bearer) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+b.code)
	return http.DefaultTransport.RoundTrip(r)
}

// Agent connects to the plug as the user's own agent would, calls tool with
// args (JSON, or empty), and reports "" when the answer holds expect, or
// why not.
func (s *Service) Agent(tool, args, expect string) string {
	if s.options.Agent == nil {
		return "no agent plug in this build"
	}
	address, code := s.options.Agent()
	if address == "" || code == "" {
		return "agents are not allowed"
	}
	// A walk cannot read one answer into the next call: the last version a
	// tool answered stands in for ${VERSION}.
	s.mu.Lock()
	args = strings.ReplaceAll(args, "${VERSION}", s.version)
	s.mu.Unlock()
	var arguments map[string]any
	if args != "" {
		if err := json.Unmarshal([]byte(args), &arguments); err != nil {
			return fmt.Sprintf("the step's arguments are not JSON: %v", err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), agentWait)
	defer cancel()
	session, err := s.agentSession(ctx, address, code)
	if err != nil {
		return fmt.Sprintf("connect: %v", err)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tool, Arguments: arguments})
	if err != nil {
		return fmt.Sprintf("%s: %v", tool, err)
	}
	var text strings.Builder
	for _, c := range result.Content {
		if t, ok := c.(*mcp.TextContent); ok {
			text.WriteString(t.Text)
		}
	}
	if found := versionLine.FindStringSubmatch(text.String()); found != nil {
		s.mu.Lock()
		s.version = found[1]
		s.mu.Unlock()
	}
	if result.IsError {
		return fmt.Sprintf("%s failed: %s", tool, text.String())
	}
	if !strings.Contains(text.String(), expect) {
		return fmt.Sprintf("%s answered without %q: %s", tool, expect, text.String())
	}
	return ""
}

// agentSession is the walk's connection, made on the first agent step and
// kept: the plug gives every page back when its last agent disconnects.
func (s *Service) agentSession(ctx context.Context, address, code string) (*mcp.ClientSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	at := address + " " + code
	if s.agent != nil && s.agentAt == at {
		return s.agent, nil
	}
	if s.agent != nil {
		_ = s.agent.Close()
		s.agent = nil
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "bava-walk", Version: "1"}, nil)
	// Connecting is bounded by ctx; the session outlives this step.
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:   address,
		HTTPClient: &http.Client{Transport: bearer{code}},
		MaxRetries: -1,
	}, nil)
	if err != nil {
		return nil, err
	}
	s.agent, s.agentAt = session, at
	return session, nil
}
