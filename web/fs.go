package web

import "embed"

//go:embed index.html app.js host.js
var FS embed.FS
