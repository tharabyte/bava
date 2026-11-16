package secrets

import (
	"errors"
	"fmt"

	"github.com/danieljoos/wincred"
)

// System is Credential Manager, a long value kept over several entries.
func System() Safe { return partsSafe{store: wincredStore{}} }

// wincredStore keeps generic credentials for this user on this machine.
type wincredStore struct{}

func (wincredStore) read(target string) (cred, error) {
	c, err := wincred.GetGenericCredential(target)
	if errors.Is(err, wincred.ErrElementNotFound) {
		return cred{}, ErrNotFound
	}
	if err != nil {
		return cred{}, fmt.Errorf("credential manager: %w", err)
	}
	return cred{blob: c.CredentialBlob, comment: c.Comment}, nil
}

func (wincredStore) write(target string, c cred) error {
	entry := wincred.NewGenericCredential(target)
	entry.CredentialBlob = c.blob
	entry.Comment = c.comment
	entry.UserName = "Bava"
	if err := entry.Write(); err != nil {
		return fmt.Errorf("credential manager: %w", err)
	}
	return nil
}

func (wincredStore) remove(target string) error {
	c, err := wincred.GetGenericCredential(target)
	if errors.Is(err, wincred.ErrElementNotFound) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("credential manager: %w", err)
	}
	if err := c.Delete(); err != nil {
		return fmt.Errorf("credential manager: %w", err)
	}
	return nil
}
