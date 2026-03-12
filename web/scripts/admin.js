import { api } from "./api.js";

const ROLE_OPTIONS = ["user", "admin", "support", "analyst"];

const adminUserLabel = document.querySelector("#admin-user-label");
const adminError = document.querySelector("#admin-error");
const adminUserGrid = document.querySelector("#admin-user-grid");
const adminEmptyState = document.querySelector("#admin-empty-state");
const logoutButton = document.querySelector("#logout-button");

let currentUserId = null;

function setError(message = "") {
  adminError.textContent = message;
  adminError.classList.toggle("hidden", !message);
}

function createRoleOptions(selectedRole) {
  return ROLE_OPTIONS.map(
    (role) => `<option value="${role}" ${role === selectedRole ? "selected" : ""}>${role}</option>`,
  ).join("");
}

function renderUsers(users) {
  adminUserGrid.innerHTML = "";
  adminEmptyState.classList.toggle("hidden", users.length > 0);

  for (const user of users) {
    const li = document.createElement("li");
    li.className = "admin-user-card";
    li.innerHTML = `
      <div class="admin-user-copy">
        <p class="item-name"></p>
        <p class="item-location"></p>
        <div class="item-meta">
          <span>${user.userId === currentUserId ? "Current admin" : "Known user"}</span>
          <span>Seen ${new Date(user.lastSeenAt).toLocaleDateString()}</span>
        </div>
      </div>
      <form class="admin-role-form" data-user-id="${user.userId}">
        <label>
          Role
          <select name="role">${createRoleOptions(user.role)}</select>
        </label>
        <button class="primary-button" type="submit">Save</button>
      </form>
    `;

    li.querySelector(".item-name").textContent = user.name || user.email || user.userId;
    li.querySelector(".item-location").textContent = user.email || user.userId;
    adminUserGrid.append(li);
  }
}

async function loadUsers() {
  const { user } = await api("/auth/session");

  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  if (user.role !== "admin") {
    window.location.href = "./chat.html";
    return;
  }

  const { users, currentUserId: currentId } = await api("/admin/users");
  currentUserId = currentId;
  adminUserLabel.textContent = `Admin panel for ${user.name || user.email}`;
  renderUsers(users ?? []);
}

adminUserGrid?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const submitButton = form.querySelector("button");
  const roleSelect = form.querySelector("select");
  const userId = form.getAttribute("data-user-id");
  if (!submitButton || !roleSelect || !userId) {
    return;
  }

  submitButton.disabled = true;
  setError("");

  try {
    await api("/admin/users/role", {
      method: "POST",
      body: JSON.stringify({
        userId,
        role: roleSelect.value,
      }),
    });
    await loadUsers();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to update role.");
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton?.addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST", body: JSON.stringify({}) });
  window.location.href = "./login.html";
});

loadUsers().catch((error) => {
  setError(error instanceof Error ? error.message : "Failed to load admin users.");
});
