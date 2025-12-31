import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import bcrypt from "https://cdn.skypack.dev/bcryptjs";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createUser() {
  const email = document.getElementById("newEmail").value.trim();
  const password = document.getElementById("newPassword").value.trim();
  const role = document.getElementById("userRole").value;
  const assignedRoute = document.getElementById("assignedRoute").value;
  const statusText = document.getElementById("statusText");

  statusText.style.display = "block";

  if (!email || !password || !role) {
    statusText.className = "error-text";
    statusText.textContent = "Please fill all required fields";
    return;
  }

  if (!email.endsWith("@mdrtox.com")) {
    statusText.className = "error-text";
    statusText.textContent = "Email must end with @mdrtox.com";
    return;
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user profile directly
  const { error: profileError } = await supabase
    .from("user_profiles")
    .insert({
      email: email,
      password: hashedPassword,
      role: role,
      assigned_route: assignedRoute || null
    });

  if (profileError) {
    statusText.className = "error-text";
    statusText.textContent = profileError.message;
    return;
  }

  statusText.className = "success-text";
  statusText.textContent = "User created successfully ✅";

  document.getElementById("newEmail").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("userRole").value = "";
  document.getElementById("assignedRoute").value = "";
}

function navigateToRouteSelection() {
  console.log('Setting localStorage flags');
  localStorage.setItem('userRole', 'admin');
  localStorage.setItem('skipLogin', 'true');
  console.log('Navigating to index.html');
  window.location.href = '../index.html';
}

// Wait for DOM to be fully loaded before attaching event listeners
document.addEventListener('DOMContentLoaded', function() {
  document
    .getElementById("createUserBtn")
    .addEventListener("click", createUser);

  // Password toggle - simplified approach
  const passwordInput = document.getElementById('newPassword');
  const togglePassword = document.getElementById('togglePassword');
  
  if (passwordInput && togglePassword) {
    console.log('Password toggle elements found');
    
    // Set initial styling
    togglePassword.style.backgroundImage = 'url("../eye.png")';
    togglePassword.style.backgroundSize = '18px 18px';
    togglePassword.style.backgroundRepeat = 'no-repeat';
    togglePassword.style.backgroundPosition = 'center';
    togglePassword.style.cursor = 'pointer';
    
    togglePassword.onclick = function(e) {
      e.preventDefault();
      console.log('Toggle clicked');
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        togglePassword.style.backgroundImage = 'url("../open.png")';
        console.log('Changed to text');
      } else {
        passwordInput.type = 'password';
        togglePassword.style.backgroundImage = 'url("../eye.png")';
        console.log('Changed to password');
      }
    };
  } else {
    console.log('Password toggle elements not found');
  }
});
