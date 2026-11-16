package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"sync"
	"time"
)

// AskEvent carries a question to the page; the page answers through
// AgentService.Answer.
const AskEvent = "agent:ask"

// AskTimeout is how long the page has to answer.
const AskTimeout = 10 * time.Second

var (
	// ErrNoWindow means no window is open to answer.
	ErrNoWindow = errors.New("no Bava window is open")
	// ErrNoAnswer means the page did not answer in time.
	ErrNoAnswer = errors.New("the page did not answer in time")
)

// Ask is one question for the page: what only the page knows, such as the
// open page as on screen, the selection, or icon names.
type Ask struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Args any    `json:"args"`
}

type answer struct {
	result json.RawMessage
	err    error
}

// Asker matches each answer from the page to its question.
type Asker struct {
	emit    func(Ask) bool
	timeout time.Duration

	mu      sync.Mutex
	next    uint64
	waiting map[string]chan answer
}

// NewAsker asks through emit, which reports false when no window is open,
// and waits at most timeout for each answer.
func NewAsker(emit func(Ask) bool, timeout time.Duration) *Asker {
	return &Asker{emit: emit, timeout: timeout, waiting: map[string]chan answer{}}
}

// Ask sends a question and waits for its answer, the page's JSON.
func (a *Asker) Ask(ctx context.Context, kind string, args any) (json.RawMessage, error) {
	a.mu.Lock()
	a.next++
	id := "ask-" + strconv.FormatUint(a.next, 10)
	reply := make(chan answer, 1)
	a.waiting[id] = reply
	a.mu.Unlock()
	defer a.forget(id)

	if !a.emit(Ask{ID: id, Kind: kind, Args: args}) {
		return nil, ErrNoWindow
	}
	timer := time.NewTimer(a.timeout)
	defer timer.Stop()
	select {
	case got := <-reply:
		return got.result, got.err
	case <-timer.C:
		return nil, ErrNoAnswer
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (a *Asker) forget(id string) {
	a.mu.Lock()
	delete(a.waiting, id)
	a.mu.Unlock()
}

// Answer hands the page's answer to the question with that id: result is
// JSON, or failure says why the page could not answer. An answer to a
// question no longer waiting is dropped.
func (a *Asker) Answer(id, result, failure string) {
	a.mu.Lock()
	reply, ok := a.waiting[id]
	delete(a.waiting, id)
	a.mu.Unlock()
	if !ok {
		return
	}
	if failure != "" {
		reply <- answer{err: errors.New(failure)}
		return
	}
	reply <- answer{result: json.RawMessage(result)}
}

// WindowClosed ends every question in flight: no one is left to answer.
func (a *Asker) WindowClosed() {
	a.mu.Lock()
	waiting := a.waiting
	a.waiting = map[string]chan answer{}
	a.mu.Unlock()
	for _, reply := range waiting {
		reply <- answer{err: ErrNoWindow}
	}
}

func (a *Asker) waitingCount() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.waiting)
}
