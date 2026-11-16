package secrets

import (
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"time"

	"github.com/rymdport/portal/secret"
)

// portalWait is how long the portal may take to hand over the secret.
const portalWait = 30 * time.Second

// portalKey asks the Secret portal once for Bava's own secret, through a
// pipe, and keeps it in memory. A portal that is missing or refuses means
// there is no safe.
func portalKey() keyFunc {
	var (
		mu  sync.Mutex
		key []byte
	)
	return func() ([]byte, error) {
		mu.Lock()
		defer mu.Unlock()
		if key != nil {
			return key, nil
		}
		got, err := retrieve()
		if err != nil {
			return nil, err
		}
		key = got
		return key, nil
	}
}

func retrieve() ([]byte, error) {
	r, w, err := os.Pipe()
	if err != nil {
		return nil, errors.Join(ErrNoSafe, err)
	}
	defer r.Close()

	read := make(chan []byte, 1)
	go func() {
		data, _ := io.ReadAll(r)
		read <- data
	}()

	ctx, cancel := context.WithTimeout(context.Background(), portalWait)
	defer cancel()
	_, err = secret.RetrieveSecretContext(ctx, w.Fd(), nil)
	// The portal holds its own copy of the pipe; closing ours lets the read
	// end once the portal has written and closed.
	w.Close()
	if err != nil {
		return nil, errors.Join(ErrNoSafe, err)
	}
	select {
	case data := <-read:
		if len(data) == 0 {
			return nil, ErrNoSafe
		}
		return data, nil
	case <-ctx.Done():
		return nil, ErrNoSafe
	}
}
