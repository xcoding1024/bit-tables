package server

import (
	"context"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/xcoding1024/bit-tables/tables"
)

type windowRootKey struct{}

type windowWatch struct {
	root      *tables.Root
	signature string
	clients   map[chan fileEvent]struct{}
}

func (s *Server) withWindowRoot(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Query().Has("rootPath") {
			dir := strings.TrimSpace(r.URL.Query().Get("rootPath"))
			if !filepath.IsAbs(dir) || strings.ContainsAny(dir, "\x00\r\n") {
				writeErr(w, http.StatusBadRequest, "bad_request", "配表目录必须为绝对路径")
				return
			}
			if r.Method != http.MethodPut || r.URL.Path != "/api/root" {
				root, err := tables.Open(dir)
				if err != nil {
					writeTableErr(w, err)
					return
				}
				r = r.WithContext(context.WithValue(r.Context(), windowRootKey{}, root))
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requestRoot(r *http.Request) *tables.Root {
	if root, ok := r.Context().Value(windowRootKey{}).(*tables.Root); ok {
		return root
	}
	return s.current()
}

func (s *Server) pollWindowRoots() {
	s.mu.Lock()
	watches := make([]*windowWatch, 0, len(s.windows))
	for _, watch := range s.windows {
		watches = append(watches, watch)
	}
	s.mu.Unlock()
	for _, watch := range watches {
		sig, err := watch.root.Signature()
		if err != nil {
			continue
		}
		s.mu.Lock()
		if watch.signature != "" && watch.signature != sig {
			for ch := range watch.clients {
				select {
				case ch <- fileEvent{Kind: "any", Rev: time.Now().UnixMilli()}:
				default:
				}
			}
		}
		watch.signature = sig
		s.mu.Unlock()
	}
}
