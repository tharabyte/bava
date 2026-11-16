package app

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/tharabyte/bava/internal/agent"
	"github.com/tharabyte/bava/internal/secrets"
)

// The page's answer, through the bound method, reaches the tool that asked.
func TestAgentServiceAnswerReachesTheAsk(t *testing.T) {
	asked := make(chan agent.Ask, 1)
	asker := agent.NewAsker(func(a agent.Ask) bool { asked <- a; return true }, time.Second)
	service := NewAgentService(AgentServiceOptions{Asker: asker})
	go func() {
		a := <-asked
		service.Answer(a.ID, `{"path":"Notes.md"}`, "")
	}()
	raw, err := asker.Ask(context.Background(), "openPage", nil)
	if err != nil || string(raw) != `{"path":"Notes.md"}` {
		t.Fatalf("Ask: %s, %v", raw, err)
	}
}

// Settings reach the plug through the service, and the plug's state comes back.
func TestAgentServiceConfiguresThePlug(t *testing.T) {
	plug := agent.NewPlug(agent.PlugOptions{Safe: secrets.NewMemory()})
	service := NewAgentService(AgentServiceOptions{Plug: plug})
	t.Cleanup(func() { service.Configure(false, 0, false) })
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	status := service.Configure(true, port, true)
	if !status.On || !status.Editing || status.Code == "" {
		t.Fatalf("Configure: %+v", status)
	}
	if fresh := service.NewCode(); fresh.Code == status.Code {
		t.Fatal("NewCode kept the old code")
	}
	if off := service.Configure(false, port, false); off.On || service.Status().On {
		t.Fatalf("still on: %+v", off)
	}
}
