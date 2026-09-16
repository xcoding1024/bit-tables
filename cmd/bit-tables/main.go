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

const usage = "用法: bit-tables serve <root> [--addr 127.0.0.1:18780] [--sample] [--guide]"

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 || os.Args[1] != "serve" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fs.String("addr", "127.0.0.1:18780", "监听地址")
	sample := fs.Bool("sample", false, "空目录时写入 item 示例表")
	guide := fs.Bool("guide", false, "桌面引导页（空占位根）")
	_ = fs.Parse(os.Args[2:])
	rootPath := fs.Arg(0)
	if rootPath == "" {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	if *sample && *guide {
		log.Fatal("不能同时使用 --sample 和 --guide")
	}
	abs, err := filepath.Abs(rootPath)
	if err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		log.Fatal(err)
	}
	var root *tables.Root
	if *sample {
		root, err = seedIfEmpty(abs)
	} else {
		root, err = tables.Open(abs)
	}
	if err != nil {
		log.Fatal(err)
	}
	srv := server.New(root)
	srv.Guide = *guide
	defer srv.Close()
	log.Printf("bit-tables %s → http://%s", root.Path, *addr)
	if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}

func seedIfEmpty(abs string) (*tables.Root, error) {
	root, err := tables.Open(abs)
	if err != nil {
		return nil, err
	}
	list, err := root.List()
	if err != nil {
		return nil, err
	}
	if len(list) > 0 {
		return root, nil
	}
	if err := root.SeedItem("item"); err != nil {
		return nil, err
	}
	return root, nil
}
