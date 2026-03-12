import { api } from "./api.js";

const form = document.querySelector("[data-auth-form]");
const errorNode = document.querySelector("[data-error]");

function getAuthCallbackURL() {
  const url = new URL("./chat.html", window.location.href);

  if (url.hostname === "127.0.0.1") {
    url.hostname = "localhost";
  }

  return url.toString();
}

function setError(message = "") {
  if (!errorNode) {
    return;
  }

  errorNode.textContent = message;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");

    const formData = new FormData(form);
    const mode = form.getAttribute("data-auth-form");
    const callbackURL = getAuthCallbackURL();
    const payload =
      mode === "register"
        ? {
            name: String(formData.get("name") || ""),
            email: String(formData.get("email") || ""),
            password: String(formData.get("password") || ""),
            callbackURL,
          }
        : {
            email: String(formData.get("email") || ""),
            password: String(formData.get("password") || ""),
            callbackURL,
          };

    try {
      await api(mode === "register" ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const session = await api("/auth/session");
      if (!session.user) {
        throw new Error("Sign-in succeeded, but no session was returned.");
      }

      window.location.href = "./chat.html";
    } catch (error) {
      setError(error instanceof Error ? error.message : "Authentication failed.");
    }
  });
}
