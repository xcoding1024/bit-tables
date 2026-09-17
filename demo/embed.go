package demo

import "embed"

// TemplateFS 为示例项目模板（tables、src、res 与导表脚本等）。
//
//go:embed tables src res export.mjs export.cmd export.ps1 export.sh package.json package-lock.json README.md tsconfig.json
var TemplateFS embed.FS
