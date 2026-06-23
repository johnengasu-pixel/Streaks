/* ============================================================
   RAHT ELEMENTA STREAKS — v2 APPLICATION LOGIC
   Fully self-contained: all data lives in localStorage, so the
   app is 100% operational with no backend. The leaderboard shows
   only real members who sign in on this device.
   ============================================================ */

"use strict";

/* ---------------------------------------------------------
   0. CONSTANTS
   --------------------------------------------------------- */
const DB_KEY = "raht_streaks_v2";
const SESSION_KEY = "raht_streaks_v2_session";
const THEME_KEY = "raht_streaks_v2_theme";
const PREFS_KEY = "raht_streaks_v2_prefs";  // reminder preferences (persisted)

const HABITS = [
  { key: "bible", label: "Bible Reading", icon: "📖" },
  { key: "prayer", label: "Prayer", icon: "🙏" },
  { key: "scout", label: "Scout Activity", icon: "🏕️" },
];

const AVATAR_COLORS = [
  ["#8B5CF6", "#6D28D9"], ["#FDBA74", "#F97316"], ["#34D399", "#10B981"],
  ["#FB7185", "#E11D48"], ["#60A5FA", "#2563EB"], ["#FBBF24", "#D97706"],
  ["#F472B6", "#DB2777"], ["#22D3EE", "#0891B2"],
];

// Names auto-promoted to the "admin" role on first run; admins then sign in
// through the separate password-protected admin login.
const ADMIN_NAMES = ["merna"];
const DEFAULT_ADMIN_PASSWORD = "raht-admin";          // change on first sign-in

// Role-based: a user is admin only if their stored role says so. Combined with
// the member-login guard (admins can't use the simple flow), this means an
// admin session can only be created by passing the password check.
function isAdminUser(user) { return !!user && user.role === "admin"; }

/* ---------- Password hashing (salted SHA-256, never plaintext) ---------- */
// Pure-JS SHA-256 so hashing works in every context (incl. file://).
function sha256(ascii) {
  function rr(n, x) { return (x >>> n) | (x << (32 - n)); }
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = []; const words = []; let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const utf8 = unescape(encodeURIComponent(ascii));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
  for (let i = 0; i < bytes.length; i += 4) words.push((bytes[i]<<24)|(bytes[i+1]<<16)|(bytes[i+2]<<8)|bytes[i+3]);
  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(7,w[i-15])^rr(18,w[i-15])^(w[i-15]>>>3);
      const s1 = rr(17,w[i-2])^rr(19,w[i-2])^(w[i-2]>>>10);
      w[i] = (w[i-16]+s0+w[i-7]+s1)|0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(6,e)^rr(11,e)^rr(25,e), ch = (e&f)^(~e&g), t1 = (h+S1+ch+K[i]+w[i])|0;
      const S0 = rr(2,a)^rr(13,a)^rr(22,a), maj = (a&b)^(a&c)^(b&c), t2 = (S0+maj)|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
function randomSalt() {
  const a = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(16)) : Array.from({ length: 16 }, (_, i) => (i * 131 + 7) & 0xff);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashPassword = (pw, salt) => sha256(salt + ":" + pw);
const verifyPassword = (pw, salt, hash) => !!hash && hashPassword(pw, salt) === hash;

// Verse of the Day — rotates one per calendar day (see verseOfDay()).
const VERSES = [
  { text: "I can do all things through Christ who strengthens me.", ref: "Philippians 4:13" },
  { text: "Trust in the Lord with all your heart, and lean not on your own understanding.", ref: "Proverbs 3:5" },
  { text: "Be strong and courageous. Do not be afraid, for the Lord your God is with you wherever you go.", ref: "Joshua 1:9" },
  { text: "The Lord is my shepherd; I shall not want.", ref: "Psalm 23:1" },
  { text: "Pray without ceasing.", ref: "1 Thessalonians 5:17" },
  { text: "Let your light shine before others, that they may see your good deeds.", ref: "Matthew 5:16" },
  { text: "Cast all your anxiety on Him, because He cares for you.", ref: "1 Peter 5:7" },
  { text: "Love is patient, love is kind.", ref: "1 Corinthians 13:4" },
  { text: "This is the day the Lord has made; let us rejoice and be glad in it.", ref: "Psalm 118:24" },
  { text: "And we know that in all things God works for the good of those who love Him.", ref: "Romans 8:28" },
  { text: "The joy of the Lord is your strength.", ref: "Nehemiah 8:10" },
  { text: "Give thanks to the Lord, for He is good; His love endures forever.", ref: "Psalm 107:1" },
  { text: "Commit to the Lord whatever you do, and He will establish your plans.", ref: "Proverbs 16:3" },
  { text: "Wait for the Lord; be strong and take heart.", ref: "Psalm 27:14" },
  { text: "Your word is a lamp to my feet and a light to my path.", ref: "Psalm 119:105" },
  { text: "Whatever you do, work at it with all your heart, as working for the Lord.", ref: "Colossians 3:23" },
  { text: "Be kind and compassionate to one another.", ref: "Ephesians 4:32" },
  { text: "Seek first the kingdom of God and His righteousness.", ref: "Matthew 6:33" },
  { text: "He gives strength to the weary and increases the power of the weak.", ref: "Isaiah 40:29" },
  { text: "Let us not grow weary in doing good.", ref: "Galatians 6:9" },
  { text: "Cast your cares on the Lord and He will sustain you.", ref: "Psalm 55:22" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "Above all else, guard your heart, for everything you do flows from it.", ref: "Proverbs 4:23" },
  { text: "The Lord will fight for you; you need only to be still.", ref: "Exodus 14:14" },
  { text: "Blessed are the pure in heart, for they shall see God.", ref: "Matthew 5:8" },
  { text: "Do not be anxious about anything, but in every situation, by prayer, present your requests to God.", ref: "Philippians 4:6" },
  { text: "Rejoice always, pray continually, give thanks in all circumstances.", ref: "1 Thessalonians 5:16-18" },
  { text: "The Lord is near to all who call on Him.", ref: "Psalm 145:18" },
  { text: "In their hearts humans plan their course, but the Lord establishes their steps.", ref: "Proverbs 16:9" },
  { text: "Do everything in love.", ref: "1 Corinthians 16:14" },
];

// Short streak encouragements shown under the ring (not verses).
const QUOTES = [
  "“Be strong and courageous.” — Joshua 1:9",
  "“Pray without ceasing.” — 1 Thessalonians 5:17",
  "Small steps, taken daily, become a journey.",
  "“Let your light shine before others.” — Matthew 5:16",
  "Faithful in little, faithful in much.",
  "A scout is trustworthy, loyal, and helpful — every single day.",
];

/* ---------------------------------------------------------
   1. STATE
   --------------------------------------------------------- */
let db = null;            // { users:[], records:[] }
let currentUser = null;   // user object
let calendarCursor = new Date();
let rankMode = "current"; // 'current' | 'perfect'
let reminderTimer = null;
let prefs = {};           // persisted reminder preferences

/* ---------------------------------------------------------
   2. DATE HELPERS (local, not UTC)
   --------------------------------------------------------- */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayKey() { return dateKey(new Date()); }
function parseKey(key) { return new Date(key + "T00:00:00"); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function prettyDate(key) {
  return parseKey(key).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
// Whole days since the epoch, in LOCAL time — increments exactly once per
// calendar day, so it's a stable rotating index for the verse of the day.
function epochDay(d = new Date()) {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}
function verseOfDay() {
  return VERSES[((epochDay() % VERSES.length) + VERSES.length) % VERSES.length];
}

/* ---------------------------------------------------------
   3. SMALL DOM HELPERS
   --------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalizePhone(raw) {
  // Strip everything but digits and a leading +, so "0244 123 456",
  // "0244-123-456" and "0244123456" all resolve to one identity.
  let s = String(raw || "").trim().replace(/[^\d+]/g, "");
  if (s.indexOf("+") > 0) s = s.replace(/\+/g, "");      // + only valid at start
  return s;
}
function initials(name) {
  const i = String(name || "").trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "").join("");
  return i || "?";
}
/* ---- Avatars: real photo if set, else a colored initials circle ---- */
const AVATAR_MAX_PX = 256;                                   // output size after crop
const AVATAR_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function avatarBgStyle(user) {
  if (user && user.avatar) return "";                        // image covers the circle
  const [a, b] = (user && user.color) || AVATAR_COLORS[0];
  return `background:linear-gradient(140deg,${a},${b})`;
}
function avatarInner(user) {
  if (user && user.avatar) return `<img class="avatar-img" src="${user.avatar}" alt="">`;
  return escapeHtml(initials(user && user.name));
}
function applyAvatar(el, user) {
  if (!el) return;
  el.setAttribute("style", avatarBgStyle(user));
  el.innerHTML = avatarInner(user);
}

// Read → center-crop to a square → downscale → compress (WebP, JPEG fallback).
// Returns a Promise<dataURL>. onProgress(0..100) drives the upload bar.
function processImageFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!file || !AVATAR_TYPES.includes(file.type)) {
      reject(new Error("Unsupported format. Please use JPG, PNG or WebP.")); return;
    }
    if (file.size > 12 * 1024 * 1024) { reject(new Error("That image is too large (max 12 MB).")); return; }
    const reader = new FileReader();
    reader.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 55)); };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        onProgress?.(80);
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
        const size = Math.min(AVATAR_MAX_PX, side);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        let url = canvas.toDataURL("image/webp", 0.82);
        if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.82); // Safari fallback
        onProgress?.(100);
        resolve(url);
      };
      img.onerror = () => reject(new Error("That image couldn't be loaded."));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// localStorage can throw when full (data-URL images add weight) — guard saves.
function trySaveDb() {
  try { saveDb(); return true; }
  catch { showToast("Storage is full on this device — try a smaller image.", true); return false; }
}
function setLoading(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  const t = btn.querySelector(".btn-text"), s = btn.querySelector(".spinner");
  if (s) s.hidden = !on;
  if (t) t.style.opacity = on ? .5 : 1;
}
function showToast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("is-error", isError);
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => { t.hidden = true; }, 240);
  }, 2600);
}

function emptyState(icon, title, sub) {
  return `<div class="empty"><div class="empty-ic">${icon}</div><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(sub)}</p></div>`;
}

/* ---------------------------------------------------------
   4. STORE (localStorage persistence + seeding)
   --------------------------------------------------------- */
function saveDb() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) { db = JSON.parse(raw); purgeDemo(); ensureRoles(); return; }
  } catch { /* fall through to fresh db */ }
  db = { users: [], records: [] };
  ensureRoles();
  saveDb();
}

// Every user gets a role; at least one admin always exists with credentials.
function ensureRoles() {
  let changed = false;
  db.users.forEach((u) => {
    if (!u.role) { u.role = ADMIN_NAMES.includes((u.name || "").toLowerCase()) ? "admin" : "member"; changed = true; }
  });
  if (!db.users.some((u) => u.role === "admin")) {
    db.users.push({ id: uid("u"), name: "Merna", phone: "0241234567", createdAt: todayKey(), color: AVATAR_COLORS[0], role: "admin" });
    changed = true;
  }
  db.users.filter((u) => u.role === "admin").forEach((a) => {
    if (!a.username) { a.username = (a.name || "admin").toLowerCase().replace(/\s+/g, ""); changed = true; }
    if (!a.passwordHash) { a.salt = randomSalt(); a.passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD, a.salt); a.mustChangePw = true; changed = true; }
  });
  if (changed) saveDb();
}

// Remove the old seeded sample members (and their records) from saved data.
function purgeDemo() {
  const demoIds = new Set(db.users.filter((u) => u.demo).map((u) => u.id));
  if (!demoIds.size) return;
  db.users = db.users.filter((u) => !u.demo);
  db.records = db.records.filter((r) => !demoIds.has(r.userId));
  saveDb();
}

let _idc = 1;
function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${(_idc++).toString(36)}`; }

// Deterministic pseudo-random in [0,1) from a string (stable across reloads).
function pseudo(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

/* ---------------------------------------------------------
   5. DATA ACCESS
   --------------------------------------------------------- */
function recordsFor(userId) {
  return db.records.filter((r) => r.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
}
function recordOn(userId, key) {
  return db.records.find((r) => r.userId === userId && r.date === key) || null;
}
function upsertRecord(userId, key, data) {
  let rec = recordOn(userId, key);
  if (rec) { Object.assign(rec, data); }
  else { rec = { id: uid("r"), userId, date: key, bible: false, prayer: false, scout: false, notes: "", ...data }; db.records.push(rec); }
  saveDb();
  return rec;
}
function findUserByPhone(phone) {
  const n = normalizePhone(phone);
  return db.users.find((u) => normalizePhone(u.phone) === n) || null;
}

/* ---------------------------------------------------------
   6. STREAK / STATS MATH
   --------------------------------------------------------- */
const doneCount = (r) => r ? (!!r.bible + !!r.prayer + !!r.scout) : 0;
const isAllDone = (r) => doneCount(r) === 3;        // perfect
const isActive  = (r) => doneCount(r) >= 1;         // counts as an active day
const isAnyDone = isActive;                          // kept as alias

// Four completion levels by activities completed (0–3).
const LEVELS = {
  3: { key: "perfect", label: "Perfect Day", short: "Perfect", emoji: "🟢", cls: "lvl-perfect" },
  2: { key: "partial", label: "Partial Day", short: "Partial", emoji: "🟡", cls: "lvl-partial" },
  1: { key: "minimal", label: "Minimal Day", short: "Minimal", emoji: "🟠", cls: "lvl-minimal" },
  0: { key: "missed",  label: "Missed Day",  short: "Missed",  emoji: "🔴", cls: "lvl-missed"  },
};
const levelOf = (r) => LEVELS[doneCount(r)];
const statusCls = (r) => "s-" + levelOf(r).key;     // s-perfect | s-partial | s-minimal | s-missed

function byDate(records) { const m = new Map(); records.forEach((r) => m.set(r.date, r)); return m; }

// Generic "consecutive days ending today" streak for any per-day predicate.
// Today not yet satisfying the predicate doesn't break it until the day ends.
function streakOf(records, predicate) {
  const map = byDate(records);
  let cur = new Date(), streak = 0;
  if (!predicate(map.get(dateKey(cur)))) cur = addDays(cur, -1);
  while (predicate(map.get(dateKey(cur)))) { streak++; cur = addDays(cur, -1); }
  return streak;
}
// Longest historical run satisfying a predicate.
function longestRun(records, predicate) {
  if (!records.length) return 0;
  const map = byDate(records);
  let cur = parseKey(records[0].date), last = parseKey(records[records.length - 1].date), best = 0, run = 0;
  while (cur <= last) {
    if (predicate(map.get(dateKey(cur)))) { run++; best = Math.max(best, run); } else run = 0;
    cur = addDays(cur, 1);
  }
  return best;
}

// Current streak now means ACTIVE streak (≥1 activity keeps it alive).
const currentStreak = (records) => streakOf(records, isActive);
const perfectStreak = (records) => streakOf(records, isAllDone);
const longestStreak = (records) => longestRun(records, isActive);        // best active streak
const longestPerfectStreak = (records) => longestRun(records, isAllDone); // best perfect streak

// One bundle of every stat a screen needs.
function userStats(records) {
  const activeDays = records.filter(isActive).length;
  const perfectDays = records.filter(isAllDone).length;
  return {
    active: currentStreak(records),
    perfect: perfectStreak(records),
    bestActive: longestStreak(records),
    bestPerfect: longestPerfectStreak(records),
    activeDays, perfectDays,
    perfectRate: activeDays ? Math.round(perfectDays / activeDays * 100) : 0,
  };
}

function percentages(records) {
  const t = records.length || 1;
  return {
    bible: Math.round(records.filter((r) => r.bible).length / t * 100),
    prayer: Math.round(records.filter((r) => r.prayer).length / t * 100),
    scout: Math.round(records.filter((r) => r.scout).length / t * 100),
    perfect: Math.round(records.filter(isAllDone).length / t * 100),
  };
}

/* ---------------------------------------------------------
   7. SESSION / AUTH
   --------------------------------------------------------- */
// Session records WHETHER it was created via the secure admin login. An admin
// account restored without that flag is forced to re-authenticate.
function saveSession(id, admin) { localStorage.setItem(SESSION_KEY, JSON.stringify({ id, admin: !!admin })); }
function readSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { const v = JSON.parse(raw); if (v && typeof v === "object" && v.id) return v; } catch { /* legacy string */ }
  return { id: raw, admin: false };
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function handleLogin(e) {
  e.preventDefault();
  const name = $("login-name").value.trim();
  const phone = $("login-phone").value.trim();
  const err = $("login-error");
  err.hidden = true;

  if (!name || !phone) { err.textContent = "Please enter both your name and phone number."; err.hidden = false; return; }
  if (normalizePhone(phone).replace(/\D/g, "").length < 6) {
    err.textContent = "That phone number looks too short — please check it."; err.hidden = false; return;
  }

  const btn = $("login-btn");
  setLoading(btn, true);
  // Tiny delay purely for the satisfying spinner; everything is local.
  setTimeout(() => {
    let user = findUserByPhone(phone);
    // Admin accounts must NOT log in through the simple member flow.
    if (user && user.role === "admin") {
      setLoading(btn, false);
      err.textContent = "This is an administrator account. Please use Administrator login.";
      err.hidden = false;
      showAdminLogin();
      return;
    }
    if (!user) {
      user = {
        id: uid("u"), name, phone: normalizePhone(phone), createdAt: todayKey(),
        color: AVATAR_COLORS[db.users.length % AVATAR_COLORS.length], role: "member",
      };
      db.users.push(user); saveDb();
    } else if (name && user.name !== name) {
      user.name = name; saveDb();          // keep the freshly typed name
    }
    currentUser = user;
    saveSession(user.id, false);
    setLoading(btn, false);
    enterApp();
  }, 380);
}

// Separate, password-protected admin sign-in.
function handleAdminLogin(e) {
  e.preventDefault();
  const username = $("admin-username").value.trim().toLowerCase();
  const phone = $("admin-login-phone").value.trim();
  const pw = $("admin-password").value;
  const err = $("admin-login-error");
  err.hidden = true;
  if (!username || !phone || !pw) { err.textContent = "Enter username, phone and password."; err.hidden = false; return; }

  const btn = $("admin-login-btn");
  setLoading(btn, true);
  setTimeout(() => {
    const user = db.users.find((u) => u.role === "admin" &&
      ((u.username || "").toLowerCase() === username || (u.name || "").toLowerCase() === username));
    const ok = user
      && normalizePhone(user.phone) === normalizePhone(phone)
      && verifyPassword(pw, user.salt, user.passwordHash);
    setLoading(btn, false);
    if (!ok) {                            // identical message for any failure (no info leak)
      err.textContent = "Invalid administrator credentials.";
      err.hidden = false;
      $("admin-password").value = "";
      return;
    }
    currentUser = user;
    saveSession(user.id, true);
    $("admin-form").reset();
    enterApp();
    showToast(`Welcome back, ${user.name.split(" ")[0]}.`);
    if (user.mustChangePw) setTimeout(() => { switchTab("more"); openChangePassword(true); }, 600);
  }, 420);
}

function showAdminLogin() { $("member-login").hidden = true; $("admin-login").hidden = false; $("admin-username").focus(); }
function showMemberLogin() { $("admin-login").hidden = true; $("member-login").hidden = false; $("admin-login-error").hidden = true; }

function logout() {
  clearSession();
  currentUser = null;
  draft = null;
  stopReminderLoop();
  $("app").hidden = true;
  $("login-screen").hidden = false;
  $("login-form").reset();
  $("admin-form").reset();
  showMemberLogin();
}

/* ---------------------------------------------------------
   8. APP ENTRY + FULL RENDER
   --------------------------------------------------------- */
function enterApp() {
  $("login-screen").hidden = true;
  $("app").hidden = false;
  loadDraft();                         // seed today's draft for this user before first render
  renderAll();
  switchTab("today");
  window.scrollTo(0, 0);
  if (prefs.reminderOn) startReminderLoop();
}

function renderAll() {
  renderToday();
  renderCalendar();
  renderRanks();
  renderJournal();
  renderInsights();
  renderMore();
}

/* ----- TODAY ----- */
let draft = null;
function loadDraft() {
  const rec = recordOn(currentUser.id, todayKey());
  draft = { bible: !!rec?.bible, prayer: !!rec?.prayer, scout: !!rec?.scout, notes: rec?.notes || "" };
}
function renderToday() {
  if (!draft) loadDraft();            // initialise once; never clobber in-progress taps
  const recs = recordsFor(currentUser.id);
  const st = userStats(recs);
  const cur = st.active;

  const hour = new Date().getHours();
  $("greeting").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  $("member-name").textContent = currentUser.name;
  $("today-date").textContent = prettyDate(todayKey());

  // verse of the day (rotates once per calendar day)
  const verse = verseOfDay();
  $("verse-text").textContent = `“${verse.text}”`;
  $("verse-ref").textContent = "— " + verse.ref;

  // hero ring (driven by the active streak)
  $("hero-ring").style.setProperty("--pct", Math.min(100, cur * 10) || (isActive(draft) ? 4 : 0));
  $("ring-streak").textContent = cur;
  $("ring-caption").textContent = cur > 0
    ? `${cur}-day active streak — keep showing up!`
    : "Complete at least one activity to start your streak.";

  $("mini-streak-num").textContent = cur;
  $("qs-current").textContent = st.active;
  $("qs-perfect").textContent = st.perfect;
  $("qs-active").textContent = st.activeDays;
  $("qs-rate").textContent = st.perfectRate + "%";

  // today status chip — four levels
  const dc = doneCount(draft);
  const lvl = LEVELS[dc];
  const chip = $("today-status");
  chip.className = "chip " + (dc ? lvl.cls : "");
  chip.textContent = dc === 0 ? "Not started" : `${lvl.emoji} ${lvl.label} · ${dc}/3`;

  // habit cards
  $$(".habit", $("today-habits")).forEach((card) => {
    const k = card.dataset.key, on = !!draft[k];
    card.classList.toggle("is-done", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
    card.querySelector(".habit-state").textContent = on ? "Done today ✓" : "Tap to mark done";
  });
  $("today-notes").value = draft.notes;

  renderWeekChart(recs);
}
function renderWeekChart(recs) {
  const map = byDate(recs), wrap = $("week-chart"); wrap.innerHTML = "";
  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i), key = dateKey(d);
    const n = key === todayKey() ? doneCount(draft) : doneCount(map.get(key));
    const col = document.createElement("div"); col.className = "wc-col";
    col.innerHTML =
      `<div class="wc-bar lv${n} ${key === todayKey() ? "is-today" : ""}" style="height:${[6, 36, 68, 100][n]}%" title="${key}: ${n}/3"></div>
       <span class="wc-lab">${labels[d.getDay()]}</span>`;
    wrap.appendChild(col);
  }
}
function toggleHabit(key) {
  draft[key] = !draft[key];
  renderToday(); // re-render (cheap) keeps chart + chips in sync
}
function saveToday() {
  const btn = $("save-btn");
  setLoading(btn, true);                                     // visible loading feedback
  draft.notes = $("today-notes").value.trim();
  setTimeout(() => {
    try {
      const recsBefore = recordsFor(currentUser.id);
      const activeBefore = currentStreak(recsBefore), perfectBefore = perfectStreak(recsBefore);
      upsertRecord(currentUser.id, todayKey(), { ...draft }); // persists + may throw on quota
      const recsAfter = recordsFor(currentUser.id);
      const activeAfter = currentStreak(recsAfter), perfectAfter = perfectStreak(recsAfter);

      const dc = doneCount(draft);
      const msg = $("checkin-msg");
      msg.textContent = dc === 3 ? "🟢 Perfect day saved — all three complete!"
        : dc === 0 ? "Saved. Check in at least one activity to keep your streak."
        : `${LEVELS[dc].emoji} ${LEVELS[dc].label} saved — your streak lives on!`;
      msg.hidden = false;
      showToast("Today's progress saved.");
      renderAll();

      // Celebrate: perfect-day milestones (every 7), or a perfect day, or an active-streak milestone.
      if (perfectAfter > perfectBefore && perfectAfter % 7 === 0) {
        fireConfetti(); showToast(`🎉 ${perfectAfter} perfect days in a row!`);
      } else if (dc === 3 && perfectAfter > perfectBefore) {
        fireConfetti(0.6);
      } else if (activeAfter > activeBefore && activeAfter % 7 === 0) {
        fireConfetti(0.7); showToast(`🔥 ${activeAfter}-day active streak — amazing consistency!`);
      }
    } catch (err) {
      showToast("Couldn't save your progress — please try again.", true);
    } finally {
      setLoading(btn, false);
    }
  }, 260);
}

/* ----- CALENDAR ----- */
let selectedCalDay = null;                              // day whose notes the board shows

function renderCalendar() {
  const today = todayKey();
  if (!selectedCalDay || selectedCalDay > today) selectedCalDay = today;

  const y = calendarCursor.getFullYear(), m = calendarCursor.getMonth();
  const map = byDate(recordsFor(currentUser.id));
  $("cal-label").textContent = calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const grid = $("cal-grid"); grid.innerHTML = "";
  const start = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < start; i++) {
    const e = document.createElement("div"); e.className = "cal-cell is-empty"; grid.appendChild(e);
  }
  for (let day = 1; day <= days; day++) {
    const key = dateKey(new Date(y, m, day));
    const rec = map.get(key), future = key > today;
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.textContent = day;
    cell.dataset.date = key;
    if (future) cell.classList.add("is-future");
    else cell.classList.add("tappable", statusCls(rec));   // s-perfect | s-partial | s-minimal | s-missed
    if (key === today) cell.classList.add("is-today");
    if (key === selectedCalDay) cell.classList.add("is-selected");
    grid.appendChild(cell);
  }
  renderCalBoard(selectedCalDay);
}

// Board of every member's note for the selected (already-started) day.
function renderCalBoard(key) {
  $("cal-board-date").textContent = prettyDate(key) + (key === todayKey() ? " · today" : "");
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const withNotes = db.records
    .filter((r) => r.date === key && (r.notes || "").trim())
    .sort((a, b) => (byId.get(a.userId)?.name || "").localeCompare(byId.get(b.userId)?.name || ""));

  const list = $("cal-notes");
  if (!withNotes.length) {
    list.innerHTML = emptyState("📝", "No notes for this day yet", "When members add notes to their check-in, they'll appear here.");
  } else {
    list.innerHTML = withNotes.map((r) => {
      const u = byId.get(r.userId), me = u && u.id === currentUser.id;
      const n = doneCount(r), lvl = LEVELS[n];
      return `<div class="cal-note${me ? " is-me" : ""}">
        <span class="avatar avatar-sm" style="${avatarBgStyle(u)}">${avatarInner(u)}</span>
        <div class="cn-body">
          <div class="cn-head"><strong>${escapeHtml(u?.name || "Unknown")}${me ? " (you)" : ""}</strong><span class="cn-lvl">${lvl.emoji} ${n}/3</span></div>
          <p class="cn-text">${escapeHtml(r.notes)}</p>
        </div>
      </div>`;
    }).join("");
  }
}

function selectCalDay(key) {
  selectedCalDay = key;
  renderCalendar();
}

/* ----- RANKS ----- */
function renderRanks() {
  const list = $("rank-list"); list.innerHTML = "";
  const ranked = db.users.map((u) => {
    const s = userStats(recordsFor(u.id));
    return { user: u, current: s.active, perfect: s.perfect, bestActive: s.bestActive, bestPerfect: s.bestPerfect };
  }).sort((a, b) => (b[rankMode] - a[rankMode]) || (b.bestPerfect - a.bestPerfect) || a.user.name.localeCompare(b.user.name));

  const emoji = rankMode === "perfect" ? "🟢" : "🔥";
  const medals = ["🥇", "🥈", "🥉"];
  ranked.forEach((row, i) => {
    const me = row.user.id === currentUser.id;
    const li = document.createElement("li");
    li.className = "rank-item" + (me ? " is-me" : "");
    li.innerHTML =
      `<span class="rank-pos ${i < 3 ? "medal" : ""}">${i < 3 ? medals[i] : i + 1}</span>
       <span class="avatar" style="${avatarBgStyle(row.user)}">${avatarInner(row.user)}</span>
       <span class="rank-name">${escapeHtml(row.user.name)}${me ? " (you)" : ""}<small>best active ${row.bestActive} · best perfect ${row.bestPerfect} 🟢</small></span>
       <span class="rank-streak">${row[rankMode]} ${emoji}</span>`;
    list.appendChild(li);
  });
  if (!ranked.length) list.innerHTML = emptyState("🏕️", "No members yet", "Be the first to start a streak today!");
}

/* ----- JOURNAL ----- */
const statusClass = statusCls;

function renderJournal() {
  const q = ($("journal-search").value || "").trim().toLowerCase();
  const all = recordsFor(currentUser.id).slice().reverse();   // newest first
  const list = all.filter((r) =>
    !q || (r.notes || "").toLowerCase().includes(q) || r.date.includes(q) || prettyDate(r.date).toLowerCase().includes(q)
  );
  $("journal-count").textContent = all.length ? `${list.length} of ${all.length}` : "";
  const wrap = $("journal-list");

  if (!all.length) {
    wrap.innerHTML = emptyState("📓", "Your journal is empty", "Save a check-in on the Today tab and your day appears here.");
    return;
  }
  if (!list.length) {
    wrap.innerHTML = emptyState("🔍", "No matching entries", "Try a different word or date.");
    return;
  }
  const chip = (on, icon) => `<span class="je-chip ${on ? "" : "off"}">${icon}</span>`;
  wrap.innerHTML = list.map((r) => {
    const n = doneCount(r), lvl = LEVELS[n];
    return `<div class="journal-entry" data-date="${r.date}">
      <span class="je-dot ${statusClass(r)}"></span>
      <div class="je-head">
        <strong>${prettyDate(r.date)}</strong>
        <span class="je-chips">${chip(r.bible, "📖")}${chip(r.prayer, "🙏")}${chip(r.scout, "🏕️")}</span>
        <small>${lvl.emoji} ${lvl.label} · ${n}/3${r.date === todayKey() ? " · today" : ""}</small>
      </div>
      <button class="je-edit" type="button">Edit</button>
      <p class="je-notes ${r.notes ? "" : "empty-note"}">${r.notes ? escapeHtml(r.notes) : "No notes for this day."}</p>
    </div>`;
  }).join("");
}

/* ----- INSIGHTS ----- */
function renderInsights() {
  const recs = recordsFor(currentUser.id);
  const pct = percentages(recs);
  $("habit-bars").innerHTML = [
    { k: "bible", lab: "📖 Bible Reading", v: pct.bible, c: "bf-bible" },
    { k: "prayer", lab: "🙏 Prayer", v: pct.prayer, c: "bf-prayer" },
    { k: "scout", lab: "🏕️ Scout Activity", v: pct.scout, c: "bf-scout" },
  ].map((b) =>
    `<div class="bar-row">
       <div class="bar-top"><span>${b.lab}</span><span>${b.v}%</span></div>
       <div class="bar-track"><div class="bar-fill ${b.c}" style="width:${b.v}%"></div></div>
     </div>`).join("");

  // this month — only count from when the user actually started tracking,
  // so days before they joined aren't unfairly marked "missed".
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  $("ins-month-label").textContent = now.toLocaleDateString(undefined, { month: "long" });
  const map = byDate(recs);
  let startKey = currentUser.createdAt || (recs[0] && recs[0].date) || todayKey();
  if (recs[0] && recs[0].date < startKey) startKey = recs[0].date; // backfilled past days count too
  let perfect = 0, partial = 0, minimal = 0, missed = 0, active = 0;
  const daysSoFar = now.getDate();
  for (let d = 1; d <= daysSoFar; d++) {
    const key = dateKey(new Date(y, m, d));
    if (key < startKey) continue;                  // before this member began — not applicable
    const n = doneCount(map.get(key));
    if (n === 3) perfect++; else if (n === 2) partial++; else if (n === 1) minimal++; else missed++;
    if (n >= 1) active++;
  }
  $("ins-perfect").textContent = perfect;
  $("ins-partial").textContent = partial;
  $("ins-minimal").textContent = minimal;
  $("ins-missed").textContent = missed;
  $("ins-active").textContent = active;
  $("ins-monthrate").textContent = Math.round(perfect / (active || 1) * 100) + "%";

  // achievements — based on BEST PERFECT streak, so once earned they stay earned
  const bestPerfect = longestPerfectStreak(recs);
  const curPerfect = perfectStreak(recs);
  const tiers = [3, 7, 14, 30, 60, 100];
  const next = tiers.find((t) => t > bestPerfect) || null;
  $("milestone-text").textContent = next
    ? `Best perfect-day streak: ${bestPerfect}. Reach ${next} perfect days in a row for your next badge — ${next - bestPerfect} to go${curPerfect ? ` (currently on ${curPerfect}).` : "."}`
    : `Legendary — ${bestPerfect} perfect days in a row! Every badge earned. 🏅`;
  $("milestone-fill").style.width = (next ? Math.min(100, bestPerfect / next * 100) : 100) + "%";
  $("badges").innerHTML = tiers.map((t) =>
    `<span class="badge-pill ${bestPerfect >= t ? "earned" : ""}">${bestPerfect >= t ? "🏅" : "🔒"} ${t}-day</span>`).join("");
}

/* ----- MORE / SETTINGS ----- */
function renderMore() {
  applyAvatar($("profile-avatar"), currentUser);
  applyAvatar($("header-avatar-btn"), currentUser);
  $("profile-name").textContent = currentUser.name;
  $("profile-phone").textContent = currentUser.phone;
  $("dark-switch").checked = document.body.dataset.theme === "dark";

  // profile mini-stats (real, from this member's records)
  const st = userStats(recordsFor(currentUser.id));
  const tiers = [3, 7, 14, 30, 60, 100];
  const earned = tiers.filter((t) => st.bestPerfect >= t).length;
  $("profile-mini").innerHTML = [
    [st.active, "Current 🔥"],
    [st.perfect, "Perfect 🟢"],
    [`${earned}/${tiers.length}`, "Badges 🏅"],
  ].map(([v, l]) => `<div class="pm-cell"><span class="pm-val">${v}</span><span class="pm-lab">${l}</span></div>`).join("");

  applyReminderUI();

  // Admin section is visible ONLY to designated admins (Merna).
  const adminCard = $("admin-card");
  if (isAdminUser(currentUser)) {
    adminCard.hidden = false;
    $("admin-chip").textContent = "Admin";
    $("admin-chip").classList.add("is-perfect");
    renderAdmin();
  } else {
    adminCard.hidden = true;          // everyone else never sees admin at all
  }
}

/* ----- ADMIN ----- */
// Group engagement metrics + a 14-day activity trend — all from real data.
function renderAdminEngagement() {
  if (!isAdminUser(currentUser)) return;                 // permission gate
  const members = db.users, today = new Date();
  const last7 = new Set();
  for (let i = 0; i < 7; i++) last7.add(dateKey(addDays(today, -i)));

  const activeWeek = members.filter((u) =>
    db.records.some((r) => r.userId === u.id && last7.has(r.date) && isAnyDone(r))).length;
  const perfectToday = members.filter((u) => isAllDone(recordOn(u.id, todayKey()))).length;
  const totalCheckins = db.records.filter(isAnyDone).length;
  const streaks = members.map((u) => currentStreak(recordsFor(u.id)));
  const avgStreak = members.length ? Math.round(streaks.reduce((a, b) => a + b, 0) / members.length) : 0;
  const participation = members.length ? Math.round(activeWeek / members.length * 100) : 0;

  $("admin-stats").innerHTML = [
    ["Members", members.length], ["Active / week", activeWeek], ["Participation", participation + "%"],
    ["Perfect today", perfectToday], ["Avg streak", avgStreak], ["Total check-ins", totalCheckins],
  ].map(([lab, val]) => `<div class="as-cell"><span class="as-val">${val}</span><span class="as-lab">${lab}</span></div>`).join("");

  // 14-day participation trend: members active (≥1 activity) each day,
  // split visually so the perfect portion of each bar shows too.
  const counts = [];
  let maxN = 1;
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i), key = dateKey(d);
    const act = members.filter((u) => isActive(recordOn(u.id, key))).length;
    const perf = members.filter((u) => isAllDone(recordOn(u.id, key))).length;
    counts.push({ day: d.getDate(), act, perf }); maxN = Math.max(maxN, act);
  }
  $("admin-trend").innerHTML = counts.map(({ day, act, perf }) => {
    const h = Math.max(4, Math.round(act / maxN * 100));
    const perfPct = act ? Math.round(perf / act * 100) : 0;
    return `<div class="at-col">
      <div class="at-bar ${act ? "" : "empty"}" style="height:${h}%" title="${act} active · ${perf} perfect">
        <div class="at-bar-perfect" style="height:${perfPct}%"></div>
      </div>
      <span class="at-lab">${day}</span></div>`;
  }).join("");
}

function renderAdmin() {
  if (!isAdminUser(currentUser)) return;                 // permission gate
  renderAdminEngagement();
  const search = ($("admin-search").value || "").trim().toLowerCase();
  const dateF = $("admin-date").value;
  const byId = new Map(db.users.map((u) => [u.id, u]));

  const rows = db.records
    .filter((r) => {
      const u = byId.get(r.userId);
      const okText = !search || (u && ((u.name || "").toLowerCase().includes(search) || (u.phone || "").includes(search)));
      const okDate = !dateF || r.date === dateF;
      return okText && okDate;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  $("admin-mcount").textContent = db.users.length;
  $("admin-rcount").textContent = rows.length;
  $("admin-rows").innerHTML = rows.length
    ? rows.map((r) => {
        const u = byId.get(r.userId);
        return `<tr><td>${r.date}</td>
          <td><span class="admin-member"><span class="avatar avatar-xs" style="${avatarBgStyle(u)}">${avatarInner(u)}</span>${escapeHtml(u?.name || "Unknown")}</span></td>
          <td>${r.bible ? "✅" : "—"}</td><td>${r.prayer ? "✅" : "—"}</td><td>${r.scout ? "✅" : "—"}</td>
          <td>${escapeHtml(r.notes || "")}</td></tr>`;
      }).join("")
    : `<tr><td colspan="6" class="muted">No records match.</td></tr>`;
}
function exportCsv() {
  if (!isAdminUser(currentUser)) { showToast("Admins only.", true); return; }  // permission gate
  if (!db.records.length) { showToast("No records to export yet.", true); return; }
  const byId = new Map(db.users.map((u) => [u.id, u]));
  const head = ["Date", "Member", "Phone", "Bible", "Prayer", "Scout", "Notes"];
  const rows = db.records.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
    const u = byId.get(r.userId);
    return [r.date, u?.name || "Unknown", u?.phone || "", r.bible ? "Yes" : "No", r.prayer ? "Yes" : "No", r.scout ? "Yes" : "No", (r.notes || "").replace(/\n/g, " ")];
  });
  const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `raht-elementa-records-${todayKey()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSV exported.");
}

/* ---------------------------------------------------------
   9. MODAL (day editor + name editor + dialogs)
   --------------------------------------------------------- */
function openModal(title, bodyEl) {
  $("modal-title").textContent = title;
  const body = $("modal-body"); body.innerHTML = ""; body.appendChild(bodyEl);
  $("modal").hidden = false;
}
function closeModal() { $("modal").hidden = true; }

function openDayEditor(key) {
  if (key > todayKey()) return;
  const rec = recordOn(currentUser.id, key) || { bible: false, prayer: false, scout: false, notes: "" };
  const state = { bible: !!rec.bible, prayer: !!rec.prayer, scout: !!rec.scout, notes: rec.notes || "" };
  const wrap = document.createElement("div");
  wrap.className = "modal-body";
  wrap.innerHTML =
    `<p class="muted">${prettyDate(key)}${key === todayKey() ? " · today" : ""}</p>
     <div class="habits" id="m-habits">
       ${HABITS.map((h) =>
        `<button class="habit ${state[h.key] ? "is-done" : ""}" data-key="${h.key}" type="button" aria-pressed="${state[h.key]}">
           <span class="habit-ic">${h.icon}</span>
           <span class="habit-title">${h.label}</span>
           <span class="habit-state">${state[h.key] ? "Done ✓" : "Tap to mark"}</span>
           <span class="habit-check" aria-hidden="true">✓</span>
         </button>`).join("")}
     </div>
     <label class="field"><span class="field-label">Notes</span>
       <textarea id="m-notes" rows="3" placeholder="Notes for this day…">${escapeHtml(state.notes)}</textarea></label>
     <button class="btn btn-primary btn-block" id="m-save" type="button"><span class="btn-text">Save day</span></button>`;
  wrap.querySelectorAll(".habit").forEach((card) => {
    card.addEventListener("click", () => {
      const k = card.dataset.key; state[k] = !state[k];
      card.classList.toggle("is-done", state[k]);
      card.setAttribute("aria-pressed", state[k]);
      card.querySelector(".habit-state").textContent = state[k] ? "Done ✓" : "Tap to mark";
    });
  });
  wrap.querySelector("#m-save").addEventListener("click", () => {
    state.notes = wrap.querySelector("#m-notes").value.trim();
    upsertRecord(currentUser.id, key, { ...state });
    if (key === todayKey()) loadDraft();   // keep the Today card in sync
    closeModal(); renderAll(); showToast("Day updated.");
  });
  openModal("Edit day", wrap);
}

function openNameEditor() {
  const wrap = document.createElement("div"); wrap.className = "modal-body";
  wrap.innerHTML =
    `<label class="field"><span class="field-label">Display name</span>
       <input type="text" id="m-name" value="${escapeHtml(currentUser.name)}" /></label>
     <button class="btn btn-primary btn-block" id="m-name-save" type="button"><span class="btn-text">Save name</span></button>`;
  wrap.querySelector("#m-name-save").addEventListener("click", () => {
    const v = wrap.querySelector("#m-name").value.trim();
    if (!v) { showToast("Name can't be empty.", true); return; }
    currentUser.name = v; saveDb(); closeModal(); renderAll(); showToast("Name updated.");
  });
  openModal("Edit name", wrap);
}

function openChangePassword(forced) {
  if (!isAdminUser(currentUser)) return;
  const wrap = document.createElement("div"); wrap.className = "modal-body";
  wrap.innerHTML =
    `${forced ? `<p class="muted">You're using the default admin password. Please set your own to secure the account.</p>` : ""}
     <label class="field"><span class="field-label">Current password</span>
       <input type="password" id="cp-current" autocomplete="current-password" /></label>
     <label class="field"><span class="field-label">New password</span>
       <input type="password" id="cp-new" autocomplete="new-password" /></label>
     <label class="field"><span class="field-label">Confirm new password</span>
       <input type="password" id="cp-confirm" autocomplete="new-password" /></label>
     <button class="btn btn-primary btn-block" id="cp-save" type="button"><span class="btn-text">Update password</span></button>
     <p id="cp-error" class="form-error" hidden></p>`;
  const err = wrap.querySelector("#cp-error");
  wrap.querySelector("#cp-save").addEventListener("click", () => {
    const cur = wrap.querySelector("#cp-current").value;
    const nw = wrap.querySelector("#cp-new").value;
    const cf = wrap.querySelector("#cp-confirm").value;
    err.hidden = true;
    if (!verifyPassword(cur, currentUser.salt, currentUser.passwordHash)) { err.textContent = "Current password is incorrect."; err.hidden = false; return; }
    if (nw.length < 6) { err.textContent = "New password must be at least 6 characters."; err.hidden = false; return; }
    if (nw !== cf) { err.textContent = "New passwords don't match."; err.hidden = false; return; }
    currentUser.salt = randomSalt();
    currentUser.passwordHash = hashPassword(nw, currentUser.salt);
    delete currentUser.mustChangePw;
    saveDb();
    closeModal();
    showToast("Admin password updated. 🔑");
  });
  openModal("Change admin password", wrap);
}

function openAvatarEditor() {
  let pending = null;                                        // processed data-URL, not yet saved
  const wrap = document.createElement("div"); wrap.className = "modal-body";
  wrap.innerHTML =
    `<div class="ae-preview"><span class="avatar avatar-xl" id="ae-avatar"></span></div>
     <input type="file" id="ae-file" accept="image/png,image/jpeg,image/jpg,image/webp" hidden />
     <div class="ae-progress" id="ae-progress" hidden><div class="ae-progress-fill" id="ae-fill"></div></div>
     <p class="muted ae-hint">JPG, PNG or WebP · cropped to a square &amp; optimised automatically.</p>
     <button class="btn btn-ghost btn-block" id="ae-choose" type="button">${currentUser.avatar ? "Choose a new image" : "Choose image"}</button>
     <button class="btn btn-primary btn-block" id="ae-save" type="button" disabled><span class="btn-text">Save photo</span></button>
     ${currentUser.avatar ? `<button class="btn btn-danger-ghost btn-block" id="ae-remove" type="button">Remove photo</button>` : ""}`;

  const preview = wrap.querySelector("#ae-avatar");
  applyAvatar(preview, currentUser);

  const file = wrap.querySelector("#ae-file");
  const prog = wrap.querySelector("#ae-progress"), fill = wrap.querySelector("#ae-fill");
  const saveBtn = wrap.querySelector("#ae-save");

  wrap.querySelector("#ae-choose").addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0]; if (!f) return;
    prog.hidden = false; fill.style.width = "0%"; saveBtn.disabled = true;
    try {
      const url = await processImageFile(f, (p) => { fill.style.width = p + "%"; });
      pending = url;
      preview.setAttribute("style", "");                     // show the cropped preview
      preview.innerHTML = `<img class="avatar-img" src="${url}" alt="">`;
      saveBtn.disabled = false;
      setTimeout(() => { prog.hidden = true; }, 450);
    } catch (err) {
      prog.hidden = true;
      showToast(err.message || "Could not process that image.", true);
    } finally {
      file.value = "";                                       // allow re-picking the same file
    }
  });

  saveBtn.addEventListener("click", () => {
    if (!pending) return;
    const prev = currentUser.avatar;
    currentUser.avatar = pending;
    if (!trySaveDb()) { currentUser.avatar = prev; return; } // revert on quota failure
    closeModal(); renderAll(); showToast("Profile picture updated. 📷");
  });

  const removeBtn = wrap.querySelector("#ae-remove");
  if (removeBtn) removeBtn.addEventListener("click", () => {
    delete currentUser.avatar; saveDb();
    closeModal(); renderAll(); showToast("Reverted to your initials avatar.");
  });

  openModal("Profile picture", wrap);
}

function confirmDialog(title, message, onYes, danger) {
  const wrap = document.createElement("div"); wrap.className = "modal-body";
  wrap.innerHTML =
    `<p class="muted">${escapeHtml(message)}</p>
     <button class="btn ${danger ? "btn-danger-ghost" : "btn-primary"} btn-block" id="m-yes" type="button"><span class="btn-text">Yes, continue</span></button>
     <button class="btn btn-ghost btn-block" id="m-no" type="button">Cancel</button>`;
  wrap.querySelector("#m-yes").addEventListener("click", () => { closeModal(); onYes(); });
  wrap.querySelector("#m-no").addEventListener("click", closeModal);
  openModal(title, wrap);
}

/* ---------------------------------------------------------
   10. THEME + REMINDER + CONFETTI
   --------------------------------------------------------- */
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  $("theme-toggle").querySelector(".ic-sun").hidden = theme === "dark";
  $("theme-toggle").querySelector(".ic-moon").hidden = theme !== "dark";
  $("theme-toggle").setAttribute("aria-pressed", theme === "dark");
  const ds = $("dark-switch"); if (ds) ds.checked = theme === "dark";
}
function toggleTheme() {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next); applyTheme(next);
}
/* ---- Real daily reminder: persisted, time-based, uses Notifications ---- */
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } }
function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
const notifsGranted = () => "Notification" in window && Notification.permission === "granted";

function applyReminderUI() {
  $("reminder-switch").checked = !!prefs.reminderOn;
  $("reminder-time").value = prefs.reminderTime || "19:00";
  $("reminder-time-row").hidden = !prefs.reminderOn;
}

async function enableReminder() {
  prefs.reminderOn = true;
  if (!prefs.reminderTime) prefs.reminderTime = "19:00";
  savePrefs();
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
  applyReminderUI();
  startReminderLoop();
  showToast(notifsGranted() ? "Daily reminder on." : "Reminder on (allow notifications for alerts).");
}
function disableReminder() {
  prefs.reminderOn = false; savePrefs();
  applyReminderUI(); stopReminderLoop();
  showToast("Daily reminder off.");
}

function startReminderLoop() {
  stopReminderLoop();
  reminderTimer = setInterval(checkReminder, 30000);
  checkReminder();
}
function stopReminderLoop() { if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; } }

// Fire once per day, only if it's past the chosen time and today isn't complete.
function checkReminder() {
  if (!currentUser || !prefs.reminderOn) return;
  const today = todayKey();
  const rec = recordOn(currentUser.id, today);
  if (doneCount(rec) >= 3 || prefs.lastRemind === today) return;
  const [h, m] = (prefs.reminderTime || "19:00").split(":").map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;

  prefs.lastRemind = today; savePrefs();
  const left = 3 - doneCount(rec);
  const body = `${left} ${left === 1 ? "activity" : "activities"} left for today's check-in 🙏`;
  if (notifsGranted()) { try { new Notification("Raht Elementa Streaks", { body }); } catch { showToast(body); } }
  else showToast("🙏 " + body);
}

/* ---- Profile switcher: pick another saved profile, or add a new one ---- */
function openProfileSwitcher() {
  const wrap = document.createElement("div"); wrap.className = "modal-body";
  wrap.innerHTML =
    `<p class="muted">Profiles saved on this device. Tap to switch.</p>
     <div class="switch-list" id="switch-list"></div>
     <button class="btn btn-primary btn-block" id="switch-add" type="button">＋ Add a new profile</button>`;
  // Members only — admin accounts require the secure password login, never a tap-switch.
  const users = db.users.filter((u) => u.role !== "admin" || u.id === currentUser.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  wrap.querySelector("#switch-list").innerHTML = users.map((u) => {
    const me = u.id === currentUser.id, st = userStats(recordsFor(u.id));
    return `<button class="switch-item${me ? " is-me" : ""}" data-id="${u.id}" type="button">
      <span class="avatar avatar-sm" style="${avatarBgStyle(u)}">${avatarInner(u)}</span>
      <span class="si-body"><strong>${escapeHtml(u.name)}${me ? " (current)" : ""}</strong><small>${st.active}🔥 · ${st.activeDays} active days</small></span>
      ${me ? '<span class="si-check">✓</span>' : ""}
    </button>`;
  }).join("");
  wrap.querySelector("#switch-list").addEventListener("click", (e) => {
    const b = e.target.closest(".switch-item"); if (!b) return;
    if (b.dataset.id === currentUser.id) { closeModal(); return; }
    const u = db.users.find((x) => x.id === b.dataset.id); if (!u) return;
    currentUser = u; saveSession(u.id, false); draft = null; selectedCalDay = null;
    closeModal();
    stopReminderLoop(); if (prefs.reminderOn) startReminderLoop();
    enterApp(); showToast(`Switched to ${u.name.split(" ")[0]}.`);
  });
  wrap.querySelector("#switch-add").addEventListener("click", () => { closeModal(); logout(); });
  openModal("Switch profile", wrap);
}

function fireConfetti(scale = 1) {
  const canvas = $("confetti"), ctx = canvas.getContext("2d");
  const W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight;
  const colors = ["#8B5CF6", "#FB7185", "#FDBA74", "#34D399", "#FBBF24"];
  const N = Math.round(140 * scale);
  const parts = Array.from({ length: N }, () => ({
    x: W / 2 + (pseudo(Math.random() + "x") - 0.5) * 60,
    y: H / 3,
    vx: (Math.random() - 0.5) * 10,
    vy: Math.random() * -12 - 4,
    g: 0.32 + Math.random() * 0.1,
    r: 4 + Math.random() * 5,
    rot: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frame = 0;
  (function loop() {
    ctx.clearRect(0, 0, W, H);
    parts.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore();
    });
    if (++frame < 130) requestAnimationFrame(loop);
    else ctx.clearRect(0, 0, W, H);
  })();
}

/* ---------------------------------------------------------
   11. NAVIGATION
   --------------------------------------------------------- */
function switchTab(tab) {
  $$(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  $$(".panel-screen").forEach((p) => p.classList.toggle("is-active", p.id === `panel-${tab}`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Brand tap → jump to Today (admin is identity-based now, no secret unlock). */
function handleLogoTap() { switchTab("today"); }

/* ---------------------------------------------------------
   12. EVENT WIRING
   --------------------------------------------------------- */
function wire() {
  $("login-form").addEventListener("submit", handleLogin);
  $("admin-form").addEventListener("submit", handleAdminLogin);
  $("show-admin-login").addEventListener("click", showAdminLogin);
  $("show-member-login").addEventListener("click", showMemberLogin);
  $("theme-toggle").addEventListener("click", toggleTheme);
  $("brand").addEventListener("click", handleLogoTap);

  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $$(".habit", $("today-habits")).forEach((c) => c.addEventListener("click", () => toggleHabit(c.dataset.key)));
  $("save-btn").addEventListener("click", saveToday);

  $("cal-prev").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
  $("cal-next").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });
  $("cal-grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-cell.tappable");
    if (cell) selectCalDay(cell.dataset.date);          // select day → board shows the group's notes
  });
  $("cal-edit-mine").addEventListener("click", () => openDayEditor(selectedCalDay || todayKey()));

  $$(".seg-btn", $("rank-toggle")).forEach((b) => b.addEventListener("click", () => {
    rankMode = b.dataset.mode;
    $$(".seg-btn", $("rank-toggle")).forEach((x) => x.classList.toggle("is-active", x === b));
    renderRanks();
  }));

  $("edit-name-btn").addEventListener("click", openNameEditor);
  $("edit-photo-btn").addEventListener("click", openAvatarEditor);
  $("profile-avatar").addEventListener("click", openAvatarEditor);
  $("header-avatar-btn").addEventListener("click", () => switchTab("more"));
  $("go-journal").addEventListener("click", () => switchTab("journal"));
  $("go-achievements").addEventListener("click", () => switchTab("insights"));

  $("journal-search").addEventListener("input", renderJournal);
  $("journal-list").addEventListener("click", (e) => {
    const entry = e.target.closest(".journal-entry");
    if (entry) openDayEditor(entry.dataset.date);
  });
  $("dark-switch").addEventListener("change", (e) => { const t = e.target.checked ? "dark" : "light"; localStorage.setItem(THEME_KEY, t); applyTheme(t); });
  $("reminder-switch").addEventListener("change", (e) => { e.target.checked ? enableReminder() : disableReminder(); });
  $("reminder-time").addEventListener("change", (e) => {
    prefs.reminderTime = e.target.value || "19:00"; prefs.lastRemind = null; savePrefs();
    showToast("Reminder time set to " + prefs.reminderTime + ".");
  });

  $("admin-search").addEventListener("input", renderAdmin);
  $("admin-date").addEventListener("input", renderAdmin);
  $("admin-export").addEventListener("click", exportCsv);
  $("admin-change-pw").addEventListener("click", () => openChangePassword(false));

  $("switch-btn").addEventListener("click", openProfileSwitcher);
  $("logout-btn").addEventListener("click", logout);
  $("reset-btn").addEventListener("click", () => confirmDialog(
    "Reset all data?",
    "This permanently erases every profile and record stored on this device, then reloads the app with fresh sample data.",
    () => { localStorage.removeItem(DB_KEY); clearSession(); location.reload(); }, true));

  $("modal-close").addEventListener("click", closeModal);
  $$("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
}

/* ---------------------------------------------------------
   13. BOOTSTRAP
   --------------------------------------------------------- */
function bootstrap() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  prefs = loadPrefs();
  loadDb();
  wire();
  applyReminderUI();

  const s = readSession();
  const user = s ? db.users.find((u) => u.id === s.id) : null;
  if (user) {
    // An admin account may only be restored if the session came from the secure
    // admin login; otherwise force re-authentication.
    if (user.role === "admin" && !s.admin) { clearSession(); }
    else { currentUser = user; enterApp(); }
  }
}
document.addEventListener("DOMContentLoaded", bootstrap);
