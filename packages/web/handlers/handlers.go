package handlers

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"path/filepath"
	"runtime"
)

type Toast struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	PreviewURL  string  `json:"preview_url"`
	CreatedAt   string  `json:"created_at"`
}

type Handler struct {
	apiURL    string
	templates *template.Template
}

func New(apiURL string) *Handler {
	_, filename, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(filename), "..", "templates", "*.html")
	tmpl := template.Must(template.ParseGlob(dir))
	return &Handler{apiURL: apiURL, templates: tmpl}
}

// GET / — list all toasts
func (h *Handler) Index(w http.ResponseWriter, r *http.Request) {
	toasts, err := h.fetchToasts()
	if err != nil {
		http.Error(w, "failed to fetch toasts", http.StatusBadGateway)
		return
	}
	h.render(w, "index.html", map[string]any{"Toasts": toasts})
}

// GET /toasts/{id} — toast detail
func (h *Handler) ToastDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	toast, err := h.fetchToast(id)
	if err != nil {
		http.Error(w, "toast not found", http.StatusNotFound)
		return
	}
	h.render(w, "toast.html", map[string]any{"Toast": toast})
}

// POST /run — stub: run image through a toast
// Form: toast_id, image (file)
// TODO: forward image to core processing, return result image
func (h *Handler) Run(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return
	}
	toastID := r.FormValue("toast_id")
	if toastID == "" {
		http.Error(w, "toast_id is required", http.StatusBadRequest)
		return
	}
	// TODO: process image through toast
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"stub","toast_id":%q}`, toastID)
}

func (h *Handler) fetchToasts() ([]Toast, error) {
	resp, err := http.Get(h.apiURL + "/toasts")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var toasts []Toast
	return toasts, json.NewDecoder(resp.Body).Decode(&toasts)
}

func (h *Handler) fetchToast(id string) (*Toast, error) {
	resp, err := http.Get(h.apiURL + "/toasts/" + id)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("not found")
	}
	var toast Toast
	return &toast, json.NewDecoder(resp.Body).Decode(&toast)
}

func (h *Handler) render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := h.templates.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
