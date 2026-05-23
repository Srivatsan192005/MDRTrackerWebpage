import "./style.css";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-database.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import bcrypt from "https://cdn.skypack.dev/bcryptjs";

const SUPABASE_URL = "https://dtzhherpazjfvxxyfaex.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0emhoZXJwYXpqZnZ4eHlmYWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNjc0MzIsImV4cCI6MjA4MTk0MzQzMn0.a7GqIrwfCJB1H0iMcyZy-LAjBwYw93yuPyoE1Ft_-Mg";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const firebaseConfig = {
  apiKey: "AIzaSyCukMV5WZUm2eTbRme7OwbyNQV8MU6R3-E",
  authDomain: "mdrtrackerpro.firebaseapp.com",
  databaseURL: "https://mdrtrackerpro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mdrtrackerpro",
  storageBucket: "mdrtrackerpro.appspot.com",
  messagingSenderId: "335727962743",
  appId: "1:335727962743:web:b2a9f674e29f0035257472"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let map;
let currentRoute = null;
let currentUserRole = "";
let marker;
let allDrivers = [];
let trafficLayer;
let userZoomed = false;
let driverStatusMap = new Map(); // Track previous status
let employeeLocation = null;
let etaService = null;
let employeeMarker = null;
let showEmployeeLocation = false;

const sharedInfoWindow = new google.maps.InfoWindow();
const markersMap = new Map();
const driverRefs = new Map();

// Notification function
function showNotification(driverName, route) {
  if (Notification.permission === "granted") {
    new Notification(`${driverName} started trip`, {
      body: `Driver on route ${route} has started a trip`,
      icon: "mdr_bus_icon.png"
    });
  }
}

// Request notification permission on load
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

function initMap() {
  const centerChennai = { lat: 13.0827, lng: 80.2707 };

  map = new google.maps.Map(document.getElementById("map"), {
    center: centerChennai,
    zoom: 12
  });

  trafficLayer = new google.maps.TrafficLayer();
  etaService = new google.maps.DistanceMatrixService();

  getEmployeeLocation();   // 👈 ADD THIS
  map.addListener("zoom_changed", () => userZoomed = true);

  fetchDrivers();
}

function fetchDrivers() {
  const usersRef = ref(db, "users");
  onValue(usersRef, snapshot => {
    allDrivers = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (data.role === "driver" && data.assignedRoute) {
        allDrivers.push({ id: child.key, ...data });
      }
    });
    if (!currentRoute) showRouteSelection();
    else showDriversForRoute(currentRoute);
  });
}

function showRouteSelection() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("trackingPage").style.display = "none";
  document.getElementById("routeSelectionPage").style.display = "flex";

  // Attach Add User button event listener when route selection is shown
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn && currentUserRole === "admin") {
    addUserBtn.style.display = "block";
    addUserBtn.onclick = () => window.location.href = 'src/adduser.html';
  } else if (addUserBtn) {
    addUserBtn.style.display = "none";
  }

  const container = document.getElementById("routeList");
  container.innerHTML = "";

  const routes = [...new Set(allDrivers.map(d => d.assignedRoute))];

  routes.forEach((route) => {
    const div = document.createElement("div");
    div.className = "route-card";
    div.onclick = () => showMapForRoute(route);

    const routeTitle = document.createElement("div");
    routeTitle.textContent = route;
    routeTitle.className = "route-name";

    const driverList = document.createElement("div");
    driverList.className = "drivers-list";
    const driversForRoute = allDrivers.filter(d => d.assignedRoute === route);

    driversForRoute.forEach(driver => {
      const driverRef = ref(db, `users/${driver.id}`);
      onValue(driverRef, snapshot => {
        const liveData = snapshot.val();
        const name = liveData?.name || "Unnamed";
        const hasLocation = liveData?.location?.latitude && liveData?.location?.longitude;
        const status = liveData?.isOnline
          ? (hasLocation ? "Trip In Progress" : "Online")
          : "Offline";
        
        const statusClass = liveData?.isOnline
          ? (hasLocation ? "status-trip" : "status-online")
          : "status-offline";

        const driverStatus = document.createElement("div");
        driverStatus.className = "driver-status";
        driverStatus.innerHTML = `
          <span class="driver-name">${name}</span>
          <span class="status-badge ${statusClass}">${status}</span>
        `;

        const existingEntry = driverList.querySelector(`[data-driver-id="${driver.id}"]`);
        if (existingEntry) {
          existingEntry.remove();
        }
        
        driverStatus.setAttribute('data-driver-id', driver.id);
        driverList.appendChild(driverStatus);
      });
    });

    div.appendChild(routeTitle);
    div.appendChild(driverList);
    container.appendChild(div);
  });
}

function showDriversForRoute(route) {
  clearMarkers();
  clearListeners();
  currentRoute = route;

  document.getElementById("routeSelectionPage").style.display = "none";
  document.getElementById("trackingPage").style.display = "flex";

  const routeInfo = document.querySelector(".route-info");
  routeInfo.textContent = `Drivers on: ${route}`;

  updateSidebarActions();

  const container = document.querySelector(".drivers-container");
  const existingCards = container.querySelectorAll(".driver-card");
  existingCards.forEach(card => card.remove());

  const filtered = allDrivers.filter(d => d.assignedRoute === route);
  const bounds = new google.maps.LatLngBounds();

  filtered.forEach(driver => {
    const driverRef = ref(db, `users/${driver.id}`);

    const unsub = onValue(driverRef, snapshot => {
      const liveData = snapshot.val();
      if (!liveData) return;

      const hasLocation =
        liveData.location?.latitude && liveData.location?.longitude;

      const name = liveData.name || "Unnamed";

      const status = liveData.isOnline
        ? (hasLocation ? "Trip In Progress" : "Online")
        : "Offline";

      const statusClass = liveData.isOnline
        ? (hasLocation ? "status-trip" : "status-online")
        : "status-offline";

      // 🔔 Notification logic (UNCHANGED)
      const previousStatus = driverStatusMap.get(driver.id);
      if (previousStatus === "Online" && status === "Trip In Progress") {
        showNotification(name, route);
      }
      driverStatusMap.set(driver.id, status);

      // Sidebar card
      const divId = `driver-${driver.id}`;
      let existingDiv = document.getElementById(divId);

      if (!existingDiv) {
        existingDiv = document.createElement("div");
        existingDiv.id = divId;
        existingDiv.className = "driver-card";
        const sidebar = document.querySelector(".sidebar-footer");
        sidebar.parentNode.insertBefore(existingDiv, sidebar);
      }

      existingDiv.innerHTML = `
        <div class="driver-status">
          <span class="driver-name">${name}</span>
          <span class="status-badge ${statusClass}">${status}</span>
        </div>
      `;

      // 🧭 MAP + ETA LOGIC
      if (hasLocation) {
        const pos = {
          lat: liveData.location.latitude,
          lng: liveData.location.longitude
        };

        const speed = (liveData.location.speed || 0) * 3.6;
        const formattedSpeed = speed.toFixed(1);

        document.getElementById("speedCircle").innerText =
          formattedSpeed + " km/h";
        document.getElementById("speedCircle").style.display = "flex";

        const updatedAt = liveData.lastUpdated
          ? new Date(liveData.lastUpdated).toLocaleString()
          : "Unknown time";

        // 🔥 ETA INTEGRATION (YOUR CODE)
        calculateETA(pos, (etaText) => {

          const infoContent = `
            <div style="font-size:14px;">
              <strong>${name}</strong><br>
              Route: ${route}<br>
              Speed: ${formattedSpeed} km/h<br>
              ETA: <b>${etaText}</b><br>
              Last Updated: ${updatedAt}
            </div>
          `;

          if (markersMap.has(driver.id)) {
            marker = markersMap.get(driver.id);
            marker.setPosition(pos);
            marker.infoWindow.setContent(infoContent);
          } else {
            marker = new google.maps.Marker({
              map,
              position: pos,
              title: `${name} - ${route}`,
              icon: "mdr_bus_icon.png"
            });

            const infoWindow = new google.maps.InfoWindow({
              content: infoContent
            });

            marker.addListener("click", () =>
              infoWindow.open(map, marker)
            );

            marker.infoWindow = infoWindow;
            markersMap.set(driver.id, marker);
          }
        });

        bounds.extend(pos);

        if (!userZoomed) {
          map.fitBounds(bounds);
          const currentZoom = map.getZoom();
          if (currentZoom > 12) map.setZoom(currentZoom - 3);
        }

        map.setCenter(bounds.getCenter());
      }
    });

    driverRefs.set(driver.id, unsub);
  });
}

function updateSidebarActions() {
  const sidebarActions = document.querySelector(".sidebar-actions");
  
  if (currentUserRole === "employee") {
    sidebarActions.innerHTML = `
      <button id="logoutButton" class="action-btn logout-btn"></button>
    `;
  } else {
    sidebarActions.innerHTML = `
      <button id="backButton" class="action-btn back-btn"></button>
      <button id="logoutButton" class="action-btn logout-btn"></button>
    `;
  }
  
  // Re-attach event listeners
  const backBtn = document.getElementById("backButton");
  const logoutBtn = document.getElementById("logoutButton");
  if (backBtn) backBtn.addEventListener('click', backToRoutes);
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function clearMarkers() {
  markersMap.forEach(marker => {
    marker.setMap(null);
  });
  markersMap.clear();
  sharedInfoWindow.close();
}

function clearListeners() {
  driverRefs.forEach(unsub => {
    if (typeof unsub === "function") {
      unsub();
    }
  });
  driverRefs.clear();
}

function backToRoutes() {
  clearMarkers();
  clearListeners();
  currentRoute = null;
  showRouteSelection();
}

async function logout() {
  location.reload();
}

async function handleAppLoadOrResume() {
  // Check if returning from add user page
  const skipLogin = localStorage.getItem('skipLogin');
  const userRole = localStorage.getItem('userRole');
  
  if (skipLogin === 'true' && userRole) {
    localStorage.removeItem('skipLogin');
    localStorage.removeItem('userRole');
    
    console.log('Skipping login, going to route selection as:', userRole);
    
    initMap();
    currentUserRole = userRole;
    showRouteSelection();
    return;
  }
  
  showLogin();
}


async function validateLogin() {
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const errorText = document.getElementById("errorText");

  // 🔒 Sanitize inputs (CRITICAL for Edge & Brave)
  const email = emailInput.value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  const password = passwordInput.value
    .trim()
    .replace(/\s+/g, "");

  errorText.style.display = "none";

  if (!email || !password) {
    errorText.textContent = "Enter email and password";
    errorText.style.display = "block";
    return;
  }

  // 1️⃣ Fetch user by email ONLY
  const { data: user, error } = await supabase
    .from("user_profiles")
    .select("id, email, password, role, assigned_route")
    .eq("email", email)
    .single();

  if (error || !user) {
    errorText.textContent = "Invalid login credentials";
    errorText.style.display = "block";
    return;
  }

  // 2️⃣ Compare hashed password
  let isPasswordValid = false;
  try {
    isPasswordValid = await bcrypt.compare(password, user.password);
  } catch (err) {
    console.error("Password compare failed:", err);
  }

  if (!isPasswordValid) {
    errorText.textContent = "Invalid login credentials";
    errorText.style.display = "block";
    return;
  }

  // 3️⃣ Store session manually
  localStorage.setItem(
    "mdr_user",
    JSON.stringify({
      id: user.id,
      role: user.role,
      assigned_route: user.assigned_route
    })
  );

  // 4️⃣ Login success
  document.getElementById("loginPage").style.display = "none";
  currentUserRole = user.role;

  initMap();

  if (user.role === "admin") {
    showRouteSelection();
  } else {
    showDriversForRoute(user.assigned_route);
  }
}

function showMapForRoute(routeId) {
  showDriversForRoute(routeId);
}

function toggleSidebar() {
  const bar = document.getElementById("bar");
  bar.classList.toggle("hidden");
}

function toggleTraffic() {
  if (trafficLayer.getMap()) {
    trafficLayer.setMap(null);
  } else {
    trafficLayer.setMap(map);
  }
}

function showLogin() {
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("routeSelectionPage").style.display = "none";
  document.getElementById("trackingPage").style.display = "none";
}

function openFeedback() {
  const feedbackUrl = "https://forms.zohopublic.in/adhithiyanmdr1/form/Feedbackform/formperma/2HFM6VUXrshS_sFqvqSHyeOJV-8ZzvaGKkhSRLOP4sM";
  window.open(feedbackUrl, "_blank");
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Login functionality
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', validateLogin);
  }

  // Password toggle
  const passwordInput = document.getElementById('passwordInput');
  const togglePassword = document.getElementById('togglePassword');
  if (passwordInput && togglePassword) {
    togglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePassword.className = isPassword ? 'password-toggle eye-closed' : 'password-toggle eye-open';
    });
  }

  // Sidebar toggle
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
  }

  // Traffic toggle
  const trafficBtn = document.getElementById('toggleTrafficBtn');
  if (trafficBtn) {
    trafficBtn.addEventListener('click', toggleTraffic);
  }

  // Feedback button
  const feedbackBtn = document.getElementById('feedbackButton');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', openFeedback);
  }

  // Sidebar back and logout buttons
  const sidebarBackBtn = document.getElementById('sidebarBackButton');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutButton');
  if (sidebarBackBtn) sidebarBackBtn.addEventListener('click', backToRoutes);
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', logout);

  // Route logout button
  const routeLogoutBtn = document.getElementById('routeLogoutBtn');
  if (routeLogoutBtn) {
    routeLogoutBtn.addEventListener('click', logout);
  }

  // Zoom to vehicle
  const zoomBtn = document.getElementById("zoomToVehicleBtn");
  if (zoomBtn) {
    zoomBtn.addEventListener("click", () => {
      if (marker) {
        map.setCenter(marker.getPosition());
        map.setZoom(18);
      } else {
        alert("Vehicle location not available.");
      }
    });
  }

  // Employee location toggle
  const locationBtn = document.getElementById('toggleEmployeeLocationBtn');
  if (locationBtn) {
    locationBtn.addEventListener('click', toggleEmployeeLocation);
  }

  // Enter key for login
  const emailInput = document.getElementById('emailInput');

  if (emailInput) {
    emailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        validateLogin();
      }
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        validateLogin();
      }
    });
  }

  // Add User button - remove from DOMContentLoaded since it's handled in showRouteSelection
});
function getEmployeeLocation() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported");
    return;
  }

  navigator.geolocation.watchPosition(
    pos => {
      employeeLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };

      console.log(
        `Employee location:`,
        employeeLocation,
        `Accuracy: ${pos.coords.accuracy} meters`
      );
    },
    err => {
      console.warn("Employee location error:", err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );
}

function calculateETA(vehiclePos, callback) {
  if (!employeeLocation || !etaService) {
    callback("ETA unavailable");
    return;
  }

  etaService.getDistanceMatrix(
    {
      origins: [vehiclePos],
      destinations: [employeeLocation],
      travelMode: google.maps.TravelMode.DRIVING,
      drivingOptions: {
        departureTime: new Date(),
        trafficModel: "bestguess"
      }
    },
    (response, status) => {
      if (status !== "OK") {
        callback("ETA error");
        return;
      }

      const element = response.rows[0].elements[0];
      if (element.status !== "OK") {
        callback("ETA unavailable");
        return;
      }

      const etaText = element.duration_in_traffic?.text || element.duration.text;
      callback(etaText);
      
      // Update ETA display
      const etaDisplay = document.getElementById('etaDisplay');
      const etaTime = etaDisplay.querySelector('.eta-time');
      if (etaTime) {
        etaTime.textContent = `ETA: ${etaText}`;
        etaDisplay.style.display = 'block';
      }
    }
  );
}

function toggleEmployeeLocation() {
  showEmployeeLocation = !showEmployeeLocation;
  
  if (showEmployeeLocation && employeeLocation) {
    if (!employeeMarker) {
      employeeMarker = new google.maps.Marker({
        position: employeeLocation,
        map: map,
        title: "Your Location",
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%234F46E5">
              <circle cx="12" cy="12" r="8" stroke="%23FFFFFF" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" fill="%23FFFFFF"/>
            </svg>
          `),
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 12)
        }
      });
    } else {
      employeeMarker.setMap(map);
    }
  } else if (employeeMarker) {
    employeeMarker.setMap(null);
  }
}

// Start the application
handleAppLoadOrResume();