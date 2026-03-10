package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/iwwwanow/xtc-toaster/web/handlers"
)

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:3000"
	}

	h := handlers.New(apiURL)
	mux := http.NewServeMux()

	// GET /              — toasts list page
	// GET /toasts/{id}   — toast detail page
	// POST /run          — run image through a toast, return result
	mux.HandleFunc("GET /", h.Index)
	mux.HandleFunc("GET /toasts/{id}", h.ToastDetail)
	mux.HandleFunc("POST /run", h.Run)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("xtc-toaster web listening on :%s\n", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
