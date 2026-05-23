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

const APP_SESSION_KEY = "mdr_app_session";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyBg_M5sBVJMN4EQqZ9isya-87ax8faRxoI";

function saveAppSession(session) {
  localStorage.setItem(APP_SESSION_KEY, JSON.stringify(session));
}

function loadAppSession() {
  try {
    return JSON.parse(localStorage.getItem(APP_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearAppSession() {
  localStorage.removeItem(APP_SESSION_KEY);
}

let googleMapsLoadingPromise = null;

function refreshMapLayout() {
  if (!map || typeof google === "undefined" || !google.maps) {
    return;
  }

  requestAnimationFrame(() => {
    google.maps.event.trigger(map, "resize");
    const center = map.getCenter();
    if (center) {
      map.setCenter(center);
    }
  });
}

function loadGoogleMapsApi() {
  if (typeof google !== "undefined" && google.maps) {
    return Promise.resolve();
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  if (googleMapsLoadingPromise) {
    return googleMapsLoadingPromise;
  }

  googleMapsLoadingPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return googleMapsLoadingPromise;
}


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

const sharedInfoWindow = typeof google !== "undefined" && google.maps
  ? new google.maps.InfoWindow()
  : null;
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
  if (currentUserRole !== "admin") {
    const session = loadAppSession();
    if (session && session.assignedRoute) {
      showDriversForRoute(session.assignedRoute);
      return;
    }
  }

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
  refreshMapLayout();
  
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
  if (sharedInfoWindow) {
    sharedInfoWindow.close();
  }
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
  clearAppSession();
  await supabase.auth.signOut();
  location.reload();
}

async function runTemporaryInsert() {
  if (localStorage.getItem('temp_db_seeded') === 'true') return;
  console.log("Seeding test users directly into route_tracking table...");
  try {
    const testUsers = [
      {
        employee_id: "admin-123",
        employee_name: "MDR Admin",
        email: "admin@mdrtox.com",
        role: "admin",
        assigned_route: null,
        vehicle_number: null
      },
      {
        employee_id: "emp-456",
        employee_name: "John Doe",
        email: "employee@mdrtox.com",
        role: "employee",
        assigned_route: "AVADI",
        vehicle_number: "TN02-BS-1586"
      }
    ];

    for (const user of testUsers) {
      const { error: profileError } = await supabase
        .from("route_tracking")
        .upsert(user, {
          onConflict: 'email'
        });
        
      if (profileError) {
        console.error(`Failed to seed record for ${user.email}:`, profileError.message);
      } else {
        console.log(`Successfully seeded record for ${user.email} directly in table!`);
      }
    }
    
    localStorage.setItem('temp_db_seeded', 'true');
    console.log("Supabase direct table seeding completed successfully.");
  } catch (err) {
    console.error("Direct seeding crashed:", err);
  }
}

async function handleAppLoadOrResume() {
  try {
    try {
      await loadGoogleMapsApi();
    } catch (error) {
      console.error(error);
      document.getElementById("loginPage").style.display = "flex";
      const errorText = document.getElementById("errorText");
      if (errorText) {
        errorText.textContent = "Map API could not load. Check your Google Maps API key.";
        errorText.style.display = "block";
      }
      return;
    }

    // Run browser seeding for test accounts
    await runTemporaryInsert();

    const skipLogin = localStorage.getItem('skipLogin');
    const userRole = localStorage.getItem('userRole');

    if (skipLogin === 'true' && userRole) {
      localStorage.removeItem('skipLogin');
      localStorage.removeItem('userRole');
      currentUserRole = userRole;
      initMap();
      showRouteSelection();
      return;
    }

    const session = loadAppSession();
    if (session) {
      currentUserRole = session.role || "admin";
      initMap();

      const savedRoute = localStorage.getItem('currentRoute');
      const viewType = localStorage.getItem('viewType');

      if (currentUserRole === "admin") {
        if (savedRoute && viewType === 'vehicle') {
          currentRoute = savedRoute;
          showDriversForVehicle(savedRoute);
        } else {
          showRouteSelection();
        }
      } else if (savedRoute && viewType === 'route') {
        currentRoute = savedRoute;
        showDriversForRoute(savedRoute);
      } else if (session.assignedRoute) {
        showDriversForRoute(session.assignedRoute);
      } else {
        showRouteSelection();
      }
      return;
    }

    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      showLogin();
      return;
    }

    const userId = data.session.user.id;

    const { data: profile } = await supabase
      .from("route_tracking")
      .select("role, assigned_route, employee_name, vehicle_number")
      .eq("employee_id", userId)
      .single();

    if (profile) {
      currentUserRole = profile.role;
      saveAppSession({
        email: data.session.user.email,
        role: profile.role,
        assignedRoute: profile.assigned_route || null,
        employeeName: profile.employee_name || "",
        vehicleNumber: profile.vehicle_number || null
      });
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
  } catch (error) {
    console.error("App initialization crashed:", error);
    const errorDiv = document.createElement("div");
    errorDiv.style.position = "fixed";
    errorDiv.style.top = "0";
    errorDiv.style.left = "0";
    errorDiv.style.width = "100%";
    errorDiv.style.background = "#fee2e2";
    errorDiv.style.color = "#991b1b";
    errorDiv.style.padding = "20px";
    errorDiv.style.zIndex = "100000";
    errorDiv.style.fontFamily = "monospace";
    errorDiv.style.whiteSpace = "pre-wrap";
    errorDiv.innerHTML = `<h3>⚠️ Application Load Error</h3><p>${error.stack || error.message || error}</p>`;
    document.body.appendChild(errorDiv);
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
  refreshMapLayout();

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
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const errorText = document.getElementById("errorText");

  // Sanitize input
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

  try {
    // 1️⃣ Fetch the profile directly from the route_tracking table by email
    const { data: profile, error: profileError } = await supabase
      .from("route_tracking")
      .select("role, assigned_route, employee_name, vehicle_number, employee_id")
      .eq("email", email)
      .single();

    if (profileError || !profile) {
      errorText.textContent = "Invalid login credentials";
      errorText.style.display = "block";
      return;
    }

    // 2️⃣ Compare the entered password (the Emp-id) to employee_id
    if (profile.employee_id !== password) {
      errorText.textContent = "Invalid login credentials";
      errorText.style.display = "block";
      return;
    }

    // 3️⃣ Set current user role
    currentUserRole = profile.role || "employee";

    // 4️⃣ Save session manually (matches loadAppSession pattern)
    saveAppSession({
      email: email,
      role: profile.role,
      assignedRoute: profile.assigned_route || null,
      employeeName: profile.employee_name || "",
      vehicleNumber: profile.vehicle_number || null,
      employeeId: profile.employee_id
    });

    localStorage.removeItem('currentRoute');
    localStorage.removeItem('viewType');

    // 5️⃣ Proceed with map loading and views
    document.getElementById("loginPage").style.display = "none";

    try {
      initMap();
    } catch (mapErr) {
      console.warn("Map initialization failed, proceeding with UI views only:", mapErr);
    }

    if (currentUserRole === "admin") {
      showRouteSelection();
    } else {
      // Employees go straight to tracking their assigned route
      showDriversForRoute(profile.assigned_route);
    }

  } catch (error) {
    console.error("Login validation crashed:", error);
    errorText.textContent = `Login failed: ${error.message}`;
    errorText.style.display = "block";
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