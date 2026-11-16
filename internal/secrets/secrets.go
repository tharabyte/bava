// Package secrets keeps Bava's credentials in the system's password safe:
// the Keychain on macOS, Credential Manager on Windows, and inside Flatpak a
// small file sealed with the Secret portal's per-app lock. A value never
// reaches a plain file; with no safe, nothing is kept.
package secrets

import "errors"

// Service names Bava's entries in the safe.
const Service = "com.tharabyte.bava"

var (
	// ErrNoSafe means this system offers no password safe Bava can use, so
	// nothing was kept.
	ErrNoSafe = errors.New("no password safe on this system")
	// ErrNotFound means the safe holds no value under that name.
	ErrNotFound = errors.New("not in the password safe")
)

// Safe keeps values by name. Deleting a name the safe does not hold is not
// an error.
type Safe interface {
	Get(name string) (string, error)
	Set(name, value string) error
	Delete(name string) error
}

// noSafe is the safe of a system that has none.
type noSafe struct{}

func (noSafe) Get(string) (string, error) { return "", ErrNoSafe }
func (noSafe) Set(string, string) error   { return ErrNoSafe }
func (noSafe) Delete(string) error        { return ErrNoSafe }
