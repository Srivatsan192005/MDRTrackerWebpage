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

    statusText.className = "success-text";
    statusText.textContent = syncBlockedByFirebase
      ? "User created successfully ✅ (realtime sync blocked by Firebase rules)"
      : "User created successfully ✅";

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
  const confirmDelete = confirm(`Are you sure you want to remove user "${name}"?`);
  if (!confirmDelete) return;

  try {
    const { error } = await supabase
      .from("route_tracking")
      .delete()
      .eq("employee_id", employeeId);

    if (error) {
      alert(`Failed to delete user: ${error.message}`);
      return;
    }

    // Refresh UI
    fetchAndDisplayUsers();
  } catch (err) {
    console.error("Error deleting user:", err);
    alert("An unexpected error occurred during user deletion.");
  }
}

// Wait for DOM to be fully loaded before attaching event listeners
document.addEventListener('DOMContentLoaded', function() {
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
