package demo

import "embed"

// TemplateFS is the sample project tree (same layout as this demo folder).
//
//go:embed tables src res export.mjs export.cmd export.ps1 export.sh package.json package-lock.json README.md tsconfig.json
var TemplateFS embed.FS
