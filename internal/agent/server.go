// Package agent is the plug a user's own AI agent connects to: an MCP
// server on this machine's loopback address, behind the connection code,
// offering Bava's fixed menu of tools.
package agent

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ErrPortInUse means another program holds the port the settings name.
var ErrPortInUse = errors.New("the port is in use by another program")

// Path is where on the loopback address agents connect.
const Path = "/bava"

// Server is the plug. It is made once; Start and Stop open and close it as
// the setting turns on and off.
type Server struct {
	mcp *mcp.Server

	// sessions hears an agent connect or go; guard sees every request first.
	sessions func()
	guard    mcp.Middleware

	mu    sync.Mutex
	code  string
	tools map[string]Tool
	http  *http.Server
	ln    net.Listener
}

// NewServer is a plug offering no tools until SetTools.
func NewServer() *Server {
	s := &Server{tools: map[string]Tool{}}
	s.mcp = mcp.NewServer(&mcp.Implementation{Name: "bava", Title: "Bava"}, &mcp.ServerOptions{
		Capabilities: &mcp.ServerCapabilities{Tools: &mcp.ToolCapabilities{ListChanged: true}},
		InitializedHandler: func(_ context.Context, req *mcp.InitializedRequest) {
			s.told()
			go func() {
				_ = req.Session.Wait()
				s.told()
			}()
		},
	})
	s.mcp.AddReceivingMiddleware(func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
			s.mu.Lock()
			guard := s.guard
			s.mu.Unlock()
			if guard != nil {
				return guard(next)(ctx, method, req)
			}
			return next(ctx, method, req)
		}
	})
	return s
}

// OnSessions hears each agent connect and go.
func (s *Server) OnSessions(heard func()) {
	s.mu.Lock()
	s.sessions = heard
	s.mu.Unlock()
}

// Guard sees every request before its handler.
func (s *Server) Guard(guard mcp.Middleware) {
	s.mu.Lock()
	s.guard = guard
	s.mu.Unlock()
}

func (s *Server) told() {
	s.mu.Lock()
	heard := s.sessions
	s.mu.Unlock()
	if heard != nil {
		heard()
	}
}

// SetTools makes tools the whole menu; agents connected are told the list
// changed.
func (s *Server) SetTools(tools []Tool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := map[string]Tool{}
	for _, t := range tools {
		next[t.Def.Name] = t
	}
	var gone []string
	for name := range s.tools {
		if _, ok := next[name]; !ok {
			gone = append(gone, name)
		}
	}
	if len(gone) > 0 {
		s.mcp.RemoveTools(gone...)
	}
	for _, t := range tools {
		s.mcp.AddTool(t.Def, t.Handle)
	}
	s.tools = next
}

// Start listens on 127.0.0.1:port for agents holding code. A plug already
// open is closed first.
func (s *Server) Start(port int, code string) error {
	if err := s.Stop(); err != nil {
		return err
	}
	ln, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err != nil {
		if addrInUse(err) {
			return fmt.Errorf("port %d: %w", port, ErrPortInUse)
		}
		return fmt.Errorf("port %d: %w", port, err)
	}
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return s.mcp }, nil)
	guarded := auth.RequireBearerToken(s.verify, &auth.RequireBearerTokenOptions{AllowMissingExpiration: true})(handler)
	mux := http.NewServeMux()
	mux.Handle(Path, guarded)
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	s.mu.Lock()
	s.code = code
	s.ln = ln
	s.http = srv
	s.mu.Unlock()
	go func() { _ = srv.Serve(ln) }()
	return nil
}

// verify accepts only the current connection code.
func (s *Server) verify(_ context.Context, token string, _ *http.Request) (*auth.TokenInfo, error) {
	s.mu.Lock()
	code := s.code
	s.mu.Unlock()
	if code == "" || subtle.ConstantTimeCompare([]byte(token), []byte(code)) != 1 {
		return nil, auth.ErrInvalidToken
	}
	return &auth.TokenInfo{}, nil
}

// SetCode takes effect at once: every agent connected with the old code is
// dropped and must connect again with the new one.
func (s *Server) SetCode(code string) {
	s.mu.Lock()
	s.code = code
	s.mu.Unlock()
	s.closeSessions()
}

// Stop closes the plug and drops every agent. Stopping a closed plug is
// not an error.
func (s *Server) Stop() error {
	s.mu.Lock()
	srv, ln := s.http, s.ln
	s.http, s.ln, s.code = nil, nil, ""
	s.mu.Unlock()
	s.closeSessions()
	if srv == nil {
		return nil
	}
	// Shutdown closes only the ports already being served; one handed over
	// a moment ago may not be yet, and would keep taking connections.
	_ = ln.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		return srv.Close()
	}
	return nil
}

func (s *Server) closeSessions() {
	for session := range s.mcp.Sessions() {
		_ = session.Close()
	}
}

// Connected is how many agents are connected now.
func (s *Server) Connected() int {
	n := 0
	for range s.mcp.Sessions() {
		n++
	}
	return n
}

// Addr is where the plug listens, or nil when closed.
func (s *Server) Addr() net.Addr {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ln == nil {
		return nil
	}
	return s.ln.Addr()
}
