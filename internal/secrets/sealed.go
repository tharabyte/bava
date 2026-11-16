package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

// keyFunc gives the secret the file is sealed with.
type keyFunc func() ([]byte, error)

// fileSafe keeps every value in one file sealed with AES-GCM under a key
// drawn from the given secret, a fresh nonce on every write. The file holds
// no name or value in plain text.
type fileSafe struct {
	path string
	key  keyFunc
	mu   sync.Mutex
}

// sealedFile is what reaches the disk.
type sealedFile struct {
	Version int    `json:"version"`
	Nonce   []byte `json:"nonce"`
	Sealed  []byte `json:"sealed"`
}

const sealedVersion = 1

var sealedLabel = []byte(Service + " sealed keys v1")

func (f *fileSafe) aead() (cipher.AEAD, error) {
	secret, err := f.key()
	if err != nil {
		return nil, err
	}
	if len(secret) < 16 {
		return nil, fmt.Errorf("password safe: the system's secret is too short")
	}
	key, err := hkdf.Key(sha256.New, secret, nil, string(sealedLabel), 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// load opens the file; a missing file is an empty safe.
func (f *fileSafe) load(aead cipher.AEAD) (map[string]string, error) {
	data, err := os.ReadFile(f.path)
	if errors.Is(err, fs.ErrNotExist) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("password safe: %w", err)
	}
	var file sealedFile
	if err := json.Unmarshal(data, &file); err != nil || file.Version != sealedVersion {
		return nil, errors.New("password safe: the sealed file is unreadable")
	}
	plain, err := aead.Open(nil, file.Nonce, file.Sealed, sealedLabel)
	if err != nil {
		return nil, errors.New("password safe: the sealed file does not open with this system's secret")
	}
	values := map[string]string{}
	if err := json.Unmarshal(plain, &values); err != nil {
		return nil, errors.New("password safe: the sealed file is unreadable")
	}
	return values, nil
}

func (f *fileSafe) store(aead cipher.AEAD, values map[string]string) error {
	plain, err := json.Marshal(values)
	if err != nil {
		return err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	data, err := json.Marshal(sealedFile{
		Version: sealedVersion,
		Nonce:   nonce,
		Sealed:  aead.Seal(nil, nonce, plain, sealedLabel),
	})
	if err != nil {
		return err
	}
	return writePrivate(f.path, data)
}

func (f *fileSafe) Get(name string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	aead, err := f.aead()
	if err != nil {
		return "", err
	}
	values, err := f.load(aead)
	if err != nil {
		return "", err
	}
	value, ok := values[name]
	if !ok {
		return "", ErrNotFound
	}
	return value, nil
}

func (f *fileSafe) Set(name, value string) error {
	return f.change(func(values map[string]string) bool {
		values[name] = value
		return true
	})
}

func (f *fileSafe) Delete(name string) error {
	return f.change(func(values map[string]string) bool {
		_, had := values[name]
		delete(values, name)
		return had
	})
}

func (f *fileSafe) change(apply func(map[string]string) bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	aead, err := f.aead()
	if err != nil {
		return err
	}
	values, err := f.load(aead)
	if err != nil {
		return err
	}
	if !apply(values) {
		return nil
	}
	return f.store(aead, values)
}

// writePrivate writes data readable by its owner only, through a temporary
// file beside it renamed into place, so a crash leaves the old file whole.
func writePrivate(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("password safe: %w", err)
	}
	temp, err := os.CreateTemp(dir, ".bava-*.tmp")
	if err != nil {
		return fmt.Errorf("password safe: %w", err)
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return fmt.Errorf("password safe: %w", err)
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return fmt.Errorf("password safe: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("password safe: %w", err)
	}
	if err := os.Rename(name, path); err != nil {
		return fmt.Errorf("password safe: %w", err)
	}
	return nil
}
