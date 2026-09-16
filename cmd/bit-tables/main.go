package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/xcoding1024/bit-tables/server"
	"github.com/xcoding1024/bit-tables/tables"
)

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 || os.Args[1] != "serve" {
		fmt.Fprintf(os.Stderr, "用法: bit-tables serve <root> [--addr 127.0.0.1:18780]\n")
		os.Exit(2)
	}
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:18780", "监听地址")
	_ = fs.Parse(os.Args[2:])
	rootPath := fs.Arg(0)
	if rootPath == "" {
		fmt.Fprintf(os.Stderr, "用法: bit-tables serve <root> [--addr 127.0.0.1:18780]\n")
		os.Exit(2)
	}
	abs, err := filepath.Abs(rootPath)
	if err != nil {
		log.Fatal(err)
	}
	root, err := tables.Open(abs)
	if err != nil {
		log.Fatal(err)
	}
	srv := server.New(root)
	defer srv.Close()
	log.Printf("bit-tables %s → http://%s", root.Path, *addr)
	if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
