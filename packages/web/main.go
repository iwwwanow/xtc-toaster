package main

import (
	"fmt"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	// TODO: GET /           — list toasts (htmx + alpinejs + owo styles)
	// TODO: GET /toasts/:id — toast preview page
	// TODO: POST /run       — run image through a toast, return result

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "xtc-toaster web")
	})

	fmt.Println("web listening on :8080")
	http.ListenAndServe(":8080", mux)
}
