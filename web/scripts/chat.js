import { api } from "./api.js";

const userLabel = document.querySelector("#user-label");
const itemGrid = document.querySelector("#item-grid");
const emptyState = document.querySelector("#empty-state");
const chatForm = document.querySelector("#chat-form");
const chatLog = document.querySelector("#chat-log");
const chatError = document.querySelector("#chat-error");
const logoutButton = document.querySelector("#logout-button");
const adminLink = document.querySelector("#admin-link");

function appendMessage(role, content) {
  const article = document.createElement("article");
  article.className = `bubble bubble-${role}`;

  const label = document.createElement("span");
  label.className = "bubble-role";
  label.textContent = role === "assistant" ? "Assistant" : "You";

  const paragraph = document.createElement("p");
  paragraph.textContent = content;

  article.append(label, paragraph);
  chatLog.append(article);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderItems(items) {
  itemGrid.innerHTML = "";
  emptyState.classList.toggle("hidden", items.length > 0);

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "item-card";
    li.innerHTML = `
      <p class="item-name"></p>
      <p class="item-location"></p>
      <div class="item-meta">
        <span>${item.category || "uncategorized"}</span>
        <span>${new Date(item.updatedAt).toLocaleDateString()}</span>
      </div>
    `;
    li.querySelector(".item-name").textContent = item.itemName;
    li.querySelector(".item-location").textContent = item.locationDescription;
    itemGrid.append(li);
  }
}

async function bootstrap() {
  const session = await api("/auth/session");
  if (!session.user) {
    window.location.href = "./login.html";
    return;
  }

  userLabel.textContent = `Signed in as ${session.user.name || session.user.email} (${session.user.role})`;
  adminLink?.classList.toggle("hidden", session.user.role !== "admin");
  const itemsResult = await api("/items");
  renderItems(itemsResult.items ?? []);
}

async function signOut() {
  chatError.textContent = "";
  if (logoutButton) {
    logoutButton.disabled = true;
  }

  try {
    await api("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    const session = await api("/auth/session");
    if (session.user) {
      throw new Error("Sign out did not clear the current session.");
    }

    window.location.href = "./login.html";
  } catch (error) {
    chatError.textContent = error instanceof Error ? error.message : "Failed to sign out.";
    if (logoutButton) {
      logoutButton.disabled = false;
    }
  }
}

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  chatError.textContent = "";

  const formData = new FormData(chatForm);
  const message = String(formData.get("message") || "").trim();
  if (!message) {
    return;
  }

  appendMessage("user", message);
  chatForm.reset();

  try {
    const result = await api("/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    appendMessage("assistant", result.reply);
    renderItems(result.items ?? []);
  } catch (error) {
    chatError.textContent = error instanceof Error ? error.message : "Request failed.";
  }
});

logoutButton?.addEventListener("click", signOut);

bootstrap().catch((error) => {
  chatError.textContent = error instanceof Error ? error.message : "Failed to load chat.";
});
