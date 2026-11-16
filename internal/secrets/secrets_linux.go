package secrets

import (
	"os"
	"path/filepath"

	"github.com/tharabyte/bava/internal/config"
)

// sealedName is the sealed file in Bava's config folder.
const sealedName = "keys.sealed"

// System is, inside Flatpak, a file sealed with the Secret portal's lock for
// Bava. Outside Flatpak there is no safe: the shared secret service would
// show Bava every saved password, so it is not used.
func System() Safe {
	if os.Getenv("FLATPAK_ID") == "" {
		return noSafe{}
	}
	dir, err := config.Dir()
	if err != nil {
		return noSafe{}
	}
	return &fileSafe{path: filepath.Join(dir, sealedName), key: portalKey()}
}
