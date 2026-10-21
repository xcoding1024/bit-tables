package server

import (
	"bytes"
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
	windows map[string]*windowWatch
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
		windows: map[string]*windowWatch{},
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
	mux.HandleFunc("GET /api/tables/{id}/snapshot", s.getSnapshot)
	mux.HandleFunc("GET /api/tables/{id}/renderer", s.getRenderer)
	mux.HandleFunc("PUT /api/tables/{id}/data", s.putData)
	mux.HandleFunc("PUT /api/tables/{id}/plugins", s.putPlugins)
	mux.HandleFunc("PUT /api/tables/{id}/state", s.putState)
	mux.HandleFunc("GET /api/plugins", s.getPlugins)
	mux.HandleFunc("GET /api/tables/{id}/editor", s.getEditor)
	mux.HandleFunc("GET /api/tables/{id}/asset", s.getAsset)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /api/export", s.getExport)
	mux.HandleFunc("POST /api/export", s.postExport)
	mux.HandleFunc("GET /{$}", s.index)
	mux.Handle("GET /web/", http.StripPrefix("/web/", http.FileServer(http.FS(web.FS))))
	mux.Handle("GET /assets/", http.FileServer(http.FS(s.spa)))
	return withCORS(s.withWindowRoot(mux))
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
	if scoped, ok := r.Context().Value(windowRootKey{}).(*tables.Root); ok {
		root, guide = scoped, false
	}
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
	if r.URL.Query().Has("rootPath") && !filepath.IsAbs(strings.TrimSpace(req.Path)) {
		writeErr(w, http.StatusBadRequest, "bad_request", "配表目录必须为绝对路径")
		return
	}
	root, err := tables.OpenAt(strings.TrimSpace(req.Path), req.Sample)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	if !r.URL.Query().Has("rootPath") {
		s.setRoot(root, req.Guide)
	}
	writeOK(w, map[string]any{"path": root.Path, "guide": req.Guide})
}

func (s *Server) listTables(w http.ResponseWriter, r *http.Request) {
	root := s.requestRoot(r)
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
	info, err := s.requestRoot(r).Create(strings.TrimSpace(req.ID))
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeCreated(w, info)
}

func (s *Server) deleteTable(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.requestRoot(r).Delete(id); err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, map[string]any{"ok": true, "id": id})
}

func (s *Server) getFiles(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("view") == "excel-hashes" {
		books, err := s.requestRoot(r).ExcelHashes(r.PathValue("id"))
		if err != nil {
			writeTableErr(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeOK(w, map[string]any{"excel": books})
		return
	}
	if r.URL.Query().Get("view") == "export" {
		src, err := s.requestRoot(r).ExportSource(r.PathValue("id"))
		if err != nil {
			writeTableErr(w, err)
			return
		}
		writeOK(w, src)
		return
	}
	files, err := s.requestRoot(r).Files(r.PathValue("id"))
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
	hist, err := s.requestRoot(r).History(r.PathValue("id"), kinds)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, hist)
}

func (s *Server) getSnapshot(w http.ResponseWriter, r *http.Request) {
	snapshot, err := s.requestRoot(r).Snapshot(r.Context(), r.PathValue("id"), r.URL.Query().Get("revision"))
	if err != nil {
		writeTableErr(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeOK(w, snapshot)
}

func (s *Server) getRenderer(w http.ResponseWriter, r *http.Request) {
	js, err := s.requestRoot(r).ComparisonScript(r.Context(), r.PathValue("id"), r.URL.Query().Get("revision"))
	if err != nil {
		writeTableErr(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeOK(w, map[string]string{"html": tables.ComparisonEditorHTML(js)})
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
	root := s.requestRoot(r)
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

func (s *Server) putState(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Data    *string `json:"data"`
		Plugins *string `json:"plugins"`
	}
	if err := decodeJSON(r, &req); err != nil || req.Data == nil || req.Plugins == nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "请求体必须包含 data 和 plugins")
		return
	}
	id := r.PathValue("id")
	if err := s.requestRoot(r).PutState(id, *req.Data, *req.Plugins); err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, map[string]any{"id": id, "data": *req.Data, "plugins": *req.Plugins})
}

func (s *Server) putPlugins(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Plugins string `json:"plugins"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "请求体无效")
		return
	}
	id := r.PathValue("id")
	root := s.requestRoot(r)
	if err := root.PutPlugins(id, req.Plugins); err != nil {
		writeTableErr(w, err)
		return
	}
	files, err := root.Files(id)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	writeOK(w, map[string]any{"id": id, "plugins": files.Plugins})
}

func (s *Server) getPlugins(w http.ResponseWriter, r *http.Request) {
	writeOK(w, map[string]any{"script": s.requestRoot(r).GenericPluginsJS()})
}

func (s *Server) getEditor(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	js, err := s.requestRoot(r).EditorJS(id)
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
	if revision := r.URL.Query().Get("revision"); revision != "" {
		data, err := s.requestRoot(r).ComparisonAsset(r.Context(), r.PathValue("id"), revision, r.URL.Query().Get("path"))
		if err != nil {
			writeTableErr(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeContent(w, r, filepath.Base(r.URL.Query().Get("path")), time.Time{}, bytes.NewReader(data))
		return
	}
	id := r.PathValue("id")
	rel := r.URL.Query().Get("path")
	abs, err := s.requestRoot(r).ResolveAsset(id, rel)
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

func (s *Server) getExport(w http.ResponseWriter, r *http.Request) {
	root := s.requestRoot(r)
	writeOK(w, map[string]any{
		"client": root.ExportDir(tables.ExportSideClient),
		"server": root.ExportDir(tables.ExportSideServer),
	})
}

func (s *Server) postExport(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Client []tables.ExportFile `json:"client"`
		Server []tables.ExportFile `json:"server"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "请求体无效")
		return
	}
	root := s.requestRoot(r)
	written, err := root.WriteExportFiles(req.Client, req.Server)
	if err != nil {
		writeTableErr(w, err)
		return
	}
	if written == nil {
		written = []tables.ExportWritten{}
	}
	writeOK(w, map[string]any{
		"client":  root.ExportDir(tables.ExportSideClient),
		"server":  root.ExportDir(tables.ExportSideServer),
		"written": written,
	})
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
	clients := s.clients
	key := ""
	if r.URL.Query().Has("rootPath") {
		root := s.requestRoot(r)
		key = root.Path
		watch := s.windows[key]
		if watch == nil {
			sig, _ := root.Signature()
			watch = &windowWatch{root: root, signature: sig, clients: map[chan fileEvent]struct{}{}}
			s.windows[key] = watch
		}
		clients = watch.clients
	}
	clients[ch] = struct{}{}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(clients, ch)
		if key != "" && len(clients) == 0 {
			delete(s.windows, key)
		}
		s.mu.Unlock()
	}()

	flusher.Flush()
	ctx := r.Context()
	for {
		select {
		case <-s.stop:
			return
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
			s.pollWindowRoots()
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
