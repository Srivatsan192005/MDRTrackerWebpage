import "./style.css";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-database.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

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
let routePolylines = new Map();
let directionsService;
let locationAsked = false;

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
  directionsService = new google.maps.DirectionsService();

  clearRoutes();
  map.addListener("zoom_changed", () => userZoomed = true);
  fetchDrivers();
}

function fetchDrivers() {
  const usersRef = ref(db, "users");
  onValue(usersRef, snapshot => {
    allDrivers = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (data.role === "driver") {
        allDrivers.push({ id: child.key, ...data });
      }
    });
    
    // Only show route selection if no route is set AND user is admin
    if (!currentRoute && currentUserRole === "admin") {
      showRouteSelection();
    } else if (currentRoute) {
      // Refresh current view without changing the display
      if (currentUserRole === "admin") {
        showDriversForVehicle(currentRoute);
      } else {
        showDriversForRoute(currentRoute);
      }
    }
  });
}
function showRouteSelection() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("trackingPage").style.display = "none";
  document.getElementById("routeSelectionPage").style.display = "flex";

  // Add User button (Admin only)
  const addUserBtn = document.getElementById("addUserBtn");
  if (addUserBtn && currentUserRole === "admin") {
    addUserBtn.style.display = "block";
    addUserBtn.onclick = (e) => {
      e.preventDefault();
      window.location.replace("src/adduser.html");
    };
  } else if (addUserBtn) {
    addUserBtn.style.display = "none";
  }

  const container = document.getElementById("routeList");
  container.innerHTML = "";

  /* =====================================
     ADMIN → VEHICLE + DRIVER + STATUS
     ===================================== */

  // 1️⃣ Get unique vehicles
  const vehicles = [
    ...new Set(
      allDrivers
        .map(d => d.assignedVehicle)
        .filter(Boolean)
    )
  ].sort();

  vehicles.forEach(vehicle => {
    const card = document.createElement("div");
    card.className = "route-card";
    card.onclick = () => showMapForRoute(vehicle);

    // Vehicle title
    const vehicleTitle = document.createElement("div");
    vehicleTitle.className = "route-name";
    vehicleTitle.textContent = vehicle;

    // Driver row (live update)
    const driverRow = document.createElement("div");
    driverRow.className = "driver-status";
    driverRow.innerHTML = `
      <span class="driver-name">Loading...</span>
      <span class="status-badge status-offline">OFFLINE</span>
    `;

    card.appendChild(vehicleTitle);
    card.appendChild(driverRow);
    container.appendChild(card);

    // 2️⃣ Find driver(s) assigned to this vehicle
    const driversForVehicle = allDrivers.filter(
      d => d.assignedVehicle === vehicle
    );

    driversForVehicle.forEach(driver => {
      const driverRef = ref(db, `users/${driver.id}`);

      onValue(driverRef, snapshot => {
        const liveData = snapshot.val();
        if (!liveData) return;

        const hasLocation =
          liveData.location?.latitude &&
          liveData.location?.longitude;

        // 🔒 SAFE ONLINE CHECK
        const isOnline = liveData.isOnline === true;

        const status = isOnline
          ? (hasLocation ? "Trip In Progress" : "Online")
          : "Offline";

        const statusClass = isOnline
          ? (hasLocation ? "status-trip" : "status-online")
          : "status-offline";

        driverRow.innerHTML = `
          <span class="driver-name">
            ${liveData.name || "Unnamed Driver"}
          </span>
          <span class="status-badge ${statusClass}">
            ${status}
          </span>
        `;
      });
    });
  });
}


function showDriversForRoute(route) {
  clearMarkers();
  clearListeners();
  currentRoute = route;
  localStorage.setItem('currentRoute', route);
  localStorage.setItem('viewType', 'route');
  document.getElementById("routeSelectionPage").style.display = "none";
  document.getElementById("trackingPage").style.display = "flex";
  
  // Show/hide location button based on user role
  const locationBtn = document.getElementById('toggleEmployeeLocationBtn');
  if (locationBtn) {
    locationBtn.style.display = currentUserRole === "employee" ? "flex" : "none";
  }
  
  const routeInfo = document.querySelector(".route-info");
  routeInfo.textContent = route.toUpperCase().includes('MARUTI SWIFT(SAFFRON COLOR) (TN02-BS-1586)') ? 'MARUTI SWIFT(SAFFRON COLOR) (TN02-BS-1586)' : `Route: ${route}`;
  
  updateSidebarActions();
  
  const container = document.querySelector(".drivers-container");
  const existingCards = container.querySelectorAll('.driver-card');
  existingCards.forEach(card => card.remove());
  
  console.log('Filtering drivers for route:', route);
  console.log('All drivers:', allDrivers.map(d => ({ id: d.id, name: d.name, vehicle: d.assignedVehicle, route: d.assignedRoute })));
  
  const filtered = allDrivers.filter(d => {
    const driverRoute = (d.assignedRoute || '').trim().toUpperCase();
    const searchRoute = (route || '').trim().toUpperCase();
    
    if (searchRoute.includes('MARUTI SWIFT') && searchRoute.includes('TN02-BS-1586')) {
      return d.assignedVehicle && d.assignedVehicle.toUpperCase().includes('TN02-BS-1586');
    }
    
    return driverRoute === searchRoute;
  });
  
  console.log('Filtered drivers count:', filtered.length);
  console.log('Filtered drivers:', filtered.map(d => ({ id: d.id, name: d.name, route: d.assignedRoute, vehicle: d.assignedVehicle })));
  
  if (filtered.length === 0) {
    console.error(`No drivers found for route: ${route}`);
    console.error('Available routes:', [...new Set(allDrivers.map(d => d.assignedRoute).filter(Boolean))]);
  }
  const bounds = new google.maps.LatLngBounds();

  filtered.forEach((driver, index) => {
    const driverRef = ref(db, `users/${driver.id}`);
    const unsub = onValue(driverRef, snapshot => {
      const liveData = snapshot.val();
      if (!liveData) return;
      
      const hasLocation = liveData?.location?.latitude && liveData?.location?.longitude;
      const name = liveData?.name || "Unnamed";
      const status = liveData?.isOnline ? (hasLocation ? "Trip In Progress" : "Online") : "Offline";
      const statusClass = liveData?.isOnline ? (hasLocation ? "status-trip" : "status-online") : "status-offline";
      
      // Check for status change from Online to Trip In Progress
      const previousStatus = driverStatusMap.get(driver.id);
      if (previousStatus === "Online" && status === "Trip In Progress") {
        showNotification(name, route);
      }
      driverStatusMap.set(driver.id, status);
      
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

      if (hasLocation) {
        const pos = {
          lat: liveData.location.latitude,
          lng: liveData.location.longitude
        };
        const speed = (liveData.location.speed || 0) * 3.6;
        const formattedSpeed = speed.toFixed(1);
        document.getElementById("speedCircle").innerText = formattedSpeed + " km/h";
        document.getElementById("speedCircle").style.display = "flex";
        
        const updatedAt = liveData.lastUpdated ? new Date(liveData.lastUpdated).toLocaleString() : "Unknown time";
        
        // Calculate ETA and update info content
        const vehicleInfo = driver.assignedVehicle ? `Vehicle: ${driver.assignedVehicle}<br>` : '';
        const infoContent = `
          <div style="font-size:14px;">
            <strong>${name}</strong><br>
            Route: ${driver.assignedRoute || route}<br>
            ${vehicleInfo}
            Speed: ${formattedSpeed} km/h<br>
            Last Updated: ${updatedAt}
          </div>
        `;
        
        if (markersMap.has(driver.id)) {
          marker = markersMap.get(driver.id);
          marker.setPosition(pos);
          marker.infoWindow.setContent(infoContent);
          
          // Redraw route if location is enabled
          if (showEmployeeLocation && employeeLocation) {
            drawRoute(pos, employeeLocation, driver.id, "#0000FF");
          }
        } else {
          marker = new google.maps.Marker({
            map,
            position: pos,
            title: `${name} - ${driver.assignedVehicle || route}`,
            icon: "mdr_bus_icon.png"
          });
          const infoWindow = new google.maps.InfoWindow({ content: infoContent });
          marker.addListener("click", () => infoWindow.open(map, marker));
          marker.infoWindow = infoWindow;
          markersMap.set(driver.id, marker);
          
          // Draw route if location is enabled
          if (showEmployeeLocation && employeeLocation) {
            drawRoute(pos, employeeLocation, driver.id, "#0000FF");
          }
        }
        bounds.extend(pos);
        if (!userZoomed) {
          map.fitBounds(bounds);
          const currentZoom = map.getZoom();
          if (currentZoom > 12) {
            map.setZoom(currentZoom - 3); 
          }
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
  clearRoutes();
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
  localStorage.removeItem('currentRoute');
  localStorage.removeItem('viewType');
  // Reset location tracking when going back to routes
  showEmployeeLocation = false;
  if (employeeMarker) {
    employeeMarker.setMap(null);
  }
  // Stop location tracking to preserve battery
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  clearRoutes();
  const etaDisplay = document.getElementById('etaDisplay');
  if (etaDisplay) {
    etaDisplay.style.display = 'none';
  }
  showRouteSelection();
}

async function logout() {
  localStorage.removeItem('currentRoute');
  localStorage.removeItem('viewType');
  await supabase.auth.signOut();
  location.reload();
}

async function handleAppLoadOrResume() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    showLogin();
    return;
  }

  const userId = data.session.user.id;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, assigned_route")
    .eq("id", userId)
    .single();

  if (profile) {
    currentUserRole = profile.role;
    document.getElementById("loginPage").style.display = "none";
    initMap();

    const savedRoute = localStorage.getItem('currentRoute');
    const viewType = localStorage.getItem('viewType');

    if (profile.role === "admin") {
      if (savedRoute && viewType === 'vehicle') {
        currentRoute = savedRoute;
        showDriversForVehicle(savedRoute);
      } else {
        showRouteSelection();
      }
    } else {
      if (savedRoute && viewType === 'route') {
        currentRoute = savedRoute;
        showDriversForRoute(savedRoute);
      } else {
        showDriversForRoute(profile.assigned_route);
      }
    }
  } else {
    showLogin();
  }
}
function showDriversForVehicle(vehicleNumber) {
  clearMarkers();
  clearListeners();
  currentRoute = vehicleNumber;
  localStorage.setItem('currentRoute', vehicleNumber);
  localStorage.setItem('viewType', 'vehicle');
  document.getElementById("routeSelectionPage").style.display = "none";
  document.getElementById("trackingPage").style.display = "flex";

  const locationBtn = document.getElementById('toggleEmployeeLocationBtn');
  if (locationBtn) {
    locationBtn.style.display = currentUserRole === "employee" ? "flex" : "none";
  }

  const routeInfo = document.querySelector(".route-info");
  routeInfo.textContent = `Vehicle: ${vehicleNumber}`;

  updateSidebarActions();
  
  const container = document.querySelector(".drivers-container");
  const existingCards = container.querySelectorAll('.driver-card');
  existingCards.forEach(card => card.remove());

  const filtered = allDrivers.filter(
    d => d.assignedVehicle === vehicleNumber
  );

  if (filtered.length === 0) {
    console.warn("No drivers found for vehicle:", vehicleNumber);
  }

  const bounds = new google.maps.LatLngBounds();

  filtered.forEach(driver => {
    const driverRef = ref(db, `users/${driver.id}`);

    const unsub = onValue(driverRef, snapshot => {
      const liveData = snapshot.val();
      if (!liveData) return;
      
      const hasLocation = liveData?.location?.latitude && liveData?.location?.longitude;
      const name = liveData?.name || "Unnamed";
      const status = liveData?.isOnline ? (hasLocation ? "Trip In Progress" : "Online") : "Offline";
      const statusClass = liveData?.isOnline ? (hasLocation ? "status-trip" : "status-online") : "status-offline";
      
      // Add driver card to sidebar
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

      if (hasLocation) {
        const pos = {
          lat: liveData.location.latitude,
          lng: liveData.location.longitude
        };

        if (!markersMap.has(driver.id)) {
          const marker = new google.maps.Marker({
            map,
            position: pos,
            title: liveData.name || "Driver",
            icon: "mdr_bus_icon.png"
          });

          const infoWindow = new google.maps.InfoWindow({
            content: `<b>${liveData.name}</b><br>Vehicle: ${vehicleNumber}`
          });

          marker.addListener("click", () => infoWindow.open(map, marker));
          marker.infoWindow = infoWindow;

          markersMap.set(driver.id, marker);
        } else {
          markersMap.get(driver.id).setPosition(pos);
        }

        bounds.extend(pos);
        if (!userZoomed) {
          map.fitBounds(bounds);
          const currentZoom = map.getZoom();
          if (currentZoom > 12) {
            map.setZoom(currentZoom - 3);
          }
        }
      }
    });

    driverRefs.set(driver.id, unsub);
  });
}



async function validateLogin() {
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;
  const errorText = document.getElementById("errorText");

  errorText.style.display = "none";

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    errorText.textContent = error.message;
    errorText.style.display = "block";
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, assigned_route")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    errorText.textContent = "User profile not found";
    errorText.style.display = "block";
    return;
  }

  document.getElementById("loginPage").style.display = "none";
  initMap();
  currentUserRole = profile.role;

  if (profile.role === "admin") {
    showRouteSelection();
  } else {
    showDriversForRoute(profile.assigned_route);
  }
}

function showMapForRoute(routeId) {
  // Admin clicks vehicle, so filter by vehicle
  if (currentUserRole === "admin") {
    showDriversForVehicle(routeId);
  } else {
    // Employee uses route
    showDriversForRoute(routeId);
  }
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
    // Set initial state - closed eye
    togglePassword.style.backgroundImage = 'url("eye.png")';
    togglePassword.style.backgroundSize = '18px 18px';
    togglePassword.style.backgroundRepeat = 'no-repeat';
    togglePassword.style.backgroundPosition = 'center';
    togglePassword.style.cursor = 'pointer';
    togglePassword.style.opacity = '0.7';
    togglePassword.style.transition = 'opacity 0.2s ease';
    
    togglePassword.addEventListener('mouseenter', () => {
      togglePassword.style.opacity = '1';
    });
    
    togglePassword.addEventListener('mouseleave', () => {
      togglePassword.style.opacity = '0.7';
    });
    
    togglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePassword.style.backgroundImage = isPassword ? 'url("open.png")' : 'url("eye.png")';
      togglePassword.style.backgroundSize = '18px 18px';
      togglePassword.style.backgroundRepeat = 'no-repeat';
      togglePassword.style.backgroundPosition = 'center';
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
let locationWatchId = null;

function getEmployeeLocation() {
  if (!navigator.geolocation) return;
  
  // Only ask once per session
  if (sessionStorage.getItem('locationAsked')) return;
  
  navigator.geolocation.getCurrentPosition(
    pos => {
      employeeLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      
      // Start continuous tracking with better options
      locationWatchId = navigator.geolocation.watchPosition(
        pos => {
          employeeLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          if (employeeMarker && showEmployeeLocation) {
            employeeMarker.setPosition(employeeLocation);
          }
        },
        error => {
          console.log('Location error:', error);
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 30000, // 30 seconds
          timeout: 15000 // 15 seconds timeout
        }
      );
      
      sessionStorage.setItem('locationAsked', 'true');
      console.log('Location obtained');
    },
    () => {
      sessionStorage.setItem('locationAsked', 'true');
      console.log('Location denied');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
function calculateETA(vehiclePos, callback) {
  if (!employeeLocation || !etaService || !vehiclePos) {
    callback("Location needed");
    return;
  }

  etaService.getDistanceMatrix(
    {
      origins: [vehiclePos],
      destinations: [employeeLocation],
      travelMode: google.maps.TravelMode.DRIVING
    },
    (response, status) => {
      if (status === "OK" && response.rows[0]?.elements[0]?.status === "OK") {
        const element = response.rows[0].elements[0];
        const etaText = element.duration_in_traffic?.text || element.duration?.text || "Unknown";
        callback(etaText);
      } else {
        callback("ETA unavailable");
      }
    }
  );
}

function toggleEmployeeLocation() {
  if (currentUserRole !== "employee") {
    showToast("ETA feature is only available for employees.", "error");
    return;
  }

  if (showEmployeeLocation) {
    deactivateETA();
    return;
  }

  showToast("Requesting your location...", "info");
  
  navigator.geolocation.getCurrentPosition(
    pos => {
      employeeLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      
      if (locationWatchId) {
        navigator.geolocation.clearWatch(locationWatchId);
      }
      
      locationWatchId = navigator.geolocation.watchPosition(
        pos => {
          employeeLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          if (employeeMarker && showEmployeeLocation) {
            employeeMarker.setPosition(employeeLocation);
          }
        },
        error => console.log('Location tracking error:', error),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
      );
      
      showEmployeeLocation = true;
      activateETA();
      showToast("Location enabled!", "success");
    },
    error => {
      console.log('Location error:', error);
      let errorMsg = "Unable to get location. ";
      if (error.code === 1) errorMsg += "Please allow location access.";
      else if (error.code === 2) errorMsg += "Location unavailable.";
      else if (error.code === 3) errorMsg += "Request timeout.";
      showToast(errorMsg, "error");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function showToast(message, type = "info") {
  let toast = document.getElementById('locationToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'locationToast';
    document.body.appendChild(toast);
  }
  
  const icon = type === "error" ? "⚠️" : type === "success" ? "✅" : "📍";
  const bgColor = type === "error" ? "#dc2626" : type === "success" ? "#16a34a" : "#2563eb";
  
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bgColor};
    color: white;
    padding: 14px 20px;
    border-radius: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
    opacity: 0;
    transition: opacity 0.3s ease;
    max-width: 90%;
  `;
  
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  
  setTimeout(() => toast.style.opacity = '1', 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.style.display = 'none', 300);
  }, type === "error" ? 5000 : 3000);
}

function activateETA() {
  const etaBtn = document.getElementById('toggleEmployeeLocationBtn');
  if (etaBtn) {
    etaBtn.style.background = '#3b82f6';
    etaBtn.style.color = 'white';
  }
  
  if (!employeeMarker) {
    employeeMarker = new google.maps.Marker({
      position: employeeLocation,
      map: map,
      title: "Your Location",
      icon: {
        url: "current.png",
        scaledSize: new google.maps.Size(24, 24),
        anchor: new google.maps.Point(12, 12)
      },
      zIndex: 1000
    });
  } else {
    employeeMarker.setMap(map);
    employeeMarker.setPosition(employeeLocation);
  }
  
  // Show ETA display
  const etaDisplay = document.getElementById('etaDisplay');
  if (etaDisplay) {
    etaDisplay.style.display = 'block';
  }
  
  // Calculate ETA for all vehicles
  markersMap.forEach((vehicleMarker, driverId) => {
    const vehiclePos = vehicleMarker.getPosition();
    if (vehiclePos) {
      calculateETA(vehiclePos, (etaText) => {
        // Update bottom ETA display
        const etaTimeElement = etaDisplay?.querySelector('.eta-time');
        if (etaTimeElement) {
          etaTimeElement.textContent = `ETA: ${etaText}`;
        }
        
        // Update marker info window
        const currentContent = vehicleMarker.infoWindow.getContent();
        if (!currentContent.includes('ETA:')) {
          const updatedContent = currentContent.replace('</div>', `ETA: <b>${etaText}</b><br></div>`);
          vehicleMarker.infoWindow.setContent(updatedContent);
        }
      });
      drawRoute(vehiclePos, employeeLocation, driverId, "#0000FF");
    }
  });
}

function deactivateETA() {
  showEmployeeLocation = false;
  
  const etaBtn = document.getElementById('toggleEmployeeLocationBtn');
  if (etaBtn) {
    etaBtn.style.background = '#ffffff';
    etaBtn.style.color = '#2d3748';
  }
  
  if (employeeMarker) {
    employeeMarker.setMap(null);
  }
  
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  
  const etaDisplay = document.getElementById('etaDisplay');
  if (etaDisplay) {
    etaDisplay.style.display = 'none';
  }
  
  clearRoutes();
  markersMap.forEach((vehicleMarker) => {
    const currentContent = vehicleMarker.infoWindow.getContent();
    const updatedContent = currentContent.replace(/ETA:.*?<br>/g, '');
    vehicleMarker.infoWindow.setContent(updatedContent);
  });
}

function drawRoute(driverPos, employeePos, driverId, color = "#FF0000") {
  if (!driverPos || !employeePos || !directionsService) {
    return;
  }

  directionsService.route(
    {
      origin: driverPos,
      destination: employeePos,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (response, status) => {
      if (status === "OK") {
        if (routePolylines.has(driverId)) {
          routePolylines.get(driverId).setMap(null);
        }

        const polyline = new google.maps.Polyline({
          path: response.routes[0].overview_path,
          strokeColor: color,
          strokeOpacity: 0.8,
          strokeWeight: 3
        });

        polyline.setMap(map);
        routePolylines.set(driverId, polyline);
      }
    }
  );
}

function clearRoutes() {
  routePolylines.forEach(polyline => {
    polyline.setMap(null);
  });
  routePolylines.clear();
}


// Start the application
handleAppLoadOrResume();