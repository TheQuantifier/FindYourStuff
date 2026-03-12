const { hostname, protocol } = window.location;
const isLocalhost = ["localhost", "127.0.0.1"].includes(hostname);

export const API_BASE_URL = isLocalhost
  ? `${protocol}//${hostname}:4000/api`
  : "https://replace-me-api.onrender.com/api";
