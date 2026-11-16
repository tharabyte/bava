package secrets

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// partSize is the most Credential Manager keeps in one entry.
const partSize = 2560

// cred is one Credential Manager entry: its bytes, and on the first part the
// number of parts in its comment.
type cred struct {
	blob    []byte
	comment string
}

// credStore is the little of Credential Manager the parts need, so the
// splitting is tested on every system.
type credStore interface {
	read(target string) (cred, error)
	write(target string, c cred) error
	remove(target string) error
}

// partsSafe keeps a value longer than one entry allows over several: the
// first under the name, the rest under name#1, name#2 and on.
type partsSafe struct{ store credStore }

func partTarget(name string, i int) string {
	if i == 0 {
		return Service + "/" + name
	}
	return Service + "/" + name + "#" + strconv.Itoa(i)
}

const partsPrefix = "parts:"

func (p partsSafe) count(name string) (int, cred, error) {
	first, err := p.store.read(partTarget(name, 0))
	if err != nil {
		return 0, cred{}, err
	}
	n, err := strconv.Atoi(strings.TrimPrefix(first.comment, partsPrefix))
	if err != nil || n < 1 || !strings.HasPrefix(first.comment, partsPrefix) {
		return 0, cred{}, fmt.Errorf("password safe entry %s: unreadable part count", name)
	}
	return n, first, nil
}

func (p partsSafe) Get(name string) (string, error) {
	n, first, err := p.count(name)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.Write(first.blob)
	for i := 1; i < n; i++ {
		part, err := p.store.read(partTarget(name, i))
		if err != nil {
			return "", fmt.Errorf("password safe entry %s: part %d of %d missing", name, i+1, n)
		}
		b.Write(part.blob)
	}
	return b.String(), nil
}

func (p partsSafe) Set(name, value string) error {
	old, _, err := p.count(name)
	if err != nil {
		old = 0
	}
	parts := split([]byte(value), partSize)
	// The later parts first, so the first part, which says how many there
	// are, never points at parts not yet written.
	for i := len(parts) - 1; i >= 0; i-- {
		c := cred{blob: parts[i]}
		if i == 0 {
			c.comment = partsPrefix + strconv.Itoa(len(parts))
		}
		if err := p.store.write(partTarget(name, i), c); err != nil {
			return fmt.Errorf("password safe entry %s: %w", name, err)
		}
	}
	for i := len(parts); i < old; i++ {
		_ = p.store.remove(partTarget(name, i))
	}
	return nil
}

func (p partsSafe) Delete(name string) error {
	n, _, err := p.count(name)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		n = 1
	}
	for i := n - 1; i >= 0; i-- {
		if err := p.store.remove(partTarget(name, i)); err != nil && !errors.Is(err, ErrNotFound) {
			return fmt.Errorf("password safe entry %s: %w", name, err)
		}
	}
	return nil
}

// split cuts b into pieces of at most size bytes; an empty value is one
// empty piece, so it is still kept.
func split(b []byte, size int) [][]byte {
	if len(b) == 0 {
		return [][]byte{{}}
	}
	var parts [][]byte
	for len(b) > size {
		parts = append(parts, b[:size])
		b = b[size:]
	}
	return append(parts, b)
}
