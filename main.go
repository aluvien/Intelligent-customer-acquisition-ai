package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "service": "platform-adapter", "status": "unverified"})
	})
	mux.HandleFunc("/oauth/douyin", platformUnverified)
	mux.HandleFunc("/oauth/callback", platformUnverified)
	mux.HandleFunc("/api/channel/douyin/start", platformUnverified)
	mux.HandleFunc("/api/channel/douyin/stop", platformUnverified)
	mux.HandleFunc("/api/status", platformUnverified)
	mux.HandleFunc("/api/test/simulate", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusGone, map[string]any{"success": false, "code": "SIMULATION_REMOVED", "message": "生产适配器不提供模拟事件接口"})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]any{"success": false, "code": "NOT_FOUND", "message": "接口不存在"})
	})

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
func platformUnverified(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]any{"success": false, "code": "PLATFORM_UNVERIFIED", "message": "平台能力尚未完成当前应用的真实核验"})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
