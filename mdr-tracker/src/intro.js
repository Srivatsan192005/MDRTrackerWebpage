/**
 * MDR Cinematic Login Intro
 * ─────────────────────────
 * Self-contained animation orchestrator.
 * Zero external dependencies — pure Canvas 2D + CSS animations.
 *
 * Exports: runIntro(onComplete)
 *   - Plays full sequence on first session visit
 *   - Plays shortened sequence on returning visits
 *   - Respects prefers-reduced-motion
 */

import "./intro.css";

// ─── Constants ────────────────────────────────────────────────
const INTRO_SEEN_KEY   = "mdr_intro_seen";
const TAGLINE          = "Precision Tracking. Every Mile.";
const FULL_DURATION_MS = 13_500;
const SHORT_DURATION_MS = 4_000;

// Brick wall palette (cinematic warm-dark)
const BRICK_COLORS  = ["#3a2318","#4a2e20","#5c3828","#3d2216","#4e301e","#6b4030"];
const MORTAR_COLOR  = "#1c1410";
const CRACK_COLOR   = "rgba(0,0,0,0.7)";

// ─── Entry Point ──────────────────────────────────────────────
export function runIntro(onComplete) {
  // Reduced-motion check — skip immediately
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    onComplete();
    return;
  }

  const isFirstVisit = !sessionStorage.getItem(INTRO_SEEN_KEY);
  if (!isFirstVisit) {
    document.body.classList.remove("intro-running");
    onComplete();
    return;
  }

  // Mark body so CSS can scope login opacity
  document.body.classList.add("intro-running");
  sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  playFullIntro(onComplete);
}

// ─── Short Intro (returning visitor) ─────────────────────────
function playShortIntro(onComplete) {
  const overlay = buildOverlayShell();
  document.body.appendChild(overlay);

  const logoContainer = overlay.querySelector("#logoRevealContainer");
  const logoWrapper   = overlay.querySelector("#introLogoWrapper");
  const logo          = overlay.querySelector("#introLogo");
  const tagline       = overlay.querySelector("#introTagline");
  const skipBtn       = overlay.querySelector("#skipIntroBtn");
  const glow          = overlay.querySelector("#logoGlow");
  const rays          = overlay.querySelector("#lightRays");
  const logoParticles = overlay.querySelector("#logoParticles");

  // Set dark background with subtle gradient
  overlay.style.background = "radial-gradient(ellipse at center, #0a0a12 0%, #000 70%)";

  // Immediately show logo
  logoContainer.classList.add("reveal");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      logoWrapper.classList.add("scale-in");
      glow.classList.add("glow-in");
      setTimeout(() => {
        rays.classList.add("rays-in");
        logo.classList.add("bloom-pulse");
        glow.classList.add("glow-pulse");
        startLogoParticles(logoParticles);
        skipBtn.classList.add("visible");
      }, 600);
      setTimeout(() => {
        tagline.classList.add("tagline-in");
      }, 1000);
      setTimeout(() => {
        finishIntro(overlay, onComplete);
      }, SHORT_DURATION_MS);
    });
  });

  skipBtn.addEventListener("click", () => finishIntro(overlay, onComplete));
}

// ─── Full Intro (first visit) ─────────────────────────────────
function playFullIntro(onComplete) {
  const overlay = buildOverlayShell();
  document.body.appendChild(overlay);

  const canvas         = overlay.querySelector("#introCanvas");
  const sceneWrapper   = overlay.querySelector("#introSceneWrapper");
  const bus            = overlay.querySelector("#busSilhouette");
  const busBlur        = overlay.querySelector("#busMotionBlur");
  const headlights     = overlay.querySelector("#headlightBeams");
  const flash          = overlay.querySelector("#impactFlash");
  const dust           = overlay.querySelector("#dustClouds");
  const tireSmoke      = overlay.querySelector("#tireSmokeCanvas");
  const logoContainer  = overlay.querySelector("#logoRevealContainer");
  const logoWrapper    = overlay.querySelector("#introLogoWrapper");
  const logo           = overlay.querySelector("#introLogo");
  const tagline        = overlay.querySelector("#introTagline");
  const skipBtn        = overlay.querySelector("#skipIntroBtn");
  const glow           = overlay.querySelector("#logoGlow");
  const rays           = overlay.querySelector("#lightRays");
  const logoParticles  = overlay.querySelector("#logoParticles");
  const fog            = overlay.querySelector("#introFog");
  const progress       = overlay.querySelector("#introProgress");
  const ambientCanvas  = overlay.querySelector("#ambientParticles");

  let skipped = false;

  // ── Size canvas ──
  resizeCanvas(canvas);
  resizeCanvas(tireSmoke);
  resizeCanvas(ambientCanvas);
  window.addEventListener("resize", () => {
    resizeCanvas(canvas);
    resizeCanvas(tireSmoke);
    resizeCanvas(ambientCanvas);
  });

  // ── Inject SVG bus into elements ──
  injectBusSVG(bus, busBlur, headlights);

  // ── Draw the brick wall immediately (off-screen then fade in) ──
  const ctx = canvas.getContext("2d");
  const wall = new BrickWall(ctx, canvas.width, canvas.height);
  wall.draw(0); // draw at 0% destruction

  // ── Ambient floating dust system ──
  const ambientCtx   = ambientCanvas.getContext("2d");
  const ambientSys   = new AmbientParticleSystem(ambientCtx, canvas.width, canvas.height);
  let ambientRafId;
  function animateAmbient(ts) {
    ambientSys.update();
    ambientSys.draw();
    ambientRafId = requestAnimationFrame(animateAmbient);
  }
  ambientRafId = requestAnimationFrame(animateAmbient);

  // ── Progress bar updater ──
  const startTime = performance.now();
  let progressRafId;
  function updateProgress(ts) {
    const elapsed = ts - startTime;
    const pct     = Math.min((elapsed / FULL_DURATION_MS) * 100, 100);
    progress.style.width = pct + "%";
    if (pct < 100 && !skipped) {
      progressRafId = requestAnimationFrame(updateProgress);
    }
  }
  progressRafId = requestAnimationFrame(updateProgress);

  // ── TIMELINE ──
  const T = (ms, fn) => setTimeout(() => { if (!skipped) fn(); }, ms);

  // t=0: Scene dark, atmosphere building
  overlay.style.background = "#000";

  // t=800ms: Wall fades in, fog begins
  T(800, () => {
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 1.5s ease-out";
    requestAnimationFrame(() => { canvas.style.opacity = "1"; });
    fog.classList.add("fog-in");
  });

  // t=1500ms: Show skip button
  T(1500, () => {
    skipBtn.classList.add("visible");
  });

  // t=2000ms: Camera dolly in (slow push toward wall)
  T(2000, () => {
    sceneWrapper.classList.add("camera-push");
  });

  // t=3500ms: Wall starts showing wear (subtle crack animation)
  let wallAnimRafId;
  T(3500, () => {
    let crackProgress = 0;
    function animateCracks(ts) {
      if (skipped) return;
      crackProgress = Math.min(crackProgress + 0.008, 0.35);
      wall.draw(crackProgress);
      if (crackProgress < 0.35) {
        wallAnimRafId = requestAnimationFrame(animateCracks);
      }
    }
    wallAnimRafId = requestAnimationFrame(animateCracks);
  });

  // t=4500ms: BUS ENTERS — headlights, motion blur, bus silhouette
  let destructionRafId;
  let impactTriggered = false;

  T(4500, () => {
    headlights.classList.add("active");
    setTimeout(() => {
      // We do not add .bus-enter or .bus-blur-enter because we animate in JS!
      const debrisSys = new DebrisSystem(ctx, canvas.width, canvas.height);
      const startTime = performance.now();
      const duration = 2300; // 2.3 seconds
      const busWidth = bus.offsetWidth || Math.min(740, Math.max(280, window.innerWidth * 0.52));

      function animateDestruction(timestamp) {
        if (skipped) return;

        // Calculate progress of bus animation
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Cubic easing for the bus movement
        let busX = -busWidth;
        const targetImpactX = canvas.width * 0.42;

        if (progress <= 0.38) {
          // Phase 1: Slide in from off-screen left to the impact point
          const p = progress / 0.38;
          // Sleek explosive ease-out curve (easeOutQuart)
          const ease = 1 - Math.pow(1 - p, 4);
          busX = -busWidth + ease * targetImpactX;
        } else {
          // Phase 2: Smash through the wall and accelerate out off-screen right
          const p = (progress - 0.38) / 0.62;
          const ease = p * p; // accelerates out!
          const startX = targetImpactX - busWidth;
          const endX = canvas.width + 100;
          busX = startX + ease * (endX - startX);
        }

        // Apply physical coordinates directly to the elements
        bus.style.transform = `translateX(${busX}px) rotate(0.4deg)`;
        busBlur.style.transform = `translateX(${busX}px) scaleX(1.05)`;
        
        // Motion blur opacity peaks at impact then fades
        if (progress <= 0.38) {
          busBlur.style.opacity = progress * 2.2;
        } else {
          busBlur.style.opacity = Math.max(0, 0.8 - (progress - 0.38) * 1.5);
        }

        // 1. Get bus real-time coordinates mapped to canvas space
        const canvasRect = canvas.getBoundingClientRect();
        const busRect = bus.getBoundingClientRect();
        
        let busL = busX;
        let busR = busX + busWidth;
        let busT = 0;
        let busB = 0;

        if (busRect && canvasRect && canvasRect.width > 0) {
          const scaleY = canvas.height / canvasRect.height;
          busT = (busRect.top - canvasRect.top) * scaleY;
          busB = (busRect.bottom - canvasRect.top) * scaleY;
        }

        // 2. Update wall bricks based on bus collision
        wall.updateCollision(busL, busR, busT, busB);

        // 3. Draw wall bricks (respects physical slice state + cracks)
        wall.draw(0.35);

        // 4. Update and draw the debris system
        debrisSys.update();
        debrisSys.draw();

        // 5. Detect major impact at center of screen (42% of width)
        if (!impactTriggered && progress >= 0.38) {
          impactTriggered = true;

          // Screen shake
          sceneWrapper.classList.remove("screen-shake");
          void sceneWrapper.offsetWidth; // reflow to restart animation
          sceneWrapper.classList.add("screen-shake");

          // Impact flash
          flash.classList.add("flash");

          // Dust cloud expands
          dust.classList.add("expand");

          // Massive burst of debris at the front of the bus!
          debrisSys.explode(busR, busT + (busB - busT) * 0.5);

          // Tire smoke on canvas
          startTireSmoke(tireSmoke, canvas.width, canvas.height);
        }

        if (progress < 1) {
          destructionRafId = requestAnimationFrame(animateDestruction);
        }
      }
      
      destructionRafId = requestAnimationFrame(animateDestruction);
    }, 80);
  });

  // t=7000ms: Settle — debris slows, wall stabilizes
  T(7000, () => {
    // Stop ambient animation (dust takes over)
    cancelAnimationFrame(ambientRafId);
  });

  // t=8000ms: Logo reveal begins
  T(8000, () => {
    logoContainer.classList.add("reveal");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        logoWrapper.classList.add("scale-in");
        glow.classList.add("glow-in");
      });
    });
  });

  // t=8800ms: Logo bloom + light rays + particle swirl
  T(8800, () => {
    rays.classList.add("rays-in");
    logo.classList.add("bloom-pulse");
    glow.classList.add("glow-pulse");
    startLogoParticles(logoParticles);
  });

  // t=10000ms: Tagline fades in
  T(10000, () => {
    tagline.classList.add("tagline-in");
  });

  // t=12500ms: Auto-finish
  T(12500, () => {
    finishIntro(overlay, onComplete);
  });

  // ── Skip handler ──
  skipBtn.addEventListener("click", () => {
    skipped = true;
    cancelAnimationFrame(ambientRafId);
    cancelAnimationFrame(progressRafId);
    cancelAnimationFrame(wallAnimRafId);
    cancelAnimationFrame(destructionRafId);
    finishIntro(overlay, onComplete);
  });
}

// ─── Finish & Teardown ────────────────────────────────────────
function finishIntro(overlay, onComplete) {
  document.body.classList.remove("intro-running");
  overlay.classList.add("fade-out");
  onComplete();
  setTimeout(() => {
    overlay.remove();
  }, 1000);
}

// ─── Build Overlay DOM Shell ──────────────────────────────────
function buildOverlayShell() {
  const div = document.createElement("div");
  div.id = "mdrIntroOverlay";
  div.innerHTML = `
    <div id="introSceneWrapper">
      <canvas id="introCanvas" style="opacity:0"></canvas>
      <canvas id="tireSmokeCanvas"></canvas>
      <canvas id="ambientParticles"></canvas>
      <div id="introVignette"></div>
      <div id="introFog"></div>
      <div id="busSilhouette">
        <div id="headlightBeams"></div>
      </div>
      <div id="busMotionBlur"></div>
      <div id="impactFlash"></div>
      <div id="dustClouds"></div>
    </div>

    <div id="logoRevealContainer">
      <div id="introLogoWrapper">
        <div id="lightRays"></div>
        <div id="logoGlow"></div>
        <img id="introLogo" src="/mdr.png" alt="MDR Logo" />
        <canvas id="logoParticles"></canvas>
      </div>
      <p id="introTagline">${TAGLINE}</p>
    </div>

    <div id="introProgress"></div>
    <button id="skipIntroBtn" aria-label="Skip intro animation">Skip Intro ›</button>
  `;
  return div;
}

// ─── Canvas Resize ────────────────────────────────────────────
function resizeCanvas(canvas) {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ─── SVG Bus Injection ────────────────────────────────────────
function injectBusSVG(busEl, busBlurEl, headlightEl) {
  const svgMarkup = buildBusSVG();

  // Main bus — CSS handles all positioning via #busSilhouette
  busEl.innerHTML = svgMarkup;

  // Motion blur copy — let CSS handle positioning, just set blur filter
  // (CSS #busMotionBlur already has position/left/transform/size)
  busBlurEl.style.filter = "blur(16px)";
  busBlurEl.innerHTML = svgMarkup;

  // Headlight beams — absolute positioned inside #busSilhouette
  headlightEl.innerHTML = `
    <svg width="780" height="320" viewBox="0 0 780 320" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:100%;display:block;overflow:visible;">
      <defs>
        <linearGradient id="hlBeamGrad" gradientUnits="userSpaceOnUse" x1="742" y1="225" x2="2200" y2="225">
          <stop offset="0%"   stop-color="#fffde0" stop-opacity="0.95"/>
          <stop offset="12%"  stop-color="#ffe88a" stop-opacity="0.65"/>
          <stop offset="45%"  stop-color="#ffcc44" stop-opacity="0.25"/>
          <stop offset="75%"  stop-color="#ff9900" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
        </linearGradient>
        <filter id="beamBlur">
          <feGaussianBlur stdDeviation="15" />
        </filter>
      </defs>
      <!-- Upper diverging beam cone starting at upper headlight part (742, 218) -->
      <path d="M 742,218 L 2200,-50 L 2200,450 Z" fill="url(#hlBeamGrad)" filter="url(#beamBlur)"/>
      
      <!-- Lower diverging beam cone starting at lower headlight part (742, 232) -->
      <path d="M 742,232 L 2200,80 L 2200,580 Z" fill="url(#hlBeamGrad)" filter="url(#beamBlur)"/>
    </svg>
  `;
}

function buildBusSVG() {
  return `
<svg viewBox="0 0 780 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">
  <defs>
    <!-- Gradients for realistic white body shading -->
    <linearGradient id="coachBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="70%"  stop-color="#f8f9fa"/>
      <stop offset="100%" stop-color="#e9ecef"/>
    </linearGradient>
    <linearGradient id="coachRoofGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f1f3f5"/>
    </linearGradient>
    <linearGradient id="coachWindowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#212529"/>
      <stop offset="40%"  stop-color="#121416"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <linearGradient id="coachChrome" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#dee2e6"/>
      <stop offset="50%"  stop-color="#f8f9fa"/>
      <stop offset="100%" stop-color="#adb5bd"/>
    </linearGradient>
    <linearGradient id="coachWheelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#495057"/>
      <stop offset="100%" stop-color="#1a1d20"/>
    </linearGradient>
    <filter id="coachGlow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <radialGradient id="coachHeadlightGlow" cx="100%" cy="50%" r="80%">
      <stop offset="0%"   stop-color="#fff6d6" stop-opacity="1"/>
      <stop offset="40%"  stop-color="#ffcc44" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>

  <!-- Shadow under bus -->
  <ellipse cx="390" cy="285" rx="355" ry="20" fill="rgba(0,0,0,0.38)"/>

  <!-- Main Body Shape (Sleek White Luxury Coach) -->
  <path d="M 30,85 
           C 30,75 42,70 60,70 
           L 700,70 
           C 725,70 740,80 748,95 
           L 760,120 
           C 768,140 768,180 768,230 
           L 764,258 
           C 762,263 755,266 745,266 
           L 38,266 
           C 32,266 30,262 30,256 
           Z" 
        fill="url(#coachBodyGrad)" filter="url(#coachGlow)"/>

  <!-- Roof Cap (Sleek aerodynamic line) -->
  <path d="M 55,70 
           C 70,60 120,56 180,56 
           L 680,56 
           C 715,56 732,64 742,72 
           L 744,74 
           Z" 
        fill="url(#coachRoofGrad)"/>

  <!-- AC / Roof Pod (Aerodynamic luxury pod) -->
  <path d="M 280,56 C 290,44 320,40 370,40 L 520,40 C 560,40 580,44 590,56 Z" fill="#e9ecef"/>
  <rect x="360" y="46" width="120" height="4" rx="2" fill="#adb5bd"/>

  <!-- Side Glass Panel (Continuous Pitch-Black Windows Band) -->
  <path d="M 36,94 
           C 36,88 42,84 52,84 
           L 720,84 
           C 728,84 734,88 738,94 
           L 752,126 
           C 758,138 758,155 758,172 
           L 758,176 
           L 668,178 
           C 662,178 658,182 658,188 
           L 658,212 
           C 658,218 654,222 648,222 
           L 155,222 
           C 155,222 155,190 155,188 
           C 155,182 150,178 144,178 
           L 36,178 
           Z" 
        fill="url(#coachWindowGrad)"/>

  <!-- Subtle window pillars / dividers inside black glass for premium detailing -->
  <line x1="140" y1="84" x2="140" y2="178" stroke="#121416" stroke-width="2"/>
  <line x1="260" y1="84" x2="260" y2="178" stroke="#121416" stroke-width="2"/>
  <line x1="380" y1="84" x2="380" y2="178" stroke="#121416" stroke-width="2"/>
  <line x1="500" y1="84" x2="500" y2="178" stroke="#121416" stroke-width="2"/>
  <line x1="620" y1="84" x2="620" y2="178" stroke="#121416" stroke-width="2"/>

  <!-- Driver Door Window Divider -->
  <path d="M 658,84 L 658,178" stroke="#000" stroke-width="3"/>

  <!-- Front Windshield Wrap-Around Curve -->
  <path d="M 738,84 C 748,94 756,112 762,130 M 752,126 L 766,160" stroke="#000" stroke-width="2" opacity="0.3"/>

  <!-- Wheel Wells with dark guards -->
  <path d="M 90,266 A 48,48 0 0,1 186,266 Z" fill="#212529"/> <!-- Rear Axle 2 -->
  <path d="M 180,266 A 48,48 0 0,1 276,266 Z" fill="#212529"/> <!-- Rear Axle 1 (Double Axle!) -->
  <path d="M 590,266 A 48,48 0 0,1 686,266 Z" fill="#212529"/> <!-- Front Axle -->

  <!-- Rear Quarter Panel Air Vent -->
  <rect x="42" y="200" width="14" height="42" rx="2" fill="#dee2e6"/>
  <line x1="45" y1="205" x2="45" y2="237" stroke="#adb5bd" stroke-width="1"/>
  <line x1="49" y1="205" x2="49" y2="237" stroke="#adb5bd" stroke-width="1"/>
  <line x1="53" y1="205" x2="53" y2="237" stroke="#adb5bd" stroke-width="1"/>

  <!-- Side Compartment Doors (Cargo panel lines) -->
  <path d="M 290,260 L 290,210 C 290,206 294,202 298,202 L 560,202 C 564,202 568,206 568,210 L 568,260" 
        stroke="#ced4da" stroke-width="1.5" fill="none"/>
  <line x1="380" y1="202" x2="380" y2="260" stroke="#ced4da" stroke-width="1.5"/>
  <line x1="470" y1="202" x2="470" y2="260" stroke="#ced4da" stroke-width="1.5"/>

  <!-- Side Marker Lights (Amber LEDs along side bottom) -->
  <circle cx="330" cy="254" r="3" fill="#ff9900" filter="url(#coachGlow)"/>
  <circle cx="430" cy="254" r="3" fill="#ff9900" filter="url(#coachGlow)"/>
  <circle cx="530" cy="254" r="3" fill="#ff9900" filter="url(#coachGlow)"/>

  <!-- Chrome Trim Strip (Lower accent) -->
  <rect x="290" y="258" width="280" height="3" fill="url(#coachChrome)"/>

  <!-- Sleek Headlight Assembly on Bumper (Horizontal wrap-around) -->
  <path d="M 736,212 L 762,212 C 765,212 766,215 764,218 L 758,232 C 756,236 750,238 744,238 L 734,238 Z" 
        fill="#f8f9fa" stroke="#ced4da" stroke-width="1.5"/>
  <!-- Headlight bulbs glowing -->
  <ellipse cx="742" cy="225" rx="8" ry="6" fill="url(#coachHeadlightGlow)"/>
  <circle cx="742" cy="225" r="3" fill="#ffffff"/>
  <!-- Amber Turn Indicator -->
  <path d="M 752,215 L 761,215 L 757,226 L 750,226 Z" fill="#ff9900" opacity="0.95"/>

  <!-- Front Fog Light (Lower projector on bumper) -->
  <circle cx="728" cy="250" r="5" fill="#f8f9fa" stroke="#adb5bd" stroke-width="1"/>
  <circle cx="728" cy="250" r="2" fill="#ffffff" filter="url(#coachGlow)"/>

  <!-- Modern Aerodynamic Swooping Side Mirrors -->
  <!-- Front Mirror (Right side, swoops down) -->
  <path d="M 710,95 Q 730,95 735,115 L 730,122 Q 724,110 708,105 Z" fill="#ffffff" stroke="#dee2e6" stroke-width="0.5"/>
  <rect x="728" y="112" width="10" height="24" rx="4" fill="#ffffff" filter="url(#coachGlow)"/>
  <rect x="729" y="114" width="8" height="20" rx="3" fill="#212529"/>

  <!-- Rear Mirror (Left side, swoops forward) -->
  <path d="M 764,130 Q 776,132 780,145 L 775,152 Q 770,140 762,138 Z" fill="#ffffff" stroke="#dee2e6" stroke-width="0.5"/>
  <rect x="774" y="142" width="8" height="20" rx="4" fill="#ffffff" filter="url(#coachGlow)"/>
  <rect x="775" y="144" width="6" height="16" rx="3" fill="#212529"/>

  <!-- Passenger Entry Door Outline -->
  <path d="M 648,266 L 648,188" stroke="#ced4da" stroke-width="1.5"/>

  <!-- Brand logo printed on coach side (MDR logo with wide premium print) -->
  <text x="390" y="142" text-anchor="middle"
        font-family="Inter,Arial,sans-serif"
        font-size="20" font-weight="700"
        letter-spacing="9"
        fill="rgba(255,255,255,0.85)">MDR LABORATORIES</text>
  <text x="390" y="158" text-anchor="middle"
        font-family="Inter,Arial,sans-serif"
        font-size="10" font-weight="400"
        letter-spacing="5"
        fill="rgba(255,255,255,0.45)">VEHICLE TRACKING DIVISION</text>

  <!-- Wheels (Chrome hubs, detailed multi-spoke) -->
  <!-- Rear Axle 2 Wheel -->
  <g transform="translate(138, 272)">
    <circle cx="0" cy="0" r="41" fill="#1a1d20" stroke="#121416" stroke-width="2"/>
    <circle cx="0" cy="0" r="30" fill="url(#coachWheelGrad)"/>
    <circle cx="0" cy="0" r="23" fill="#dee2e6" stroke="#495057" stroke-width="1"/>
    <circle cx="0" cy="0" r="8" fill="#adb5bd"/>
    <circle cx="0" cy="0" r="3" fill="#f8f9fa"/>
    <line x1="-23" y1="0" x2="23" y2="0" stroke="#868e96" stroke-width="1"/>
    <line x1="0" y1="-23" x2="0" y2="23" stroke="#868e96" stroke-width="1"/>
  </g>

  <!-- Rear Axle 1 Wheel -->
  <g transform="translate(228, 272)">
    <circle cx="0" cy="0" r="41" fill="#1a1d20" stroke="#121416" stroke-width="2"/>
    <circle cx="0" cy="0" r="30" fill="url(#coachWheelGrad)"/>
    <circle cx="0" cy="0" r="23" fill="#dee2e6" stroke="#495057" stroke-width="1"/>
    <circle cx="0" cy="0" r="8" fill="#adb5bd"/>
    <circle cx="0" cy="0" r="3" fill="#f8f9fa"/>
    <line x1="-23" y1="0" x2="23" y2="0" stroke="#868e96" stroke-width="1"/>
    <line x1="0" y1="-23" x2="0" y2="23" stroke="#868e96" stroke-width="1"/>
  </g>

  <!-- Front Axle Wheel -->
  <g transform="translate(638, 272)">
    <circle cx="0" cy="0" r="41" fill="#1a1d20" stroke="#121416" stroke-width="2"/>
    <circle cx="0" cy="0" r="30" fill="url(#coachWheelGrad)"/>
    <circle cx="0" cy="0" r="23" fill="#dee2e6" stroke="#495057" stroke-width="1"/>
    <circle cx="0" cy="0" r="8" fill="#adb5bd"/>
    <circle cx="0" cy="0" r="3" fill="#f8f9fa"/>
    <line x1="-23" y1="0" x2="23" y2="0" stroke="#868e96" stroke-width="1"/>
    <line x1="0" y1="-23" x2="0" y2="23" stroke="#868e96" stroke-width="1"/>
  </g>
</svg>`;
}

// ─── Procedural Brick Wall ────────────────────────────────────
class BrickWall {
  constructor(ctx, w, h) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.bricks = [];
    this.cracks = [];
    this._generate();
  }

  _generate() {
    const { w, h } = this;
    // Set a realistic number of brick rows based on screen height
    const rowsCount = h < 600 ? 14 : 18; 
    const rowH      = Math.floor(h / rowsCount);
    
    // Width is proportional to row height to maintain a realistic aspect ratio (2.4x)
    const baseW     = Math.floor(rowH * 2.4);

    // Loop through row coordinates to fill the screen
    for (let row = 0; row < rowsCount + 2; row++) {
      const offset = row % 2 === 0 ? 0 : baseW * 0.5;
      let x = -offset;
      while (x < w + baseW) {
        const bW  = baseW * (0.85 + Math.random() * 0.3);
        const bH  = rowH  * (0.85 + Math.random() * 0.2);
        const col = BRICK_COLORS[Math.floor(Math.random() * BRICK_COLORS.length)];

        // Random damage/darkness
        const darken = Math.random() < 0.15;
        const color  = darken
          ? this._darken(col, 0.6)
          : col;

        this.bricks.push({
          x, y: row * rowH,
          w: bW, h: bH,
          color,
          row, origX: x,
          // For destruction physics
          vx: 0, vy: 0,
          angle: 0, angularV: 0,
          opacity: 1,
          exploding: false,
        });
        x += bW + 3; // mortar gap
      }
    }

    // Pre-generate random cracks
    for (let i = 0; i < 40; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const len = 20 + Math.random() * 80;
      const ang = Math.random() * Math.PI;
      this.cracks.push({ sx, sy, len, ang, opacity: 0 });
    }
  }

  _darken(hex, factor) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${Math.floor(r*factor)},${Math.floor(g*factor)},${Math.floor(b*factor)})`;
  }

  updateCollision(busL, busR, busT, busB) {
    const busCenterY = busT + (busB - busT) / 2;

    for (const b of this.bricks) {
      if (b.opacity <= 0.01) continue;

      const bCx = b.x + b.w / 2;
      const bCy = b.y + b.h / 2;

      // Check vertical intersection with the bus path
      const inPathY = (b.y + b.h > busT) && (b.y < busB);

      if (inPathY) {
        // Direct hit: the bus has reached or passed this brick's left edge
        if (busR >= b.x && !b.exploding) {
          b.exploding = true;
          
          // Explode violently to the right (direction of the bus)
          const distFromCenterY = bCy - busCenterY;
          b.vx = 12 + Math.random() * 22; // violent rightward push
          b.vy = distFromCenterY * 0.15 + (Math.random() - 0.5) * 8 - 4; // outward + upward lift
          b.angularV = (Math.random() - 0.5) * 0.4;
        }
      } else {
        // Collateral damage: bricks above or below the bus path
        // When the bus passes them, they lose support and crumble!
        if (busR >= b.x + b.w && !b.exploding) {
          // If above the bus path and within 160px of the bus top
          if (b.y <= busT && busT - b.y < 160) {
            if (Math.random() < 0.75) {
              b.exploding = true;
              b.vx = 2 + Math.random() * 6; // pushed slightly forward by shockwave
              b.vy = 1 + Math.random() * 5; // falling under gravity
              b.angularV = (Math.random() - 0.5) * 0.15;
            }
          }
          // If below the bus path and within 80px of the bus bottom
          else if (b.y >= busB && b.y - busB < 80) {
            if (Math.random() < 0.35) {
              b.exploding = true;
              b.vx = 1 + Math.random() * 4;
              b.vy = -(1 + Math.random() * 4); // popped slightly upward
              b.angularV = (Math.random() - 0.5) * 0.1;
            }
          }
        }
      }
    }
  }

  draw(destructionPct = 0) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // Background (dark stone behind wall)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0,   "#080808");
    bgGrad.addColorStop(0.5, "#101010");
    bgGrad.addColorStop(1,   "#050505");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Draw bricks
    for (const b of this.bricks) {
      if (b.opacity <= 0.01) continue;

      if (b.exploding) {
        b.vy    += 0.55; // gravity
        b.x     += b.vx;
        b.y     += b.vy;
        b.angle += b.angularV;
        b.opacity -= 0.015 + Math.random() * 0.01;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, b.opacity);
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.rotate(b.angle);

      // Brick face
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);

      // Subtle top highlight
      const hl = ctx.createLinearGradient(0, -b.h/2, 0, -b.h/2 + 6);
      hl.addColorStop(0,   "rgba(255,255,255,0.08)");
      hl.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(-b.w/2, -b.h/2, b.w, 6);

      // Bottom shadow
      const sh = ctx.createLinearGradient(0, b.h/2 - 6, 0, b.h/2);
      sh.addColorStop(0,   "rgba(0,0,0,0)");
      sh.addColorStop(1,   "rgba(0,0,0,0.35)");
      ctx.fillStyle = sh;
      ctx.fillRect(-b.w/2, b.h/2 - 6, b.w, 6);

      // Mortar border
      ctx.strokeStyle = MORTAR_COLOR;
      ctx.lineWidth   = 2;
      ctx.strokeRect(-b.w/2, -b.h/2, b.w, b.h);

      ctx.restore();
    }

    // Cracks appear as destruction builds
    const crackVis = Math.min(1, destructionPct * 3);
    for (let i = 0; i < this.cracks.length; i++) {
      const c = this.cracks[i];
      c.opacity = Math.min(crackVis, c.opacity + 0.04);
      if (c.opacity < 0.01) continue;

      ctx.save();
      ctx.globalAlpha = c.opacity * 0.6;
      ctx.strokeStyle = CRACK_COLOR;
      ctx.lineWidth   = 0.8 + Math.random() * 0.6;
      ctx.beginPath();
      ctx.moveTo(c.sx, c.sy);

      // Jagged crack path
      let cx = c.sx, cy = c.sy;
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const nx = cx + Math.cos(c.ang + (Math.random()-0.5)*0.8) * (c.len/steps);
        const ny = cy + Math.sin(c.ang + (Math.random()-0.5)*0.8) * (c.len/steps);
        ctx.lineTo(nx, ny);
        cx = nx; cy = ny;
      }
      ctx.stroke();
      ctx.restore();
    }

    // Cinematic darkness overlay at edges of wall
    const vigGrad = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.7);
    vigGrad.addColorStop(0,   "transparent");
    vigGrad.addColorStop(0.6, "rgba(0,0,0,0.1)");
    vigGrad.addColorStop(1,   "rgba(0,0,0,0.6)");
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);
  }
}

// ─── Canvas Debris System (impact fragments) ──────────────────
class DebrisSystem {
  constructor(ctx, w, h) {
    this.ctx       = ctx;
    this.w         = w;
    this.h         = h;
    this.fragments = [];
  }

  explode(cx, cy) {
    const count = 80 + Math.floor(Math.random() * 40);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 18;
      const size  = 4  + Math.random() * 22;
      this.fragments.push({
        x: cx + (Math.random()-0.5) * 60,
        y: cy + (Math.random()-0.5) * 40,
        vx: Math.cos(angle) * speed * (0.5 + Math.random()),
        vy: Math.sin(angle) * speed * (0.5 + Math.random()) - 4,
        angle: Math.random() * Math.PI * 2,
        angularV: (Math.random()-0.5) * 0.3,
        size,
        w: size * (0.8 + Math.random() * 0.8),
        h: size * (0.5 + Math.random() * 0.5),
        color: BRICK_COLORS[Math.floor(Math.random() * BRICK_COLORS.length)],
        opacity: 0.9 + Math.random() * 0.1,
        slowdown: 0.96 + Math.random() * 0.02,
      });
    }

    // Also add dust puff fragments (circles)
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 6;
      this.fragments.push({
        x: cx + (Math.random()-0.5) * 120,
        y: cy + (Math.random()-0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        angle: 0,
        angularV: 0,
        size: 8 + Math.random() * 30,
        w: 1, h: 1,
        color: null, // dust puff
        opacity: 0.4 + Math.random() * 0.3,
        slowdown: 0.93 + Math.random() * 0.04,
        isDust: true,
        radius: 8 + Math.random() * 30,
      });
    }
  }

  update() {
    for (const f of this.fragments) {
      f.vy      += 0.4;
      f.vx      *= f.slowdown;
      f.vy      *= f.slowdown;
      f.x       += f.vx;
      f.y       += f.vy;
      f.angle   += f.angularV;
      f.opacity -= 0.007 + Math.random() * 0.004;
    }
    this.fragments = this.fragments.filter(f => f.opacity > 0.01);
  }

  draw() {
    const { ctx } = this;
    for (const f of this.fragments) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.opacity);

      if (f.isDust) {
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        grad.addColorStop(0,   `rgba(160,130,100,${f.opacity * 0.6})`);
        grad.addColorStop(0.5, `rgba(120,100,80,${f.opacity * 0.3})`);
        grad.addColorStop(1,   "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        ctx.fillStyle = f.color;
        ctx.fillRect(-f.w/2, -f.h/2, f.w, f.h);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(-f.w/2, -f.h/2, f.w, f.h);
      }

      ctx.restore();
    }
  }
}

// ─── Ambient Particle System (floating dust pre-impact) ───────
class AmbientParticleSystem {
  constructor(ctx, w, h) {
    this.ctx = ctx;
    this.w   = w;
    this.h   = h;
    this.particles = [];
    for (let i = 0; i < 60; i++) {
      this.particles.push(this._spawn(true));
    }
  }

  _spawn(random = false) {
    return {
      x:    Math.random() * this.w,
      y:    random ? Math.random() * this.h : this.h + 10,
      vx:   (Math.random() - 0.5) * 0.3,
      vy:   -(0.2 + Math.random() * 0.6),
      r:    0.5 + Math.random() * 2,
      opacity: 0.1 + Math.random() * 0.4,
      maxOpacity: 0.1 + Math.random() * 0.4,
      fade:  Math.random() < 0.5 ? 1 : -1,
    };
  }

  update() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.opacity += p.fade * 0.003;
      if (p.opacity <= 0) { p.fade =  1; p.opacity = 0; }
      if (p.opacity >= p.maxOpacity) { p.fade = -1; }
    }
    // Replace particles that drift off screen
    this.particles = this.particles.map(p =>
      p.y < -10 || p.x < -10 || p.x > this.w + 10 ? this._spawn() : p
    );
    // Occasionally add more
    if (Math.random() < 0.3) this.particles.push(this._spawn());
    if (this.particles.length > 80) this.particles.shift();
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle   = `rgba(200,180,150,1)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Tire Smoke ───────────────────────────────────────────────
function startTireSmoke(canvasEl, w, h) {
  canvasEl.width  = w;
  canvasEl.height = h;
  const ctx    = canvasEl.getContext("2d");
  const smokes = [];

  function spawnSmoke() {
    // Smoke appears at wheel positions as bus moves across screen
    const busProgress = (Date.now() - smokeStart) / 1400; // 1.4s bus entry
    const busX = w * (-0.2 + busProgress * 0.85);
    smokes.push({
      x: busX + w * 0.08,   // rear wheel offset
      y: h * 0.7,
      r: 5 + Math.random() * 15,
      vx: -1 - Math.random() * 1.5,
      vy: -(0.5 + Math.random() * 1.2),
      opacity: 0.3 + Math.random() * 0.25,
      grow: 1.015 + Math.random() * 0.01,
    });
  }

  const smokeStart = Date.now();
  let spawnId;

  function spawnLoop() {
    const elapsed = Date.now() - smokeStart;
    if (elapsed < 2500) {
      for (let i = 0; i < 3; i++) spawnSmoke();
      spawnId = setTimeout(spawnLoop, 60);
    }
  }
  spawnLoop();

  let rafId;
  function animate() {
    ctx.clearRect(0, 0, w, h);
    for (const s of smokes) {
      s.x       += s.vx;
      s.y       += s.vy;
      s.r       *= s.grow;
      s.opacity -= 0.006;
      if (s.opacity < 0.01) continue;
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      grad.addColorStop(0,   `rgba(200,190,180,${s.opacity})`);
      grad.addColorStop(0.6, `rgba(160,150,140,${s.opacity * 0.4})`);
      grad.addColorStop(1,   "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    smokes.splice(0, smokes.findIndex(s => s.opacity > 0.01) === -1 ? 0 : smokes.findIndex(s => s.opacity > 0.01));
    rafId = requestAnimationFrame(animate);
  }
  animate();

  // Stop after 4 seconds
  setTimeout(() => {
    cancelAnimationFrame(rafId);
    clearTimeout(spawnId);
  }, 4000);
}

// ─── Logo Particle Swirl ──────────────────────────────────────
function startLogoParticles(canvasEl) {
  // Size the canvas based on its rendered size
  const rect = canvasEl.getBoundingClientRect();
  canvasEl.width  = rect.width  || 600;
  canvasEl.height = rect.height || 300;

  const ctx = canvasEl.getContext("2d");
  const cx  = canvasEl.width  / 2;
  const cy  = canvasEl.height / 2;
  const particles = [];

  // Spawn 120 swirl particles
  for (let i = 0; i < 120; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 160;
    particles.push({
      angle,
      radius,
      speed:   0.008 + Math.random() * 0.018,
      r:       0.8   + Math.random() * 2.5,
      opacity: 0,
      maxOp:   0.3   + Math.random() * 0.6,
      fadeIn:  true,
      color:   Math.random() < 0.6 ? "11,60,117" : "158,26,26",
      drift:   (Math.random() - 0.5) * 0.008, // radial drift
    });
  }

  let startTime = null;

  function animate(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    for (const p of particles) {
      p.angle  += p.speed;
      p.radius += p.drift;

      if (p.fadeIn) {
        p.opacity += 0.015;
        if (p.opacity >= p.maxOp) { p.fadeIn = false; }
      }
      // Gentle pulse
      const pulse = 0.85 + 0.15 * Math.sin(ts * 0.001 * p.speed * 40 + p.angle);
      const op    = Math.min(p.maxOp, p.opacity) * pulse;

      const px = cx + Math.cos(p.angle) * p.radius;
      const py = cy + Math.sin(p.angle) * p.radius * 0.55; // elliptical

      ctx.save();
      ctx.globalAlpha = Math.max(0, op);
      ctx.fillStyle   = `rgba(${p.color},1)`;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (elapsed < 12000) {
      requestAnimationFrame(animate);
    } else {
      // Fade out all particles
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    }
  }

  requestAnimationFrame(animate);
}
