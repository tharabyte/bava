package secrets

import "sync"

// Memory is a safe that forgets everything when Bava quits; tests use it.
type Memory struct {
	mu     sync.Mutex
	values map[string]string
}

// NewMemory is an empty in-memory safe.
func NewMemory() *Memory { return &Memory{values: map[string]string{}} }

// Get is the value kept under name, or ErrNotFound.
func (m *Memory) Get(name string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	value, ok := m.values[name]
	if !ok {
		return "", ErrNotFound
	}
	return value, nil
}

// Set keeps value under name.
func (m *Memory) Set(name, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.values[name] = value
	return nil
}

// Delete forgets name.
func (m *Memory) Delete(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.values, name)
	return nil
}
