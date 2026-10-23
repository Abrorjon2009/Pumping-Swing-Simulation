/* ============================================================
   ARGIMCHOQ (SWING CHAIR) PHYSICS ENGINE
   Based on Prof. William B. Case's Research:
   "Physics of Pumping a Swing" (YouTube: MbWhKFIayp4)
   & Case & Swanson (1990) "The pumping of a swing from the seated position"
   American Journal of Physics 58, 463-467
   ============================================================ */

(function () {
  'use strict';

  // ── Canvas Setup ──
  const canvas = document.getElementById('simCanvas');
  const ctx = canvas.getContext('2d');

  let dpr = 1;
  let viewWidth = 800;
  let viewHeight = 600;

  function resizeCanvas() {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    viewWidth = rect.width;
    viewHeight = Math.max(rect.height, 590);

    canvas.width = viewWidth * dpr;
    canvas.height = viewHeight * dpr;
    canvas.style.width = viewWidth + 'px';
    canvas.style.height = viewHeight + 'px';
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ── Physical Parameters (from Case & Swanson 1990) ──
  const G = 9.81;                 // m/s²
  const PIXELS_PER_METER = 100;   // 100px = 1.0 meter

  const L_meters = 2.4;           // suspension rope length ~2.4m
  const ropeLengthPx = L_meters * PIXELS_PER_METER; // 240px
  const naturalFreq = Math.sqrt(G / L_meters);     // omega_0 ≈ 2.02 rad/s (period ~3.1s)

  const m_body = 60.0;            // mass of rider (kg)
  const m_chair = 15.0;           // mass of swing seat (kg)
  const M_total = m_body + m_chair; // 75 kg
  const d_com = 0.38;             // distance from seat pivot to body COM (meters)

  // Moment of inertia about overhead pivot
  const I_total = M_total * (L_meters * L_meters); // ~432 kg·m²
  // Moment of inertia of rider rotating about the seat
  const I_body = m_body * (d_com * d_com) * 1.5;   // ~13.0 kg·m²

  // ── Simulation State ──
  const state = {
    // Pendulum state
    theta: 0,             // swing angle from vertical (rad)
    omega: 0,             // swing angular velocity (rad/s)
    alpha: 0,             // swing angular acceleration (rad/s²)

    // Rider body posture (relative to cables)
    // phi: angle of body tilt relative to the cables (rad)
    phi: 0,               // current body tilt (rad)
    phiDot: 0,            // rate of tilt change (rad/s)
    phiDDot: 0,           // angular acceleration of body (rad/s²)
    targetPhi: 0,         // target tilt angle

    // Case's Torques
    tau_inertial: 0,      // -I_body * phiDDot
    tau_tilt: 0,          // -m_body * g * d * sin(theta + phi)
    drivingTorque: 0,     // D(t) = tau_inertial + tau_tilt
    powerDelivered: 0,    // P(t) = D(t) * omega (Watts)

    // Theory Mode: 'driven' (Case's seated model at omega_0) vs 'parametric' (2*omega_0)
    oscillatorMode: 'driven',

    // Simulation controls
    isAutoPumping: false,
    autoPumpTime: 0,
    pumpIntensity: 0.70,  // 0.25 to 1.0
    slowMo: false,
    showForces: true,
    showCOM: true,
    showWaveform: true,
    showExplanations: true,

    // Metrics & history
    maxAmplitude: 0,
    currentPhase: 'Stationary — Ready to Drive',
    trail: [],

    // Waveform history buffer for live oscilloscope
    waveBuffer: [],
    maxBufferLength: 200,
  };

  // ── DOM References ──
  const btnStart = document.getElementById('btnStart');
  const btnReset = document.getElementById('btnReset');
  const btnModeDriven = document.getElementById('btnModeDriven');
  const btnModeParametric = document.getElementById('btnModeParametric');
  const modelNote = document.getElementById('modelNote');
  const btnKickLegs = document.getElementById('btnKickLegs');
  const btnTuckLegs = document.getElementById('btnTuckLegs');
  const toggleForces = document.getElementById('toggleForces');
  const toggleCOM = document.getElementById('toggleCOM');
  const toggleWaveform = document.getElementById('toggleWaveform');
  const toggleExplanations = document.getElementById('toggleExplanations');
  const toggleSlowMo = document.getElementById('toggleSlowMo');
  const pumpSlider = document.getElementById('pumpStrength');
  const pumpValueLabel = document.getElementById('pumpValue');
  const phaseText = document.getElementById('phaseText');
  const meterBar = document.getElementById('meterBar');
  const meterValue = document.getElementById('meterValue');
  const hudAngle = document.getElementById('hudAngle');
  const hudBodyTilt = document.getElementById('hudBodyTilt');
  const hudTorque = document.getElementById('hudTorque');
  const hudPower = document.getElementById('hudPower');
  const hudOscMode = document.getElementById('hudOscMode');
  const hudGround = document.getElementById('hudGround');

  // ── Event Handlers ──
  btnStart.addEventListener('click', () => {
    if (state.isAutoPumping) {
      stopAutoPump();
    } else {
      startAutoPump();
    }
  });

  function startAutoPump() {
    state.isAutoPumping = true;
    btnStart.innerHTML = '<span class="btn-icon">⏸</span> Stop Auto-Pumping';
    btnStart.classList.remove('btn-glow');
    btnStart.classList.add('btn-secondary');
  }

  function stopAutoPump() {
    state.isAutoPumping = false;
    btnStart.innerHTML = '<span class="btn-icon">▶</span> Start Auto-Pumping';
    btnStart.classList.add('btn-glow');
    btnStart.classList.remove('btn-secondary');
    state.targetPhi = 0;
  }

  btnReset.addEventListener('click', () => {
    stopAutoPump();
    state.theta = 0;
    state.omega = 0;
    state.alpha = 0;
    state.phi = 0;
    state.phiDot = 0;
    state.phiDDot = 0;
    state.targetPhi = 0;
    state.tau_inertial = 0;
    state.tau_tilt = 0;
    state.drivingTorque = 0;
    state.powerDelivered = 0;
    state.maxAmplitude = 0;
    state.autoPumpTime = 0;
    state.trail = [];
    state.waveBuffer = [];
    state.currentPhase = 'Stationary — Ready to Drive';
    updateHUD(0, 0, 0, 0);
  });

  // Theory Mode Selector (Driven vs Parametric)
  btnModeDriven.addEventListener('click', () => {
    state.oscillatorMode = 'driven';
    btnModeDriven.classList.add('active');
    btnModeParametric.classList.remove('active');
    hudOscMode.textContent = 'Driven (ω₀)';
    hudOscMode.className = 'hud-val mode-driven';
    modelNote.innerHTML = '<strong>Case\'s Insight:</strong> A seated swinger rocks at natural frequency <strong>&omega;<sub>0</sub></strong>, injecting energy as a <em>driven oscillator</em>, NOT a 2&omega;<sub>0</sub> parametric oscillator!';
  });

  btnModeParametric.addEventListener('click', () => {
    state.oscillatorMode = 'parametric';
    btnModeParametric.classList.add('active');
    btnModeDriven.classList.remove('active');
    hudOscMode.textContent = 'Parametric (2ω₀)';
    hudOscMode.className = 'hud-val mode-parametric';
    modelNote.innerHTML = '<strong>Textbook Model:</strong> Rider squats &amp; stands twice per cycle (<strong>2&omega;<sub>0</sub></strong>). While physically valid for standing, Case proved seated swings are driven!';
  });

  // Manual Controls
  btnKickLegs.addEventListener('click', () => {
    state.isAutoPumping = false;
    btnStart.innerHTML = '<span class="btn-icon">▶</span> Start Auto-Pumping';
    btnStart.classList.add('btn-glow');
    state.targetPhi = -0.65 * state.pumpIntensity; // Recline backward / kick legs forward
  });

  btnTuckLegs.addEventListener('click', () => {
    state.isAutoPumping = false;
    btnStart.innerHTML = '<span class="btn-icon">▶</span> Start Auto-Pumping';
    btnStart.classList.add('btn-glow');
    state.targetPhi = 0.55 * state.pumpIntensity; // Lean forward / tuck legs
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      state.isAutoPumping = false;
      btnStart.innerHTML = '<span class="btn-icon">▶</span> Start Auto-Pumping';
      btnStart.classList.add('btn-glow');
      state.targetPhi = -0.65 * state.pumpIntensity;
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      state.isAutoPumping = false;
      btnStart.innerHTML = '<span class="btn-icon">▶</span> Start Auto-Pumping';
      btnStart.classList.add('btn-glow');
      state.targetPhi = 0.55 * state.pumpIntensity;
    }
  });

  toggleForces.addEventListener('change', (e) => state.showForces = e.target.checked);
  toggleCOM.addEventListener('change', (e) => state.showCOM = e.target.checked);
  toggleWaveform.addEventListener('change', (e) => state.showWaveform = e.target.checked);
  toggleExplanations.addEventListener('change', (e) => state.showExplanations = e.target.checked);
  toggleSlowMo.addEventListener('change', (e) => state.slowMo = e.target.checked);

  pumpSlider.addEventListener('input', (e) => {
    state.pumpIntensity = e.target.value / 100;
    pumpValueLabel.textContent = e.target.value + '%';
  });

  // ── Physics Integration (Case & Swanson 1990 Model) ──
  function updatePhysics(dt) {
    if (state.slowMo) dt *= 0.4;

    const ampDeg = Math.abs(state.theta) * (180 / Math.PI);

    // ── 1. Determine Rider Tilt Target (phi) ──
    if (state.isAutoPumping) {
      state.autoPumpTime += dt;

      if (state.oscillatorMode === 'driven') {
        // ════════════════════════════════════════════════════════════
        // PROF. WILLIAM B. CASE'S DRIVEN OSCILLATOR MODEL (ω = ω₀)
        // ════════════════════════════════════════════════════════════
        // The swinger drives the oscillation at the fundamental frequency ω₀:
        // - At rest: forcefully tilt body backwards (recline & kick legs)
        // - In motion: tilt in resonance with velocity (90° phase shift to theta)
        //   • On forward swing (omega > 0): recline back (phi < 0), adding positive torque
        //   • On backward swing (omega < 0): lean forward (phi > 0), adding negative torque
        // ════════════════════════════════════════════════════════════

        if (ampDeg < 0.8 && Math.abs(state.omega) < 0.05) {
          // SELF-START FROM COMPLETE STANDSTILL:
          // Immediately generate initial torque by rotating body
          state.targetPhi = -0.65 * state.pumpIntensity;
          state.currentPhase = '🦵 Case Step 1: Initial Body Tilt (D(0) ≠ 0)';
        } else {
          // Synchronize with velocity for maximum power transfer: P = D(t) * omega
          const maxTilt = 0.65 * state.pumpIntensity;

          if (state.omega > 0.08) {
            // Forward stroke: recline torso backward & kick legs forward
            state.targetPhi = -maxTilt;
            state.currentPhase = '🚀 Forward Stroke: Reclining Body Backwards (τ > 0)';
          } else if (state.omega < -0.08) {
            // Backward stroke: lean torso forward & tuck legs under seat
            state.targetPhi = maxTilt * 0.85;
            state.currentPhase = '🔄 Back Stroke: Leaning Body Forwards (τ < 0)';
          } else {
            // Turnaround peaks
            if (state.theta > 0) {
              state.targetPhi = maxTilt * 0.85; // prepare forward lean
              state.currentPhase = '⏱️ Front Peak: Shifting Posture for Return';
            } else {
              state.targetPhi = -maxTilt;       // prepare backward recline
              state.currentPhase = '⚡ Back Peak: Reclining to Power Downswing';
            }
          }
        }
      } else {
        // ════════════════════════════════════════════════════════════
        // PARAMETRIC OSCILLATOR COMPARISON (ω = 2*ω₀)
        // ════════════════════════════════════════════════════════════
        // Pumping at twice the natural frequency (2*omega_0)
        // Raising COM at bottom (maximum velocity) and lowering at peaks
        // ════════════════════════════════════════════════════════════
        const parametricDrive = Math.cos(2 * naturalFreq * state.autoPumpTime);
        state.targetPhi = -0.5 * parametricDrive * state.pumpIntensity;
        state.currentPhase = '📊 Parametric Mode (2ω₀): Squatting & Standing';
      }
    } else {
      // Manual mode descriptions
      if (Math.abs(state.theta) < 0.01 && Math.abs(state.omega) < 0.01) {
        state.currentPhase = 'Stationary — Click "Recline & Kick" or Arrow Keys';
      } else {
        state.currentPhase = '🎮 Manual Mode — Body Tilt: ' + (state.phi * (180 / Math.PI)).toFixed(1) + '°';
      }
    }

    // ── 2. Dynamics of Body Tilt (phi) ──
    // Rider's muscles dynamically accelerate their body posture
    const muscleStiffness = 18.0; // muscular response speed
    const prevPhiDot = state.phiDot;

    // Muscular acceleration towards target posture
    state.phiDDot = muscleStiffness * (state.targetPhi - state.phi) - 6.0 * state.phiDot;
    state.phiDot += state.phiDDot * dt;
    state.phi += state.phiDot * dt;

    // ── 3. Exact Torques from Case & Swanson (1990) ──
    // A. Dynamic Inertial Reaction Torque:
    // Newton's 3rd Law: as the body accelerates with phiDDot, it exerts equal
    // and opposite reaction torque on the swing:
    state.tau_inertial = -I_body * state.phiDDot;

    // B. Static Gravitational Tilt Torque:
    // When the body tilts relative to vertical by (theta + phi), gravity acting
    // on rider's COM at distance d_com creates a torque about the seat:
    const totalTiltAngle = state.theta + state.phi;
    state.tau_tilt = -m_body * G * d_com * Math.sin(totalTiltAngle);

    // C. Total Driving Torque D(t):
    state.drivingTorque = state.tau_inertial + state.tau_tilt;

    // ── 4. Main Pendulum Equation of Motion ──
    // I_total * thetaDDot + b * thetaDot + M_total * g * L * sin(theta) = D(t)
    const gravityTorqueMain = -M_total * G * L_meters * Math.sin(state.theta);

    // Light aerodynamic and bearing damping
    const dampingTorque = -0.015 * state.omega * Math.abs(state.omega) * I_total - 0.008 * state.omega * I_total;

    // Net torque on swing
    const netTorque = gravityTorqueMain + state.drivingTorque + dampingTorque;
    state.alpha = netTorque / I_total;

    // Semi-implicit Euler integration
    state.omega += state.alpha * dt;
    state.theta += state.omega * dt;

    // Power delivered to the swing at this instant (P = tau * omega)
    state.powerDelivered = state.drivingTorque * state.omega;

    // Safety limits for visual sanity (±75°)
    const maxTheta = 75 * (Math.PI / 180);
    if (state.theta > maxTheta) {
      state.theta = maxTheta;
      state.omega = 0;
    } else if (state.theta < -maxTheta) {
      state.theta = -maxTheta;
      state.omega = 0;
    }

    // Track amplitude
    if (ampDeg > state.maxAmplitude) {
      state.maxAmplitude = ampDeg;
    }

    // Record waveform data for real-time oscilloscope
    state.waveBuffer.push({
      thetaDeg: state.theta * (180 / Math.PI),
      phiDeg: state.phi * (180 / Math.PI),
      torque: state.drivingTorque,
      power: state.powerDelivered,
    });
    if (state.waveBuffer.length > state.maxBufferLength) {
      state.waveBuffer.shift();
    }

    // Update telemetry
    updateHUD(ampDeg, state.phi * (180 / Math.PI), state.drivingTorque, state.powerDelivered);
  }

  function updateHUD(ampDeg, phiDeg, torque_Nm, power_W) {
    hudAngle.textContent = (state.theta * (180 / Math.PI)).toFixed(1) + '°';
    hudBodyTilt.textContent = (phiDeg >= 0 ? '+' : '') + phiDeg.toFixed(1) + '°';
    hudTorque.textContent = (torque_Nm >= 0 ? '+' : '') + torque_Nm.toFixed(1) + ' N·m';
    hudPower.textContent = (power_W >= 0 ? '+' : '') + power_W.toFixed(1) + ' W';

    const meterPercent = Math.min((ampDeg / 60) * 100, 100);
    meterBar.style.width = meterPercent + '%';
    meterValue.textContent = ampDeg.toFixed(1) + '°';

    phaseText.textContent = state.currentPhase;
  }

  // ── Render Scene ──
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);

    const px = viewWidth * 0.5;
    const py = 65;
    const angle = state.theta;
    const groundY = viewHeight - 35;

    // Background & Environment
    drawGrid(viewWidth, viewHeight);
    drawGroundPlane(viewWidth, groundY);
    drawOverheadSupport(px, py);

    // Compute Seat Position
    const seatX = px + ropeLengthPx * Math.sin(angle);
    const seatY = py + ropeLengthPx * Math.cos(angle);

    // Record motion trail
    state.trail.push({ x: seatX, y: seatY });
    if (state.trail.length > 50) state.trail.shift();
    drawTrail();

    // Suspension Cables
    drawSuspensionLines(px, py, seatX, seatY, angle);

    // Draw Swing Chair
    drawSwingChair(seatX, seatY, angle);

    // Draw Rider with Tilt angle phi
    drawRider(seatX, seatY, angle, state.phi);

    // Ground clearance measurement
    drawGroundClearance(seatX, seatY, groundY);

    // Center of Mass indicator
    if (state.showCOM) {
      drawCOM(seatX, seatY, angle, state.phi);
    }

    // Case's Force & Torque Vectors
    if (state.showForces) {
      drawForceAndTorques(seatX, seatY, px, py, angle, state.phi);
    }

    // Real-Time Waveform / Oscilloscope (Case's frequency resonance display)
    if (state.showWaveform) {
      drawOscilloscope(20, viewHeight - 170, 230, 95);
    }

    // Explanatory Speech Bubble
    if (state.showExplanations) {
      drawNarrationBubble(seatX, seatY, angle);
    }
  }

  // ── Background Elements ──
  function drawGrid(W, H) {
    ctx.strokeStyle = 'rgba(99, 115, 155, 0.05)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawGroundPlane(W, groundY) {
    ctx.beginPath();
    ctx.moveTo(15, groundY);
    ctx.lineTo(W - 15, groundY);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Diagonal hatching
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.18)';
    ctx.lineWidth = 1;
    for (let x = 20; x < W - 20; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x - 10, groundY + 12);
      ctx.stroke();
    }

    // Ground Badge
    const badgeText = '✕  AIRBORNE — ZERO GROUND CONTACT  ✕';
    ctx.font = 'bold 11px Inter, sans-serif';
    const textW = ctx.measureText(badgeText).width;
    const badgeX = W * 0.5;
    const badgeY = groundY + 16;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    roundedRect(ctx, badgeX - textW / 2 - 12, badgeY - 11, textW + 24, 20, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, badgeX, badgeY + 3);
  }

  function drawOverheadSupport(px, py) {
    // Crossbar
    ctx.fillStyle = '#2a314d';
    ctx.fillRect(px - 140, py - 18, 280, 16);
    ctx.fillStyle = '#3d476e';
    ctx.fillRect(px - 140, py - 18, 280, 3);

    // Frame A-posts
    ctx.strokeStyle = '#252b45';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(px - 130, py - 18);
    ctx.lineTo(px - 170, py + 120);
    ctx.moveTo(px + 130, py - 18);
    ctx.lineTo(px + 170, py + 120);
    ctx.stroke();

    // Bearing ring
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#1e243b';
    ctx.fill();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();

    ctx.fillStyle = '#8892b0';
    ctx.font = '10.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIXED OVERHEAD PIVOT', px, py - 24);

    // Plumb line
    ctx.beginPath();
    ctx.setLineDash([3, 5]);
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ropeLengthPx + 90);
    ctx.strokeStyle = 'rgba(136, 146, 176, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSuspensionLines(px, py, seatX, seatY, angle) {
    const perpX = Math.cos(angle) * 7;
    const perpY = -Math.sin(angle) * 7;

    for (let sign = -1; sign <= 1; sign += 2) {
      const topX = px + perpX * sign;
      const topY = py + perpY * sign;
      const botX = seatX + perpX * sign;
      const botY = seatY + perpY * sign;

      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(botX, botY);
      ctx.strokeStyle = sign === 1 ? '#a78bfa' : '#818cf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Chain links
      const links = 14;
      for (let i = 1; i < links; i++) {
        const t = i / links;
        const lx = topX + (botX - topX) * t;
        const ly = topY + (botY - topY) * t;
        ctx.beginPath();
        ctx.arc(lx, ly, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(167, 139, 250, 0.4)';
        ctx.fill();
      }
    }
  }

  function drawTrail() {
    if (state.trail.length < 2) return;
    for (let i = 1; i < state.trail.length; i++) {
      const alpha = (i / state.trail.length) * 0.35;
      ctx.beginPath();
      ctx.moveTo(state.trail[i - 1].x, state.trail[i - 1].y);
      ctx.lineTo(state.trail[i].x, state.trail[i].y);
      ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ── Swing Chair ──
  function drawSwingChair(seatX, seatY, angle) {
    ctx.save();
    ctx.translate(seatX, seatY);
    ctx.rotate(angle);

    // Wood seat base
    ctx.fillStyle = '#b45309';
    roundedRect(ctx, -26, 0, 52, 12, 4);
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Wood backrest
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-28, -48);
    ctx.lineTo(-21, -48);
    ctx.lineTo(-15, 0);
    ctx.closePath();
    ctx.fillStyle = '#92400e';
    ctx.fill();
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Slats
    for (let h = -12; h >= -42; h -= 10) {
      ctx.fillStyle = '#d97706';
      roundedRect(ctx, -27, h, 10, 6, 2);
      ctx.fill();
    }

    // Metal brackets
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-7, -15);
    ctx.moveTo(18, 0);
    ctx.lineTo(7, -15);
    ctx.stroke();

    ctx.restore();
  }

  // ── Seated Rider with Case's Body Tilt Angle (phi) ──
  function drawRider(seatX, seatY, angle, phi) {
    ctx.save();
    ctx.translate(seatX, seatY);
    ctx.rotate(angle);

    const hipX = -6;
    const hipY = -2;

    // In Case's model, phi rotates the rider's torso & legs
    // phi < 0: reclined back / legs kicked forward
    // phi > 0: leaned forward / legs tucked under seat
    const torsoAngle = -Math.PI / 2 + phi;
    const neckX = hipX + Math.cos(torsoAngle) * 46;
    const neckY = hipY + Math.sin(torsoAngle) * 46;
    const headX = neckX + Math.cos(torsoAngle) * 14;
    const headY = neckY + Math.sin(torsoAngle) * 14;

    // 1. Torso
    ctx.beginPath();
    ctx.moveTo(hipX - 8, hipY);
    ctx.lineTo(neckX - 7, neckY);
    ctx.lineTo(neckX + 7, neckY);
    ctx.lineTo(hipX + 8, hipY);
    ctx.closePath();
    ctx.fillStyle = '#2563eb';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Head & Face
    ctx.beginPath();
    ctx.arc(headX, headY, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#fcd34d';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hair
    ctx.beginPath();
    ctx.arc(headX, headY - 3, 11, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#451a03';
    ctx.fill();

    // Eye
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(headX + 5, headY - 1, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 3. Arms holding chains
    const shoulderX = neckX;
    const shoulderY = neckY + 8;
    const gripChainX = 7;
    const gripChainY = -25;

    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(shoulderX + 12, shoulderY + 8);
    ctx.lineTo(gripChainX, gripChainY);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(gripChainX, gripChainY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fcd34d';
    ctx.fill();

    // 4. Thighs
    const kneeX = hipX + 32;
    const kneeY = hipY + 3;

    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 5. Calves & Feet
    // Lower leg extension is coupled to phi:
    // When phi < 0 (reclined back), legs kick out forward horizontally
    // When phi > 0 (leaned forward), legs tuck back underneath the seat
    const calfAngle = (Math.PI / 2) + (phi * 1.3);
    const calfLength = 34;
    const ankleX = kneeX + Math.cos(calfAngle) * calfLength;
    const ankleY = kneeY + Math.sin(calfAngle) * calfLength;

    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.lineTo(ankleX, ankleY);
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Shoes
    const footAngle = calfAngle - Math.PI / 2.5;
    const toeX = ankleX + Math.cos(footAngle) * 12;
    const toeY = ankleY + Math.sin(footAngle) * 12;

    ctx.beginPath();
    ctx.moveTo(ankleX - 2, ankleY);
    ctx.lineTo(toeX, toeY);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  // ── Ground Clearance ──
  function drawGroundClearance(seatX, seatY, groundY) {
    const angle = state.theta;
    const calfAngleWorld = angle + (Math.PI / 2) + (state.phi * 1.3);
    const kneeXWorld = seatX + Math.cos(angle) * 26 - Math.sin(angle) * 1;
    const kneeYWorld = seatY + Math.sin(angle) * 26 + Math.cos(angle) * 1;
    const feetY = kneeYWorld + Math.sin(calfAngleWorld) * 34 + 6;

    const clearancePx = groundY - feetY;
    const clearanceCm = Math.max(0, (clearancePx / PIXELS_PER_METER) * 100);

    hudGround.textContent = clearanceCm.toFixed(1) + ' cm (AIRBORNE)';

    if (clearancePx > 10) {
      const lineX = seatX + 15;
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.moveTo(lineX, feetY);
      ctx.lineTo(lineX, groundY);
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      const midY = (feetY + groundY) / 2;
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${clearanceCm.toFixed(0)} cm AIRBORNE`, lineX + 6, midY + 3);
    }
  }

  // ── Center of Mass (COM) ──
  function drawCOM(seatX, seatY, angle, phi) {
    // Rider COM location: d_com = 0.38m from seat along body tilt axis
    const dPx = d_com * PIXELS_PER_METER;
    const bodyWorldAngle = angle - Math.PI / 2 + phi;
    const comX = seatX + Math.cos(bodyWorldAngle) * dPx;
    const comY = seatY + Math.sin(bodyWorldAngle) * dPx;

    ctx.save();

    // Dotted lever arm from seat to COM
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(seatX, seatY);
    ctx.lineTo(comX, comY);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Standard COM Crosshair symbol: ⊙
    ctx.beginPath();
    ctx.arc(comX, comY, 11, 0, Math.PI * 2);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(comX, comY, 11, 0, Math.PI / 2);
    ctx.lineTo(comX, comY);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(comX, comY, 11, Math.PI, Math.PI * 1.5);
    ctx.lineTo(comX, comY);
    ctx.fill();

    // Label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`COM (d = ${(d_com * 100).toFixed(0)}cm)`, comX + 15, comY - 2);

    ctx.restore();
  }

  // ── Force & Torque Vectors (Case's Model) ──
  function drawForceAndTorques(seatX, seatY, px, py, angle, phi) {
    const dPx = d_com * PIXELS_PER_METER;
    const bodyWorldAngle = angle - Math.PI / 2 + phi;
    const comX = seatX + Math.cos(bodyWorldAngle) * dPx;
    const comY = seatY + Math.sin(bodyWorldAngle) * dPx;

    // 1. Gravity (mg) from COM straight down
    const gravityLen = 55;
    drawArrow(comX, comY, comX, comY + gravityLen, '#f87171', 2.5);
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 10.5px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Gravity (mg)', comX + 6, comY + gravityLen);

    // 2. Suspension Cable Tension (T)
    const dx = px - seatX;
    const dy = py - seatY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tensionLen = 50;
    const tx = seatX + (dx / dist) * tensionLen;
    const ty = seatY + (dy / dist) * tensionLen;
    drawArrow(seatX, seatY, tx, ty, '#22d3ee', 2.5);
    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'right';
    ctx.fillText('Tension (T)', tx - 8, ty);

    // 3. Case's Driving Torque Display
    if (Math.abs(state.drivingTorque) > 2.0) {
      const torqueSign = Math.sign(state.drivingTorque);
      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Driving Torque D(t) = ${state.drivingTorque.toFixed(1)} N·m`, seatX, seatY - 55);
    }
  }

  function drawArrow(x1, y1, x2, y2, color, lineWidth) {
    const headLen = 9;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Real-Time Resonance Oscilloscope (Case's Laboratory Demonstration) ──
  function drawOscilloscope(x, y, w, h) {
    ctx.save();

    // Box background
    ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
    roundedRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99, 115, 155, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Title & Legend
    ctx.font = 'bold 9.5px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('RESONANCE OSCILLOSCOPE', x + 10, y + 14);

    // Legend dots
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('■ θ (Angle)', x + 10, y + 26);
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('■ D(t) (Torque)', x + 110, y + 26);

    // Center zero line
    const zeroY = y + 58;
    ctx.beginPath();
    ctx.setLineDash([2, 4]);
    ctx.moveTo(x + 8, zeroY);
    ctx.lineTo(x + w - 8, zeroY);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    if (state.waveBuffer.length < 2) {
      ctx.restore();
      return;
    }

    const n = state.waveBuffer.length;
    const stepX = (w - 16) / state.maxBufferLength;

    // Draw Angle trace (Blue)
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + 8 + i * stepX;
      const py = zeroY - (state.waveBuffer[i].thetaDeg / 45) * 26;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Torque trace (Purple)
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + 8 + i * stepX;
      const py = zeroY - (state.waveBuffer[i].torque / 60) * 26;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // ── Explanatory Narration Bubble ──
  function drawNarrationBubble(seatX, seatY, angle) {
    const ampDeg = Math.abs(state.theta) * (180 / Math.PI);

    let bubbleText = '';
    if (!state.isAutoPumping && ampDeg < 0.02 && Math.abs(state.phi) < 0.05) {
      bubbleText = '🪑 Completely stationary (zero velocity).\nFeet in the air (no ground contact).\n\nClick "Start Auto-Pumping" or\npress "Recline & Kick" to prove it!';
    } else if (ampDeg < 1.5 && Math.abs(state.phi) > 0.2) {
      bubbleText = '🦵 CASE STEP 1: SELF-START FROM REST!\nBody tilts backward (φ < 0).\nReaction torque -I·φ̈ and tilt torque\nproduce instant driving torque D(0) ≠ 0!';
    } else if (ampDeg < 8.0) {
      bubbleText = '⚖️ DRIVING TORQUE ACCELERATION\nSwing starts oscillating!\nNotice: Driven at natural frequency ω₀,\nNOT parametric 2ω₀!';
    } else if (ampDeg < 25.0) {
      bubbleText = '📈 CASE RESONANT POWER TRANSFER\nRecline on forward stroke, lean forward\non back stroke. Net power P(t) = D·ω > 0\nrapidly amplifies the swing!';
    } else {
      bubbleText = '🎉 MASSIVE SWINGING ACHIEVED!\n\nProved by William B. Case\'s physics:\nA seated swinger is a driven oscillator!\nTeacher: disproved! 🎓';
    }

    const bubbleX = seatX + (angle >= 0 ? 115 : -115);
    const bubbleY = seatY - 70;
    const width = 240;

    drawSpeechBubble(bubbleX, bubbleY, bubbleText, width);
  }

  function drawSpeechBubble(x, y, text, width) {
    const lines = text.split('\n');
    const lineHeight = 16;
    const padding = 14;
    const height = lines.length * lineHeight + padding * 2;
    const borderRadius = 12;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    roundedRect(ctx, x - width / 2, y, width, height, borderRadius);
    ctx.fillStyle = 'rgba(26, 31, 53, 0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    // Pointer
    ctx.beginPath();
    ctx.moveTo(x - 8, y + height);
    ctx.lineTo(x - 22, y + height + 12);
    ctx.lineTo(x + 4, y + height);
    ctx.fillStyle = 'rgba(26, 31, 53, 0.94)';
    ctx.fill();

    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      if (line.includes('🎉') || line.includes('Proved')) {
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 12px Inter, sans-serif';
      } else if (line.includes('CASE STEP 1') || line.includes('DRIVING TORQUE')) {
        ctx.fillStyle = '#60a5fa';
        ctx.font = 'bold 12px Inter, sans-serif';
      } else if (line.includes('RESONANT')) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 12px Inter, sans-serif';
      } else {
        ctx.fillStyle = '#e0e4ef';
        ctx.font = '12px Inter, sans-serif';
      }
      ctx.fillText(line, x - width / 2 + padding, y + padding + 11 + i * lineHeight);
    });
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Main Animation Loop ──
  let lastTimestamp = 0;
  function animationLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;

    const subSteps = 6;
    const subDt = dt / subSteps;
    for (let s = 0; s < subSteps; s++) {
      updatePhysics(subDt);
    }

    render();
    requestAnimationFrame(animationLoop);
  }

  requestAnimationFrame(animationLoop);

})();
