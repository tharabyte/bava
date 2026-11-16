package secrets

import (
	"errors"
	"fmt"

	"github.com/keybase/go-keychain"
)

// System is the Keychain.
func System() Safe { return keychainSafe{} }

// keychainSafe keeps each value as a generic password under Bava's service,
// in the login keychain.
type keychainSafe struct{}

func query(name string) keychain.Item {
	item := keychain.NewItem()
	item.SetSecClass(keychain.SecClassGenericPassword)
	item.SetService(Service)
	item.SetAccount(name)
	return item
}

func (keychainSafe) Get(name string) (string, error) {
	item := query(name)
	item.SetMatchLimit(keychain.MatchLimitOne)
	item.SetReturnData(true)
	results, err := keychain.QueryItem(item)
	if err != nil {
		return "", fmt.Errorf("keychain: %w", err)
	}
	if len(results) == 0 {
		return "", ErrNotFound
	}
	return string(results[0].Data), nil
}

func (keychainSafe) Set(name, value string) error {
	item := query(name)
	item.SetLabel("Bava")
	item.SetData([]byte(value))
	err := keychain.AddItem(item)
	if errors.Is(err, keychain.ErrorDuplicateItem) {
		update := keychain.NewItem()
		update.SetData([]byte(value))
		err = keychain.UpdateItem(query(name), update)
	}
	if err != nil {
		return fmt.Errorf("keychain: %w", err)
	}
	return nil
}

func (keychainSafe) Delete(name string) error {
	err := keychain.DeleteItem(query(name))
	if err != nil && !errors.Is(err, keychain.ErrorItemNotFound) {
		return fmt.Errorf("keychain: %w", err)
	}
	return nil
}
