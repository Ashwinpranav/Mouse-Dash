/* =========================================================
   MOUSE DASH — Cartoon Chase Runner
   Vanilla JS game logic. Organized into clearly commented
   sections so it's easy for beginners to read and edit.
   ========================================================= */

// ---------- Grab DOM elements ----------
const gameArea       = document.getElementById('game-area');
const mouseEl        = document.getElementById('mouse');
const catEl          = document.getElementById('cat');
const obstaclesLayer = document.getElementById('obstacles');
const scoreEl        = document.getElementById('score');
const highscoreEl    = document.getElementById('highscore');
const pauseBtn       = document.getElementById('pause-btn');
const tapZone        = document.getElementById('tap-zone');

const startScreen    = document.getElementById('start-screen');
const pauseScreen    = document.getElementById('pause-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const playBtn        = document.getElementById('play-btn');
const resumeBtn      = document.getElementById('resume-btn');
const restartBtn     = document.getElementById('restart-btn');
const finalScoreEl   = document.getElementById('final-score');
const finalHighEl    = document.getElementById('final-highscore');

// ---------- Game constants (tweak these to change difficulty) ----------
const GROUND_HEIGHT   = 80;    // px, must match CSS #ground height
const GRAVITY         = 0.9;   // how fast the mouse falls back down
const JUMP_FORCE      = 17;    // how high the mouse jumps
const START_SPEED     = 6;     // starting obstacle speed (px per frame)
const MAX_SPEED       = 16;    // obstacle speed cap
const SPEED_RAMP      = 0.0006;// how quickly speed increases over time
const SPAWN_MIN_MS    = 900;   // fastest obstacle spawn gap
const SPAWN_MAX_MS    = 1800;  // slowest obstacle spawn gap
const OBSTACLE_TYPES  = ['box', 'chair', 'table', 'block'];

// ---------- Game state ----------
let state = 'START'; // START | PLAYING | PAUSED | GAMEOVER
let mouseBottom = GROUND_HEIGHT; // current vertical position of the mouse
let mouseVelocity = 0;
let isJumping = false;

let gameSpeed = START_SPEED;
let score = 0;
let scoreTimer = 0;         // accumulates ms to know when to add a point
let elapsedMs = 0;          // total time played, used to ramp difficulty
let lastFrameTime = 0;
let nextSpawnIn = 0;        // ms until next obstacle spawns
let animationFrameId = null;

let highScore = Number(localStorage.getItem('mouseDashHighScore')) || 0;
highscoreEl.textContent = highScore;

// Mouse's fixed horizontal position (percentage converted to px) for collision math
function getMouseRect() {
  return mouseEl.getBoundingClientRect();
}

// ---------- Simple sound effects using Web Audio API (no external files needed) ----------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

// Plays a short beep. freq = pitch, duration in seconds, type = waveform.
function playTone(freq, duration, type = 'sine', volume = 0.2) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    // Fade out smoothly to avoid a "click" sound at the end
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio may be blocked before first user interaction — fail silently
  }
}

function playJumpSound() {
  playTone(520, 0.15, 'triangle', 0.18);
}

function playGameOverSound() {
  // A little descending "womp womp" using two quick tones
  playTone(300, 0.25, 'sawtooth', 0.2);
  setTimeout(() => playTone(180, 0.35, 'sawtooth', 0.2), 150);
}

// ---------- Obstacle spawning ----------
function spawnObstacle() {
  const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
  const el = document.createElement('div');
  el.className = `obstacle ${type}`;
  el.style.right = '-80px';   // start just off the right edge
  el.dataset.type = type;
  obstaclesLayer.appendChild(el);
}

function scheduleNextSpawn() {
  nextSpawnIn = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
}

// ---------- Collision detection ----------
function checkCollisions() {
  const mRect = mouseEl.querySelector('.mouse-body').getBoundingClientRect();
  const obstacles = obstaclesLayer.querySelectorAll('.obstacle');

  for (const obs of obstacles) {
    const oRect = obs.getBoundingClientRect();
    const overlap = !(
      mRect.right  < oRect.left  + 6 ||
      mRect.left   > oRect.right - 6 ||
      mRect.bottom < oRect.top   + 6 ||
      mRect.top    > oRect.bottom
    );
    if (overlap) {
      triggerGameOver();
      return;
    }
  }
}

// ---------- Jump handling ----------
function tryJump() {
  if (state !== 'PLAYING') return;
  if (isJumping) return;
  isJumping = true;
  mouseVelocity = JUMP_FORCE;
  mouseEl.classList.add('jumping');
  playJumpSound();
}

// ---------- Main update loop ----------
function update(dt) {
  // --- Difficulty ramp: speed slowly increases over time ---
  elapsedMs += dt;
  gameSpeed = Math.min(MAX_SPEED, START_SPEED + elapsedMs * SPEED_RAMP);

  // --- Mouse jump physics ---
  if (isJumping) {
    mouseBottom += mouseVelocity * (dt / 16.67); // scale by frame time
    mouseVelocity -= GRAVITY * (dt / 16.67);
    if (mouseBottom <= GROUND_HEIGHT) {
      mouseBottom = GROUND_HEIGHT;
      isJumping = false;
      mouseVelocity = 0;
      mouseEl.classList.remove('jumping');
    }
    mouseEl.style.bottom = mouseBottom + 'px';
  }

  // --- Move obstacles ---
  const obstacles = obstaclesLayer.querySelectorAll('.obstacle');
  obstacles.forEach(obs => {
    const currentRight = parseFloat(obs.style.right) || 0;
    const newRight = currentRight + gameSpeed * (dt / 16.67);
    obs.style.right = newRight + 'px';
    // Remove obstacles once they've scrolled off the left edge
    if (newRight > window.innerWidth + 100) {
      obs.remove();
    }
  });

  // --- Spawn new obstacles on a timer ---
  nextSpawnIn -= dt;
  if (nextSpawnIn <= 0) {
    spawnObstacle();
    scheduleNextSpawn();
  }

  // --- Score increases automatically over time ---
  scoreTimer += dt;
  if (scoreTimer >= 100) { // one point roughly every 100ms
    scoreTimer = 0;
    score += 1;
    scoreEl.textContent = score;
  }

  checkCollisions();
}

// ---------- Game loop (requestAnimationFrame) ----------
function loop(timestamp) {
  if (state !== 'PLAYING') return; // stop looping when not playing
  if (!lastFrameTime) lastFrameTime = timestamp;
  const dt = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  update(dt);

  animationFrameId = requestAnimationFrame(loop);
}

// ---------- Game over sequence ----------
function triggerGameOver() {
  if (state !== 'PLAYING') return;
  state = 'GAMEOVER';
  cancelAnimationFrame(animationFrameId);

  // Mouse falling animation
  mouseEl.classList.remove('jumping');
  mouseEl.classList.add('falling');

  // Cat sprints in fast to "catch" the mouse
  catEl.classList.add('chasing-fast');
  const mouseLeftPercent = mouseEl.style.left || getComputedStyle(mouseEl).left;
  catEl.style.left = `calc(${mouseLeftPercent} - 22px)`;

  playGameOverSound();

  // Update high score
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('mouseDashHighScore', String(highScore));
  }

  // Show game over screen after a brief pause so the animation is visible
  setTimeout(() => {
    finalScoreEl.textContent = `Score: ${score}`;
    finalHighEl.textContent = `Best: ${highScore}`;
    highscoreEl.textContent = highScore;
    gameoverScreen.classList.remove('hidden');
  }, 700);
}

// ---------- Reset / start a fresh game ----------
function resetGame() {
  // Clear obstacles
  obstaclesLayer.innerHTML = '';

  // Reset mouse
  mouseBottom = GROUND_HEIGHT;
  mouseVelocity = 0;
  isJumping = false;
  mouseEl.style.bottom = GROUND_HEIGHT + 'px';
  mouseEl.classList.remove('jumping', 'falling');

  // Reset cat back to its starting chase position
  catEl.classList.remove('chasing-fast');
  catEl.style.left = '3%';

  // Reset score & timers
  score = 0;
  scoreTimer = 0;
  elapsedMs = 0;
  gameSpeed = START_SPEED;
  scoreEl.textContent = '0';
  lastFrameTime = 0;
  scheduleNextSpawn();
}

function startGame() {
  resetGame();
  state = 'PLAYING';
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  animationFrameId = requestAnimationFrame(loop);
}

// ---------- Pause / resume ----------
function pauseGame() {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  cancelAnimationFrame(animationFrameId);
  pauseScreen.classList.remove('hidden');
}

function resumeGame() {
  if (state !== 'PAUSED') return;
  state = 'PLAYING';
  pauseScreen.classList.add('hidden');
  lastFrameTime = 0; // avoid a big dt jump after resuming
  animationFrameId = requestAnimationFrame(loop);
}

function togglePause() {
  if (state === 'PLAYING') pauseGame();
  else if (state === 'PAUSED') resumeGame();
}

// ---------- Input handling ----------
// Keyboard: Spacebar to jump, 'P' or Escape to pause
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault(); // stop page from scrolling
    if (state === 'START') startGame();
    else if (state === 'PLAYING') tryJump();
    else if (state === 'GAMEOVER') startGame();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
  }
});

// Touch / click on the tap zone triggers a jump (mobile-friendly)
tapZone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (state === 'PLAYING') tryJump();
}, { passive: false });

tapZone.addEventListener('mousedown', () => {
  if (state === 'PLAYING') tryJump();
});

// Buttons
playBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', resumeGame);

// Prevent double-tap zoom on mobile from interfering with taps
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------- Initial setup ----------
mouseEl.style.bottom = GROUND_HEIGHT + 'px';
