package agent

import (
	"errors"
	"slices"
	"sync"
)

var (
	// ErrNotClaimed: a change to a page the AI has not claimed.
	ErrNotClaimed = errors.New("the page is not claimed")
	// ErrStopped: the user pressed Stop on the page this round.
	ErrStopped = errors.New("the user stopped the AI on the page")
)

// Claims are the pages the AI holds, read-only for the user until each is
// released or stopped. They live in memory: quitting Bava releases them
// all. A round ends when its last claim ends; until then a page the user
// stopped refuses every change and a new claim.
type Claims struct {
	mu      sync.Mutex
	held    map[string]bool
	stopped map[string]bool
	changed func(pages []string)
}

// NewClaims holds nothing; changed hears the pages held after each change.
func NewClaims(changed func(pages []string)) *Claims {
	return &Claims{held: map[string]bool{}, stopped: map[string]bool{}, changed: changed}
}

// Take claims page. A page stopped this round is refused.
func (c *Claims) Take(page string) error {
	c.mu.Lock()
	if c.stopped[page] {
		c.mu.Unlock()
		return ErrStopped
	}
	c.held[page] = true
	c.mu.Unlock()
	c.tell()
	return nil
}

// Release ends a claim, reporting whether the page was held.
func (c *Claims) Release(page string) bool {
	c.mu.Lock()
	had := c.held[page]
	delete(c.held, page)
	c.endRoundIfEmpty()
	c.mu.Unlock()
	if had {
		c.tell()
	}
	return had
}

// Stop is the user's Stop on the page: the claim ends, and any later claim
// or change to the page is refused until the agent finishes other work (a
// round ending by release), agents go, or the AI settings turn off. A Stop
// never ends its own round, or the agent could take the page straight back.
func (c *Claims) Stop(page string) {
	c.mu.Lock()
	delete(c.held, page)
	c.stopped[page] = true
	c.mu.Unlock()
	c.tell()
}

// ReleaseAll ends every claim and the round.
func (c *Claims) ReleaseAll() {
	c.mu.Lock()
	had := len(c.held) > 0
	c.held = map[string]bool{}
	c.stopped = map[string]bool{}
	c.mu.Unlock()
	if had {
		c.tell()
	}
}

// Check says whether the AI may change page now.
func (c *Claims) Check(page string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stopped[page] {
		return ErrStopped
	}
	if !c.held[page] {
		return ErrNotClaimed
	}
	return nil
}

// Held is the pages claimed now, sorted.
func (c *Claims) Held() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.heldLocked()
}

func (c *Claims) heldLocked() []string {
	pages := make([]string, 0, len(c.held))
	for page := range c.held {
		pages = append(pages, page)
	}
	slices.Sort(pages)
	return pages
}

// endRoundIfEmpty: with no claim left the round is over, and what the user
// stopped in it no longer bars a new claim. Called with mu held.
func (c *Claims) endRoundIfEmpty() {
	if len(c.held) == 0 {
		c.stopped = map[string]bool{}
	}
}

func (c *Claims) tell() {
	if c.changed != nil {
		c.changed(c.Held())
	}
}
