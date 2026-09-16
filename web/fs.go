package web

import "embed"

//go:embed host.js
var FS embed.FS

//go:embed all:dist
var Dist embed.FS
