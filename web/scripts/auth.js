import { api } from "./api.js";

const form = document.querySelector("[data-auth-form]");
const errorNode = document.querySelector("[data-error]");

function getAuthCallbackURL() {
  return new URL("./chat.html", window.location.href).toString();
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
