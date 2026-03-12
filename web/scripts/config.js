const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_BASE_URL = isLocalhost
  ? "http://localhost:4000/api"
  : "https://replace-me-api.onrender.com/api";
