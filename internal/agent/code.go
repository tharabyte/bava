package agent

import (
	"crypto/rand"
	"errors"
	"math/big"
	"strings"

	"github.com/tharabyte/bava/internal/secrets"
)

// codeName is the connection code's entry in the password safe.
const codeName = "agent-code"

// codeAlphabet leaves out 0, O, 1, I and L, which read alike.
const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

// randomCode is 16 characters from crypto/rand in four groups of four.
func randomCode() (string, error) {
	var b strings.Builder
	limit := big.NewInt(int64(len(codeAlphabet)))
	for i := range 16 {
		if i > 0 && i%4 == 0 {
			b.WriteByte('-')
		}
		n, err := rand.Int(rand.Reader, limit)
		if err != nil {
			return "", err
		}
		b.WriteByte(codeAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// LoadCode is the connection code kept in the safe, made and kept on first
// use. With no safe it still gives a code, good until Bava quits, together
// with secrets.ErrNoSafe.
func LoadCode(safe secrets.Safe) (string, error) {
	code, err := safe.Get(codeName)
	if err == nil && code != "" {
		return code, nil
	}
	if err != nil && !errors.Is(err, secrets.ErrNotFound) && !errors.Is(err, secrets.ErrNoSafe) {
		return "", err
	}
	return NewCode(safe)
}

// NewCode makes a fresh connection code and keeps it in the safe. With no
// safe it gives the code together with secrets.ErrNoSafe.
func NewCode(safe secrets.Safe) (string, error) {
	code, err := randomCode()
	if err != nil {
		return "", err
	}
	if err := safe.Set(codeName, code); err != nil {
		if errors.Is(err, secrets.ErrNoSafe) {
			return code, err
		}
		return "", err
	}
	return code, nil
}
