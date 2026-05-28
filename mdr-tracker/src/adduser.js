import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-database.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
  throw new Error('Missing Firebase environment variables');
}

const app = initializeApp(firebaseConfig, "add-user-app");
const db = getDatabase(app);
let allUsers = [];
let addUserToastTimer = null;
let removeUserPromptElement = null;

function isFirebasePermissionError(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("permission_denied") || message.includes("permission denied");
}

function normalizeVehicle(v) {
  if (!v && v !== 0) return "";
  let s = v.toString();
  s = s.replace(/["“”‘’']/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ")");
  return s;
}

function showAddUserToast(message) {
  let toast = document.getElementById("addUserToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "addUserToast";
    toast.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: max(24px, env(safe-area-inset-bottom));
      transform: translateX(-50%) translateY(16px);
      background: linear-gradient(135deg, #0b3c75 0%, #9e1a1a 100%);
      color: #fff;
      padding: 14px 18px;
      border-radius: 999px;
      box-shadow: 0 14px 30px rgba(2, 6, 23, 0.22);
      z-index: 10000;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.2px;
      opacity: 0;
      transition: opacity 220ms ease, transform 220ms ease;
      pointer-events: none;
      max-width: calc(100vw - 32px);
      text-align: center;
      white-space: nowrap;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0)";

  if (addUserToastTimer) {
    clearTimeout(addUserToastTimer);
  }

  addUserToastTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(16px)";
  }, 2200);
}

function closeRemoveUserPrompt() {
  if (removeUserPromptElement) {
    removeUserPromptElement.remove();
    removeUserPromptElement = null;
  }
}

function showRemoveUserPrompt(name) {
  closeRemoveUserPrompt();

  return new Promise(resolve => {
    const promptBox = document.createElement("div");
    promptBox.id = "removeUserPrompt";
    promptBox.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: max(24px, env(safe-area-inset-bottom));
      transform: translateX(-50%) translateY(18px);
      width: min(92vw, 420px);
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid rgba(11, 60, 117, 0.14);
      border-radius: 18px;
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.22);
      z-index: 10001;
      padding: 16px;
      opacity: 0;
      transition: opacity 220ms ease, transform 220ms ease;
      backdrop-filter: blur(14px);
    `;

    promptBox.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
        <div style="width:40px; height:40px; border-radius:12px; background:linear-gradient(135deg, rgba(11,60,117,0.12), rgba(158,26,26,0.12)); display:flex; align-items:center; justify-content:center; font-size:18px; flex:0 0 auto;">🗑️</div>
        <div style="min-width:0; flex:1;">
          <div style="font-size:15px; font-weight:700; color:#0f172a; line-height:1.3;">Remove user?</div>
          <div style="margin-top:4px; font-size:13px; color:#475569; line-height:1.4; word-break:break-word;">
            ${name} will be deleted from the user list.
          </div>
        </div>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button type="button" id="cancelRemoveUserBtn" style="border:1px solid #cbd5e1; background:#fff; color:#334155; padding:10px 14px; border-radius:12px; font-weight:700; cursor:pointer; min-width:92px;">Cancel</button>
        <button type="button" id="confirmRemoveUserBtn" style="border:none; background:linear-gradient(135deg, #b91c1c 0%, #ef4444 100%); color:#fff; padding:10px 14px; border-radius:12px; font-weight:700; cursor:pointer; min-width:108px;">Remove</button>
      </div>
    `;

    document.body.appendChild(promptBox);
    removeUserPromptElement = promptBox;

    const cancelButton = promptBox.querySelector("#cancelRemoveUserBtn");
    const confirmButton = promptBox.querySelector("#confirmRemoveUserBtn");

    const finish = value => {
      closeRemoveUserPrompt();
      resolve(value);
    };

    cancelButton.onclick = () => finish(false);
    confirmButton.onclick = () => finish(true);

    requestAnimationFrame(() => {
      promptBox.style.opacity = "1";
      promptBox.style.transform = "translateX(-50%) translateY(0)";
    });
  });
}

async function createUser() {
  const employeeName = document.getElementById("newEmployeeName").value.trim();
  const email = document.getElementById("newEmail").value.trim();
  const password = document.getElementById("newPassword").value.trim(); // password is the Emp-id!
  const role = document.getElementById("userRole").value;
  const assignedRoute = document.getElementById("assignedRoute").value;
  const vehicleNumber = document.getElementById("newVehicleNumber").value.trim();
  const statusText = document.getElementById("statusText");

  statusText.style.display = "block";
  statusText.className = "";
  statusText.textContent = "Creating user...";

  if (!employeeName || !email || !password || !role) {
    statusText.className = "error-text";
    statusText.textContent = "Please fill all required fields (Name, Email, Password, Role)";
    return;
  }

  if (!email.endsWith("@mdrtox.com")) {
    statusText.className = "error-text";
    statusText.textContent = "Email must end with @mdrtox.com";
    return;
  }

  if (assignedRoute.toLowerCase() === "general" && !vehicleNumber) {
    statusText.className = "error-text";
    statusText.textContent = "Vehicle Number is required for general users";
    return;
  }

  try {
    // Create or update the profile record directly in route_tracking.
    const vehicleNumberNorm = vehicleNumber ? normalizeVehicle(vehicleNumber) : null;

    const { error: profileError } = await supabase
      .from("route_tracking")
      .upsert({
        employee_id: password, // The password input is the employee_id
        employee_name: employeeName,
        email: email,
        role: role,
        assigned_route: assignedRoute || null,
        vehicle_number: vehicleNumberNorm || null
      }, {
        onConflict: "employee_id"
      });

    if (profileError) {
      statusText.className = "error-text";
      statusText.textContent = `Database Error: ${profileError.message}`;
      return;
    }

    let syncBlockedByFirebase = false;

    try {
      await set(ref(db, `users/${password}`), {
        name: employeeName,
        employee_name: employeeName,
        email,
        role,
        assignedRoute: assignedRoute || null,
        assignedVehicle: vehicleNumberNorm || null,
        vehicleNumber: vehicleNumberNorm || null,
        employee_id: password
      });
    } catch (firebaseError) {
      if (!isFirebasePermissionError(firebaseError)) {
        throw firebaseError;
      }

      console.warn("Firebase sync skipped because realtime database denied the write.", firebaseError);
      syncBlockedByFirebase = true;
    }

    statusText.style.display = "none";
    showAddUserToast(
      syncBlockedByFirebase
        ? "New user added"
        : "New user added"
    );

    // Clear fields
    document.getElementById("newEmployeeName").value = "";
    document.getElementById("newEmail").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("userRole").value = "employee";
    document.getElementById("assignedRoute").value = "";
    document.getElementById("newVehicleNumber").value = "";

    // Refresh the user list
    fetchAndDisplayUsers();

  } catch (error) {
    console.error("Error creating user:", error);
    statusText.className = "error-text";
    statusText.textContent = `An unexpected error occurred: ${error.message}`;
  }
}

async function fetchAndDisplayUsers() {
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;

  try {
    const { data: users, error } = await supabase
      .from("route_tracking")
      .select("id, employee_id, employee_name, email, role, assigned_route, vehicle_number")
      .order("created_at", { ascending: false });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #dc2626; padding: 20px;">Error loading users: ${error.message}</td></tr>`;
      return;
    }

    allUsers = users || [];
    
    // Check if there is an active search filter to apply
    const searchInput = document.getElementById("userSearchInput");
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    if (searchTerm) {
      filterAndRenderUsers(searchTerm);
    } else {
      renderUserTable(allUsers);
    }

  } catch (error) {
    console.error("Error fetching users:", error);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #dc2626; padding: 20px;">Failed to load user list.</td></tr>`;
  }
}

function renderUserTable(usersToRender) {
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;

  if (!usersToRender || usersToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #6b7280; padding: 20px;">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  usersToRender.forEach(user => {
    const tr = document.createElement("tr");
    const isAdmin = user.role === 'admin';

    tr.innerHTML = `
      <td data-label="Name" style="font-weight: 600; color: #1e293b;">${user.employee_name}</td>
      <td data-label="Email" style="color: #475569;">${user.email}</td>
      <td data-label="Role"><span class="role-badge role-${user.role}">${user.role}</span></td>
      <td data-label="Assigned Route">${user.assigned_route || '<span style="color:#94a3b8; font-style:italic;">None</span>'}</td>
      <td data-label="Vehicle Number">${user.vehicle_number || '<span style="color:#94a3b8; font-style:italic;">None</span>'}</td>
      <td data-label="Action">
        ${isAdmin 
          ? '<span style="color: #94a3b8; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; background: #f1f5f9; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; display: inline-flex; align-items: center; gap: 4px;">🔒 Protected</span>' 
          : `<button class="table-delete-btn" data-id="${user.employee_id}">🗑️ Remove</button>`
        }
      </td>
    `;

    // Only attach event listener and allow deletion if they are not an admin
    if (!isAdmin) {
      const deleteBtn = tr.querySelector(".table-delete-btn");
      if (deleteBtn) {
        deleteBtn.onclick = () => removeUser(user.employee_id, user.employee_name);
      }
    }

    tbody.appendChild(tr);
  });
}

function filterAndRenderUsers(term) {
  if (!term) {
    renderUserTable(allUsers);
    return;
  }

  const filtered = allUsers.filter(user => {
    const name = (user.employee_name || "").toLowerCase();
    const email = (user.email || "").toLowerCase();
    const role = (user.role || "").toLowerCase();
    const route = (user.assigned_route || "").toLowerCase();
    const vehicle = (user.vehicle_number || "").toLowerCase();
    return name.includes(term) || email.includes(term) || role.includes(term) || route.includes(term) || vehicle.includes(term);
  });

  renderUserTable(filtered);
}

async function removeUser(employeeId, name) {
  const confirmDelete = await showRemoveUserPrompt(name);
  if (!confirmDelete) return;

  try {
    const { error } = await supabase
      .from("route_tracking")
      .delete()
      .eq("employee_id", employeeId);

    if (error) {
      showAddUserToast(`Failed to delete user`);
      return;
    }

    // Refresh UI
    fetchAndDisplayUsers();
    showAddUserToast(`User removed`);
  } catch (err) {
    console.error("Error deleting user:", err);
    showAddUserToast("Deletion failed");
  }
}

// Wait for DOM to be fully loaded before attaching event listeners
document.addEventListener('DOMContentLoaded', function() {
  const backButton = document.getElementById('backToDashboardBtn');
  if (backButton) {
    backButton.addEventListener('click', (event) => {
      event.preventDefault();

      const existingSession = JSON.parse(localStorage.getItem('mdr_app_session') || 'null') || {};
      localStorage.setItem('mdr_app_session', JSON.stringify({
        ...existingSession,
        role: 'admin'
      }));
      localStorage.setItem('mdr_app_view', 'routeSelection');
      localStorage.removeItem('currentRoute');
      localStorage.removeItem('viewType');

      window.location.href = '../index.html';
    });
  }

  // Add user button listener
  const createBtn = document.getElementById("createUserBtn");
  if (createBtn) {
    createBtn.addEventListener("click", createUser);
  }

  // Search input listener
  const searchInput = document.getElementById("userSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase().trim();
      filterAndRenderUsers(term);
    });
  }

  // Load user list
  fetchAndDisplayUsers();

  // Tab switching flow
  const tabAddBtn = document.getElementById("tabAddBtn");
  const tabRemoveBtn = document.getElementById("tabRemoveBtn");
  const addSection = document.getElementById("addSection");
  const removeSection = document.getElementById("removeSection");

  if (tabAddBtn && tabRemoveBtn && addSection && removeSection) {
    tabAddBtn.onclick = function() {
      tabAddBtn.classList.add("active");
      tabRemoveBtn.classList.remove("active");
      addSection.classList.add("active");
      removeSection.classList.remove("active");
    };

    tabRemoveBtn.onclick = function() {
      tabRemoveBtn.classList.add("active");
      tabAddBtn.classList.remove("active");
      removeSection.classList.add("active");
      addSection.classList.remove("active");
      fetchAndDisplayUsers(); // Reload to get fresh data
    };
  }

  // Password toggle - simplified approach
  const passwordInput = document.getElementById('newPassword');
  const togglePassword = document.getElementById('togglePassword');
  
  if (passwordInput && togglePassword) {
    togglePassword.onclick = function(e) {
      e.preventDefault();
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        togglePassword.style.backgroundImage = 'url("/open.png")';
      } else {
        passwordInput.type = 'password';
        togglePassword.style.backgroundImage = 'url("/eye.png")';
      }
    };
  }
});
