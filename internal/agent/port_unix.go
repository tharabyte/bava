//go:build !windows

package agent

import (
	"errors"
	"syscall"
)

func addrInUse(err error) bool { return errors.Is(err, syscall.EADDRINUSE) }
