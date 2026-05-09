// ============================================================
//  ASTEROIDS — Full Game Logic
// ============================================================
(() => {
  "use strict";

  // ---- Canvas Setup ----
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- Constants ----
  const TAU = Math.PI * 2;
  const SHIP_SIZE = 18;
  const TURN_SPEED = 0.030;
  const THRUST_POWER = 0.22;
  const FRICTION = 0.992;
  const BULLET_SPEED = 10;
  const BULLET_LIFE = 95;
  const FIRE_RATE = 8; // frames between shots
  const MAX_BULLETS = 19;
  const ASTEROID_SPEED_BASE = 1.2;
  const ASTEROID_SIZES = [48, 24, 12];
  const ASTEROID_SCORES = [20, 50, 100];
  const INVINCIBLE_TIME = 150; // frames
  const PARTICLE_LIFE = 40;
  const STAR_COUNT = 200;

  // ---- Colors ----
  const COL = {
    ship: "#e8ecf4",
    shipGlow: "rgba(110,231,183,0.2)",
    thrust: "#6ee7b7",
    thrustGlow: "rgba(110,231,183,0.6)",
    bullet: "#6ee7b7",
    bulletGlow: "rgba(110,231,183,0.4)",
    asteroid: "#8b93a7",
    asteroidStroke: "#c0c7d6",
    particle: "#6ee7b7",
    star: "rgba(200,210,230,VAR)",
  };

  // ---- State ----
  let state = "start"; // start | playing | paused | gameover
  let score = 0;
  let highScore = parseInt(localStorage.getItem("asteroids_hs") || "0", 10);
  let lives = 5;
  let level = 1;
  let ship = null;
  let bullets = [];
  let asteroids = [];
  let particles = [];
  let stars = [];
  let fireCooldown = 0;
  let screenShake = 0;

  // ---- Input ----
  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "KeyP" && state === "playing") {
      state = "paused";
      showOverlay("pause-screen");
    } else if (e.code === "KeyP" && state === "paused") {
      state = "playing";
      hideOverlay("pause-screen");
    }
  });
  window.addEventListener("keyup", (e) => (keys[e.code] = false));

  // ---- UI Helpers ----
  const $ = (id) => document.getElementById(id);
  function showOverlay(id) { $(id).classList.remove("hidden"); }
  function hideOverlay(id) { $(id).classList.add("hidden"); }

  function updateHUD() {
    $("score").textContent = score.toLocaleString();
    $("level").textContent = level;
    const livesEl = $("lives");
    livesEl.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const icon = document.createElement("div");
      icon.className = "life-icon" + (i >= lives ? " lost" : "");
      livesEl.appendChild(icon);
    }
  }

  // ---- Stars (background) ----
  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.5 + 0.15,
        speed: Math.random() * 0.0015 + 0.0005,
        phase: Math.random() * TAU,
      });
    }
  }

  function drawStars(t) {
    for (const s of stars) {
      const alpha = s.a + Math.sin(t * s.speed + s.phase) * 0.12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fillStyle = `rgba(200,210,230,${alpha})`;
      ctx.fill();
    }
  }

  // ---- Ship ----
  function createShip() {
    return {
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      thrusting: false,
      invincible: INVINCIBLE_TIME,
      dead: false,
      respawnTimer: 0,
    };
  }

  function drawShip(s, t) {
    if (s.dead) return;
    if (s.invincible > 0 && Math.floor(s.invincible / 5) % 2 === 0) return;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);

    // Glow
    ctx.shadowColor = COL.shipGlow;
    ctx.shadowBlur = 18;

    // Ship body
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE * 0.7, -SHIP_SIZE * 0.6);
    ctx.lineTo(-SHIP_SIZE * 0.4, 0);
    ctx.lineTo(-SHIP_SIZE * 0.7, SHIP_SIZE * 0.6);
    ctx.closePath();
    ctx.strokeStyle = COL.ship;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Thrust flame
    if (s.thrusting) {
      const flicker = 0.6 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(-SHIP_SIZE * 0.45, -SHIP_SIZE * 0.25);
      ctx.lineTo(-SHIP_SIZE * (0.8 + flicker * 0.4), 0);
      ctx.lineTo(-SHIP_SIZE * 0.45, SHIP_SIZE * 0.25);
      ctx.strokeStyle = COL.thrust;
      ctx.shadowColor = COL.thrustGlow;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  function updateShip(s) {
    if (s.dead) {
      s.respawnTimer--;
      if (s.respawnTimer <= 0) {
        s.dead = false;
        s.x = canvas.width / 2;
        s.y = canvas.height / 2;
        s.vx = 0;
        s.vy = 0;
        s.angle = -Math.PI / 2;
        s.invincible = INVINCIBLE_TIME;
      }
      return;
    }

    if (s.invincible > 0) s.invincible--;

    // Rotate
    if (keys["ArrowLeft"] || keys["KeyA"]) s.angle -= TURN_SPEED;
    if (keys["ArrowRight"] || keys["KeyD"]) s.angle += TURN_SPEED;

    // Thrust
    s.thrusting = keys["ArrowUp"] || keys["KeyW"];
    if (s.thrusting) {
      s.vx += Math.cos(s.angle) * THRUST_POWER;
      s.vy += Math.sin(s.angle) * THRUST_POWER;
    }

    // Friction
    s.vx *= FRICTION;
    s.vy *= FRICTION;

    // Move
    s.x += s.vx;
    s.y += s.vy;

    // Wrap
    wrapPosition(s);
  }

  // ---- Bullets ----
  function tryShoot() {
    if (ship.dead) return;
    if (fireCooldown > 0) return;
    if (bullets.length >= MAX_BULLETS) return;
    if (!(keys["Space"])) return;

    fireCooldown = FIRE_RATE;
    bullets.push({
      x: ship.x + Math.cos(ship.angle) * SHIP_SIZE,
      y: ship.y + Math.sin(ship.angle) * SHIP_SIZE,
      vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
      vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
      life: BULLET_LIFE,
    });
  }

  function drawBullets() {
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, TAU);
      ctx.fillStyle = COL.bullet;
      ctx.shadowColor = COL.bulletGlow;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life--;
      wrapPosition(b);
      if (b.life <= 0) bullets.splice(i, 1);
    }
  }

  // ---- Asteroids ----
  function spawnAsteroids(count) {
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = Math.random() * canvas.width;
        y = Math.random() * canvas.height;
      } while (dist(x, y, canvas.width / 2, canvas.height / 2) < 200);

      const angle = Math.random() * TAU;
      const speed = ASTEROID_SPEED_BASE + Math.random() * 0.8 + level * 0.12;
      asteroids.push(createAsteroid(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0));
    }
  }

  function createAsteroid(x, y, vx, vy, sizeIndex) {
    const r = ASTEROID_SIZES[sizeIndex];
    const verts = [];
    const numVerts = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numVerts; i++) {
      const a = (i / numVerts) * TAU;
      const jitter = 0.7 + Math.random() * 0.6;
      verts.push({ x: Math.cos(a) * r * jitter, y: Math.sin(a) * r * jitter });
    }
    return { x, y, vx, vy, r, sizeIndex, verts, rotAngle: 0, rotSpeed: (Math.random() - 0.5) * 0.02 };
  }

  function drawAsteroids() {
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotAngle);
      ctx.beginPath();
      ctx.moveTo(a.verts[0].x, a.verts[0].y);
      for (let i = 1; i < a.verts.length; i++) {
        ctx.lineTo(a.verts[i].x, a.verts[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = COL.asteroidStroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(139,147,167,0.06)";
      ctx.fill();
      ctx.restore();
    }
  }

  function updateAsteroids() {
    for (const a of asteroids) {
      a.x += a.vx;
      a.y += a.vy;
      a.rotAngle += a.rotSpeed;
      wrapPosition(a);
    }
  }

  function splitAsteroid(a, index) {
    asteroids.splice(index, 1);
    score += ASTEROID_SCORES[a.sizeIndex];

    spawnParticles(a.x, a.y, 10 + a.r * 0.5);
    screenShake = 6 + a.r * 0.15;

    if (a.sizeIndex < 2) {
      const next = a.sizeIndex + 1;
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * TAU;
        const speed = ASTEROID_SPEED_BASE + Math.random() * 1.5 + level * 0.15;
        asteroids.push(createAsteroid(a.x, a.y, Math.cos(angle) * speed, Math.sin(angle) * speed, next));
      }
    }
  }

  // ---- Particles ----
  function spawnParticles(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = Math.random() * 3 + 1;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: PARTICLE_LIFE * (0.5 + Math.random() * 0.5),
        maxLife: PARTICLE_LIFE,
        r: Math.random() * 2 + 0.5,
      });
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = (p.life / p.maxLife) * 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fillStyle = `rgba(110,231,183,${alpha})`;
      ctx.fill();
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ---- Collisions ----
  function checkCollisions() {
    // Bullets vs Asteroids
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        const b = bullets[bi];
        const a = asteroids[ai];
        if (!b || !a) continue;
        if (dist(b.x, b.y, a.x, a.y) < a.r + 4) {
          bullets.splice(bi, 1);
          splitAsteroid(a, ai);
          break;
        }
      }
    }

    // Ship vs Asteroids
    if (!ship.dead && ship.invincible <= 0) {
      for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        const a = asteroids[ai];
        if (dist(ship.x, ship.y, a.x, a.y) < a.r + SHIP_SIZE * 0.55) {
          destroyShip();
          break;
        }
      }
    }
  }

  function destroyShip() {
    spawnParticles(ship.x, ship.y, 30);
    screenShake = 14;
    ship.dead = true;
    ship.respawnTimer = 120;
    lives--;
    if (lives <= 0) {
      gameOver();
    }
  }

  function gameOver() {
    state = "gameover";
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("asteroids_hs", highScore.toString());
    }
    $("final-score").textContent = score.toLocaleString();
    $("high-score").textContent = highScore.toLocaleString();
    showOverlay("gameover-screen");
  }

  // ---- Level Management ----
  function checkLevel() {
    if (asteroids.length === 0) {
      level++;
      spawnAsteroids(3 + level);
    }
  }

  // ---- Utility ----
  function dist(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function wrapPosition(obj) {
    const margin = 60;
    if (obj.x < -margin) obj.x = canvas.width + margin;
    if (obj.x > canvas.width + margin) obj.x = -margin;
    if (obj.y < -margin) obj.y = canvas.height + margin;
    if (obj.y > canvas.height + margin) obj.y = -margin;
  }

  // ---- Game Init ----
  function startGame() {
    score = 0;
    lives = 3;
    level = 1;
    bullets = [];
    asteroids = [];
    particles = [];
    fireCooldown = 0;
    screenShake = 0;
    ship = createShip();
    ship.invincible = INVINCIBLE_TIME;
    spawnAsteroids(4);
    initStars();
    updateHUD();
    state = "playing";
    hideOverlay("start-screen");
    hideOverlay("gameover-screen");
  }

  // ---- Main Loop ----
  let frameCount = 0;

  function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);
    frameCount++;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Screen shake
    if (screenShake > 0) {
      const sx = (Math.random() - 0.5) * screenShake;
      const sy = (Math.random() - 0.5) * screenShake;
      ctx.save();
      ctx.translate(sx, sy);
      screenShake *= 0.88;
      if (screenShake < 0.5) screenShake = 0;
    }

    // Draw stars always
    drawStars(timestamp);

    if (state === "playing") {
      // Update
      updateShip(ship);
      tryShoot();
      if (fireCooldown > 0) fireCooldown--;
      updateBullets();
      updateAsteroids();
      updateParticles();
      checkCollisions();
      checkLevel();
      updateHUD();

      // Draw
      drawAsteroids();
      drawBullets();
      drawShip(ship, timestamp);
      drawParticles();
    } else if (state === "start" || state === "gameover") {
      // Draw floating asteroids in background
      updateAsteroids();
      updateParticles();
      drawAsteroids();
      drawParticles();
    } else if (state === "paused") {
      // Still draw scene frozen
      drawAsteroids();
      drawBullets();
      drawShip(ship, timestamp);
      drawParticles();
    }

    if (screenShake > 0) {
      ctx.restore();
    }
  }

  // ---- UI Events ----
  $("start-btn").addEventListener("click", startGame);
  $("restart-btn").addEventListener("click", startGame);

  // ---- Boot ----
  initStars();
  // Spawn some asteroids for the start screen background
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const angle = Math.random() * TAU;
    const speed = 0.5 + Math.random() * 0.8;
    asteroids.push(createAsteroid(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, Math.floor(Math.random() * 3)));
  }
  updateHUD();
  requestAnimationFrame(gameLoop);
})();
