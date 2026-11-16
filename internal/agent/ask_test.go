package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

// page records what was asked and answers on cue, as the window does.
type page struct {
	mu   sync.Mutex
	asks []Ask
	got  chan Ask
}

func newPage() *page { return &page{got: make(chan Ask, 16)} }

func (p *page) emit(a Ask) bool {
	p.mu.Lock()
	p.asks = append(p.asks, a)
	p.mu.Unlock()
	p.got <- a
	return true
}

func TestAskAnswerReachesItsOwnAsk(t *testing.T) {
	p := newPage()
	asker := NewAsker(p.emit, time.Second)
	results := make(chan string, 3)
	for _, kind := range []string{"openPage", "selection", "icons"} {
		go func() {
			raw, err := asker.Ask(context.Background(), kind, nil)
			if err != nil {
				results <- "error: " + err.Error()
				return
			}
			var s string
			_ = json.Unmarshal(raw, &s)
			results <- kind + "=" + s
		}()
	}
	var asks []Ask
	for range 3 {
		asks = append(asks, <-p.got)
	}
	// Answered in reverse, each with its own kind's name.
	for i := len(asks) - 1; i >= 0; i-- {
		asker.Answer(asks[i].ID, fmt.Sprintf("%q", "answer for "+asks[i].Kind), "")
	}
	seen := map[string]bool{}
	for range 3 {
		seen[<-results] = true
	}
	for _, kind := range []string{"openPage", "selection", "icons"} {
		if !seen[kind+"=answer for "+kind] {
			t.Fatalf("%s did not get its own answer: %v", kind, seen)
		}
	}
}

func TestAskTimesOut(t *testing.T) {
	asker := NewAsker(newPage().emit, 50*time.Millisecond)
	start := time.Now()
	_, err := asker.Ask(context.Background(), "openPage", nil)
	if !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("got %v, want ErrNoAnswer", err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("the timeout did not end the ask")
	}
}

func TestAskLateAnswerIsIgnored(t *testing.T) {
	p := newPage()
	asker := NewAsker(p.emit, 50*time.Millisecond)
	_, _ = asker.Ask(context.Background(), "openPage", nil)
	late := <-p.got
	asker.Answer(late.ID, `"late"`, "") // must not panic or reach the next ask

	go func() {
		next := <-p.got
		asker.Answer(next.ID, `"fresh"`, "")
	}()
	raw, err := asker.Ask(context.Background(), "openPage", nil)
	if err != nil || string(raw) != `"fresh"` {
		t.Fatalf("next ask: %s, %v", raw, err)
	}
	if asker.waitingCount() != 0 {
		t.Fatalf("asks left waiting: %d", asker.waitingCount())
	}
}

func TestAskPageErrorIsTheAnswer(t *testing.T) {
	p := newPage()
	asker := NewAsker(p.emit, time.Second)
	go func() {
		a := <-p.got
		asker.Answer(a.ID, "", "no page is open")
	}()
	_, err := asker.Ask(context.Background(), "openPage", nil)
	if err == nil || err.Error() != "no page is open" {
		t.Fatalf("got %v, want the page's error", err)
	}
}

func TestAskWithNoWindowFailsAtOnce(t *testing.T) {
	asker := NewAsker(func(Ask) bool { return false }, time.Minute)
	start := time.Now()
	_, err := asker.Ask(context.Background(), "openPage", nil)
	if !errors.Is(err, ErrNoWindow) {
		t.Fatalf("got %v, want ErrNoWindow", err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("waited for a window that is not there")
	}
}

func TestAskWindowClosingEndsAsksInFlight(t *testing.T) {
	p := newPage()
	asker := NewAsker(p.emit, time.Minute)
	done := make(chan error, 1)
	go func() {
		_, err := asker.Ask(context.Background(), "openPage", nil)
		done <- err
	}()
	<-p.got
	asker.WindowClosed()
	select {
	case err := <-done:
		if !errors.Is(err, ErrNoWindow) {
			t.Fatalf("got %v, want ErrNoWindow", err)
		}
	case <-time.After(time.Second):
		t.Fatal("the ask kept waiting after the window closed")
	}
}

func TestAskCarriesKindAndArgs(t *testing.T) {
	p := newPage()
	asker := NewAsker(p.emit, 50*time.Millisecond)
	_, _ = asker.Ask(context.Background(), "icons", map[string]string{"query": "database"})
	a := <-p.got
	data, _ := json.Marshal(a)
	var back map[string]any
	_ = json.Unmarshal(data, &back)
	if back["kind"] != "icons" || back["id"] == "" || back["args"].(map[string]any)["query"] != "database" {
		t.Fatalf("ask as sent: %s", data)
	}
}
