package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/xcoding1024/bit-tables/tables"
	"github.com/xcoding1024/bit-tables/web"
)

type Server struct {
	rootMu sync.RWMutex
	root   *tables.Root
	Guide  bool
	spa    fs.FS
	mux    http.Handler

	mu      sync.Mutex
	clients map[chan fileEvent]struct{}
	lastSig string
	stop    chan struct{}
}

type fileEvent struct {
	TableID string `json:"tableId,omitempty"`
	Kind    string `json:"kind"`
	Rev     int64  `json:"rev"`
}

func New(root *tables.Root) *Server {
	s := &Server{
		root:    root,
		spa:     openSPA(),
		clients: map[chan fileEvent]struct{}{},
		stop:    make(chan struct{}),
	}
	s.mux = s.routes()
	go s.watchLoop()
	return s
}

func openSPA() fs.FS {
	for _, dir := range spaDirs() {
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
			return os.DirFS(dir)
		}
	}
	sub, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		return web.Dist
	}
	return sub
}

func spaDirs() []string {
	var out []string
	if dir := strings.TrimSpace(os.Getenv("BIT_TABLES_SPA")); dir != "" {
		out = append(out, dir)
	}
	if exe, err := os.Executable(); err == nil {
		out = append(out, filepath.Join(filepath.Dir(exe), "renderer"))
	}
	out = append(out, "frontend/dist", "web/dist")
	return out
}

func (s *Server) Close() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/root", s.getRoot)
	mux.HandleFunc("PUT /api/root", s.putRoot)
	mux.HandleFunc("GET /api/tables", s.listTables)
	mux.HandleFunc("POST /api/tables", s.createTable)
	mux.HandleFunc("DELETE /api/tables/{id}", s.deleteTable)
	mux.HandleFunc("GET /api/tables/{id}/files", s.getFiles)
	mux.HandleFunc("GET /api/tables/{id}/history", s.getHistory)
	mux.HandleFunc("PUT /api/tables/{id}/data", s.putData)
	mux.HandleFunc("GET /api/tables/{id}/editor", s.getEditor)
	mux.HandleFunc("GET /api/tables/{id}/asset", s.getAsset)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /{$}", s.index)
	mux.Handle("GET /web/", http.StripPrefix("/web/", http.FileServer(http.FS(web.FS))))
	mux.Handle("GET /assets/", http.FileServer(http.FS(s.spa)))
	return withCORS(mux)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	b, err := fs.ReadFile(s.spa, "index.html")
	if err != nil {
		http.Error(w, "missing index.html", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

func (s *Server) current() *tables.Root {
	s.rootMu.RLock()
	defer s.rootMu.RUnlock()
	return s.root
}

func (s *Server) snapshot() (*tables.Root, bool) {
	s.rootMu.RLock()
	defer s.rootMu.RUnlock()
	return s.root, s.Guide
}

func (s *Server) setRoot(root *tables.Root, guide bool) {
	s.rootMu.Lock()
	s.root = root
	s.Guide = guide
	s.rootMu.Unlock()
	s.mu.Lock()
	s.lastSig = ""
	s.mu.Unlock()
}

func (s *Server) getRoot(w http.ResponseWriter, r *http.Request) {
	root, guide := s.snapshot()
	writeOK(w, map[string]any{"path": root.Path, "guide": guide})
}

func (s *Server) putRoot(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path   string `json:"path"`
		Sample bool   `json:"sample"`
		Guide  bool   `json:"guide"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "请求体无效")
		return
	}
	if req.Sample && req.Guide {
		writeErr(w, http.StatusBadRequest, "bad_request", "不能同时使用 sample 和 guide")
		return
	}
	root, err := tables.OpenAt(strings.TrimSpace(req.Path), req.Sample)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	s.setRoot(root, req.Guide)
	writeOK(w, map[string]any{"path": root.Path, "guide": req.Guide})
}

func (s *Server) listTables(w http.ResponseWriter, r *http.Request) {
	root := s.current()
	list, err := root.List()
	if err != nil {
		writeTableErr(w, err)
		return
	}
	tree, err := root.Tree()
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, map[string]any{"tables": list, "tree": tree, "path": root.Path})
}

func (s *Server) createTable(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "请求体无效")
		return
	}
	info, err := s.current().Create(strings.TrimSpace(req.ID))
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeCreated(w, info)
}

func (s *Server) deleteTable(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.current().Delete(id); err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, map[string]any{"ok": true, "id": id})
}

func (s *Server) getFiles(w http.ResponseWriter, r *http.Request) {
	files, err := s.current().Files(r.PathValue("id"))
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, files)
}

func (s *Server) getHistory(w http.ResponseWriter, r *http.Request) {
	var kinds []string
	if raw := strings.TrimSpace(r.URL.Query().Get("kinds")); raw != "" {
		kinds = strings.Split(raw, ",")
	}
	hist, err := s.current().History(r.PathValue("id"), kinds)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, hist)
}

func (s *Server) putData(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Data string `json:"data"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "请求体无效")
		return
	}
	id := r.PathValue("id")
	root := s.current()
	if err := root.PutData(id, req.Data); err != nil {
		writeTableErr(w, err)
		return
	}
	files, err := root.Files(id)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, map[string]any{"id": id, "data": files.Data})
}

func (s *Server) getEditor(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	js, err := s.current().EditorJS(id)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			js = tables.FallbackEditorJS()
		} else {
			writeTableErr(w, err)
			return
		}
	}
	html := tables.EditorHTML(js)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, html)
}

func (s *Server) getAsset(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rel := r.URL.Query().Get("path")
	abs, err := s.current().ResolveAsset(id, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeErr(w, http.StatusNotFound, "not_found", "资源不存在")
			return
		}
		writeTableErr(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, abs)
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "internal", "不支持 SSE")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	ch := make(chan fileEvent, 8)
	s.mu.Lock()
	s.clients[ch] = struct{}{}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.clients, ch)
		s.mu.Unlock()
	}()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-ch:
			b, _ := json.Marshal(ev)
			_, _ = io.WriteString(w, "event: file_changed\ndata: "+string(b)+"\n\n")
			flusher.Flush()
		}
	}
}

func (s *Server) watchLoop() {
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			sig, err := s.current().Signature()
			if err != nil {
				continue
			}
			s.mu.Lock()
			prev := s.lastSig
			s.lastSig = sig
			changed := prev != "" && prev != sig
			s.mu.Unlock()
			if changed {
				s.broadcast(fileEvent{Kind: "any", Rev: time.Now().UnixMilli()})
			}
		}
	}
}

func (s *Server) broadcast(ev fileEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for ch := range s.clients {
		select {
		case ch <- ev:
		default:
		}
	}
}

func writeTableErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, tables.ErrBadID):
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
	case errors.Is(err, tables.ErrEscape):
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
	case errors.Is(err, tables.ErrExists):
		writeErr(w, http.StatusConflict, "exists", err.Error())
	case os.IsNotExist(err):
		writeErr(w, http.StatusNotFound, "not_found", "目录或文件不存在")
	default:
		writeErr(w, http.StatusBadRequest, "bad_request", err.Error())
	}
}
