/* ============================================================
   RAHT ELEMENTA STREAKS — APPLICATION LOGIC
   Vanilla JS, talks directly to Supabase via supabase-js v2.
   ============================================================ */

/* ---------------------------------------------------------
   1. SUPABASE SETUP
   Replace these with your own project's values from
   Supabase Dashboard → Project Settings → API.
   --------------------------------------------------------- */
const SUPABASE_URL = "https://ahbuinydroqsccmmfsin.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoYnVpbnlkcm9xc2NjbW1mc2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDg4NTQsImV4cCI6MjA5NzYyNDg1NH0.K5zTW8woLPHKTf_cGjylQiHZLMAxw17wT6Y3pDcWQ0w";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------------------------------------
   2. STATE
   --------------------------------------------------------- */
const STORAGE_KEY = "raht_elementa_session";
const ADMIN_KEY = "raht_elementa_admin_unlocked";
const THEME_KEY = "raht_elementa_theme";

let currentMember = null;       // { id, name, phone_number }
let myRecords = [];             // all daily_tracking rows for the logged-in member
let todaysDraft = {              // local edits before saving
  bible_reading: false,
  prayer: false,
  scout_activity: false,
  notes: "",
  confirmed: false              // true once today's attendance has been confirmed (locked)
};
let calendarCursor = new Date(); // month currently shown on the calendar (day irrelevant)
let logoTapCount = 0;
let logoTapTimer = null;

/* ---------------------------------------------------------
   3. SMALL HELPERS
   --------------------------------------------------------- */

// Local (not UTC) date key, so "today" matches the user's own day.
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function isAllDone(rec) {
  return !!(rec && rec.bible_reading && rec.prayer && rec.scout_activity);
}

function isAnyDone(rec) {
  return !!(rec && (rec.bible_reading || rec.prayer || rec.scout_activity));
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => { toast.hidden = true; }, 220);
  }, 2600);
}

function setLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector(".btn-text");
  const spinner = btn.querySelector(".btn-spinner");
  btn.disabled = loading;
  if (spinner) spinner.hidden = !loading;
  if (text) text.style.opacity = loading ? 0.5 : 1;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ---------------------------------------------------------
   4. SESSION / LOGIN
   --------------------------------------------------------- */

function saveSession(member) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(member));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

async function findOrCreateMember(name, phone) {
  // 1. Look for an existing member with this phone number.
  const { data: existing, error: findErr } = await supabaseClient
    .from("members")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing;

  // 2. Not found — create a new member automatically.
  const { data: created, error: createErr } = await supabaseClient
    .from("members")
    .insert({ name, phone_number: phone })
    .select()
    .single();

  if (createErr) throw createErr;
  return created;
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("login-name").value.trim();
  const phone = document.getElementById("login-phone").value.trim();
  const errorEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");

  errorEl.hidden = true;

  if (!name || !phone) {
    errorEl.textContent = "Please enter both your name and phone number.";
    errorEl.hidden = false;
    return;
  }

  setLoading(btn, true);
  try {
    const member = await findOrCreateMember(name, phone);
    currentMember = member;
    saveSession(member);
    await enterApp();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Could not log you in. Please check your connection and try again.";
    errorEl.hidden = false;
  } finally {
    setLoading(btn, false);
  }
}

function handleLogout() {
  clearSession();
  currentMember = null;
  myRecords = [];
  document.getElementById("app").hidden = true;
  document.getElementById("login-page").hidden = false;
  document.getElementById("login-form").reset();
}

/* ---------------------------------------------------------
   5. APP ENTRY (after login or auto-login)
   --------------------------------------------------------- */

async function enterApp() {
  document.getElementById("login-page").hidden = true;
  document.getElementById("app").hidden = false;
  document.getElementById("member-name-display").textContent = currentMember.name;
  document.getElementById("today-date-label").textContent =
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  if (localStorage.getItem(ADMIN_KEY) === "true") {
    document.getElementById("admin-tab-btn").hidden = false;
  }

  await loadMyRecords();
  renderTodayCard();
  renderStats();
  renderCalendar();
  loadLeaderboard();
}

/* ---------------------------------------------------------
   6. DAILY TRACKING — LOAD / SAVE
   --------------------------------------------------------- */

async function loadMyRecords() {
  const { data, error } = await supabaseClient
    .from("daily_tracking")
    .select("*")
    .eq("member_id", currentMember.id)
    .order("date", { ascending: true });

  if (error) {
    console.error(error);
    showToast("Could not load your tracking history.", true);
    return;
  }
  myRecords = data || [];

  const todays = myRecords.find((r) => r.date === todayKey());
  todaysDraft = {
    bible_reading: !!todays?.bible_reading,
    prayer: !!todays?.prayer,
    scout_activity: !!todays?.scout_activity,
    notes: todays?.notes || "",
    confirmed: !!todays?.confirmed
  };
}

function renderTodayCard() {
  const locked = todaysDraft.confirmed;

  document.querySelectorAll(".checkin-card").forEach((card) => {
    const key = card.dataset.key;
    const done = !!todaysDraft[key];
    card.classList.toggle("is-done", done);
    card.classList.toggle("is-locked", locked);
    card.disabled = locked;
    card.querySelector(".checkin-state").textContent = done
      ? (locked ? "Confirmed ✓" : "Completed today ✓")
      : (locked ? "Not done — locked" : "Tap to mark done");
  });

  const notesEl = document.getElementById("today-notes");
  notesEl.value = todaysDraft.notes || "";
  notesEl.disabled = locked;

  const btn = document.getElementById("save-checkin-btn");
  const btnText = btn.querySelector(".btn-text");
  const feedback = document.getElementById("checkin-feedback");

  if (locked) {
    btn.disabled = true;
    btn.classList.add("is-locked");
    btnText.textContent = "Today's Attendance Confirmed 🔒";
    feedback.textContent = "Today is locked in. Come back tomorrow to check in again!";
    feedback.hidden = false;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-locked");
    btnText.textContent = "Confirm Today's Attendance";
    feedback.hidden = true;
  }
}

function toggleCheckin(key) {
  if (todaysDraft.confirmed) return; // locked — no edits allowed once confirmed
  todaysDraft[key] = !todaysDraft[key];
  renderTodayCard();
}

async function saveTodaysCheckin() {
  if (todaysDraft.confirmed) return; // already locked, nothing to do

  const btn = document.getElementById("save-checkin-btn");
  const feedback = document.getElementById("checkin-feedback");
  todaysDraft.notes = document.getElementById("today-notes").value.trim();

  setLoading(btn, true);
  feedback.hidden = true;
  try {
    const today = todayKey();
    const existing = myRecords.find((r) => r.date === today);

    const payload = {
      member_id: currentMember.id,
      date: today,
      bible_reading: todaysDraft.bible_reading,
      prayer: todaysDraft.prayer,
      scout_activity: todaysDraft.scout_activity,
      notes: todaysDraft.notes,
      confirmed: true // locking this day in — no further edits permitted after this
    };

    let savedRow;
    if (existing) {
      // Update existing record for today (only possible before it was confirmed).
      const { data, error } = await supabaseClient
        .from("daily_tracking")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      savedRow = data;
      Object.assign(existing, savedRow);
    } else {
      // Insert a brand new record for today.
      const { data, error } = await supabaseClient
        .from("daily_tracking")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      savedRow = data;
      myRecords.push(savedRow);
    }

    todaysDraft.confirmed = true;
    renderTodayCard();
    renderStats();
    renderCalendar();
    loadLeaderboard();
    showToast("Today's attendance confirmed and locked. 🔥");
  } catch (err) {
    console.error(err);
    showToast("Could not save your progress. Please try again.", true);
  } finally {
    setLoading(btn, false);
  }
}

/* ---------------------------------------------------------
   7. STREAK CALCULATIONS
   --------------------------------------------------------- */

// Build a Map of dateKey -> record for quick lookup.
function recordsByDate(records) {
  const map = new Map();
  records.forEach((r) => map.set(r.date, r));
  return map;
}

function calcCurrentStreak(records) {
  const map = recordsByDate(records);
  let cursor = new Date();
  let streak = 0;

  // If today isn't complete yet, the streak isn't broken until the day ends —
  // start counting from yesterday instead, but only if today has no partial/failed entry logic issue.
  const todayRec = map.get(dateKey(cursor));
  if (!isAllDone(todayRec)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const rec = map.get(dateKey(cursor));
    if (isAllDone(rec)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function calcLongestStreak(records) {
  if (!records.length) return 0;
  const map = recordsByDate(records);
  const allDates = records.map((r) => r.date).sort();
  let longest = 0;
  let running = 0;
  let cursor = new Date(allDates[0] + "T00:00:00");
  const last = new Date(allDates[allDates.length - 1] + "T00:00:00");

  while (cursor <= last) {
    const rec = map.get(dateKey(cursor));
    if (isAllDone(rec)) {
      running++;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return longest;
}

function calcPercentages(records) {
  const total = records.length;
  if (!total) return { bible: 0, prayer: 0, activity: 0 };
  const bible = records.filter((r) => r.bible_reading).length;
  const prayer = records.filter((r) => r.prayer).length;
  const activity = records.filter((r) => r.scout_activity).length;
  return {
    bible: Math.round((bible / total) * 100),
    prayer: Math.round((prayer / total) * 100),
    activity: Math.round((activity / total) * 100)
  };
}

function renderStats() {
  const current = calcCurrentStreak(myRecords);
  const longest = calcLongestStreak(myRecords);
  const pct = calcPercentages(myRecords);

  document.getElementById("current-streak-num").textContent = current;
  document.getElementById("stat-current-streak").textContent = current;
  document.getElementById("stat-longest-streak").textContent = longest;
  document.getElementById("stat-total-days").textContent = myRecords.length;
  document.getElementById("stat-bible-pct").textContent = pct.bible;
  document.getElementById("stat-prayer-pct").textContent = pct.prayer;
  document.getElementById("stat-activity-pct").textContent = pct.activity;
}

/* ---------------------------------------------------------
   8. CALENDAR
   --------------------------------------------------------- */

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const map = recordsByDate(myRecords);

  document.getElementById("calendar-month-label").textContent =
    calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayKey();

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell is-empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const key = dateKey(cellDate);
    const rec = map.get(key);
    const isFuture = key > todayStr;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.textContent = day;
    cell.dataset.date = key;

    if (isFuture) {
      cell.classList.add("is-future");
    } else if (isAllDone(rec)) {
      cell.classList.add("status-green");
    } else if (isAnyDone(rec)) {
      cell.classList.add("status-yellow");
    } else {
      cell.classList.add("status-red");
    }

    if (key === todayStr) cell.classList.add("is-today");

    if (!isFuture) {
      cell.addEventListener("click", () => openDayModal(key, rec));
    }

    grid.appendChild(cell);
  }
}

function openDayModal(key, rec) {
  const modal = document.getElementById("day-modal");
  const dateObj = new Date(key + "T00:00:00");
  document.getElementById("day-modal-date").textContent =
    dateObj.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  document.getElementById("day-detail-bible").textContent = rec?.bible_reading ? "✅ Done" : "❌ Not done";
  document.getElementById("day-detail-prayer").textContent = rec?.prayer ? "✅ Done" : "❌ Not done";
  document.getElementById("day-detail-activity").textContent = rec?.scout_activity ? "✅ Done" : "❌ Not done";
  document.getElementById("day-detail-notes").textContent = rec?.notes?.trim() ? rec.notes : "No notes for this day.";

  modal.hidden = false;
}

function closeDayModal() {
  document.getElementById("day-modal").hidden = true;
}

/* ---------------------------------------------------------
   9. LEADERBOARD
   --------------------------------------------------------- */

async function loadLeaderboard() {
  const tbody = document.getElementById("leaderboard-body");
  try {
    const [{ data: members, error: mErr }, { data: records, error: rErr }] = await Promise.all([
      supabaseClient.from("members").select("id, name"),
      supabaseClient.from("daily_tracking").select("member_id, date, bible_reading, prayer, scout_activity")
    ]);
    if (mErr) throw mErr;
    if (rErr) throw rErr;

    const grouped = new Map();
    (members || []).forEach((m) => grouped.set(m.id, { name: m.name, records: [] }));
    (records || []).forEach((r) => {
      if (grouped.has(r.member_id)) grouped.get(r.member_id).records.push(r);
    });

    const ranked = Array.from(grouped.entries())
      .map(([id, info]) => ({
        id,
        name: info.name,
        streak: calcCurrentStreak(info.records)
      }))
      .sort((a, b) => b.streak - a.streak);

    if (!ranked.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted-text">No members yet.</td></tr>`;
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    tbody.innerHTML = ranked
      .map((m, i) => {
        const isMe = currentMember && m.id === currentMember.id;
        const rankDisplay = i < 3 ? `<span class="rank-medal">${medals[i]}</span>` : `#${i + 1}`;
        return `<tr class="${isMe ? "lb-row-me" : ""}">
          <td>${rankDisplay}</td>
          <td>${escapeHtml(m.name)}${isMe ? " (you)" : ""}</td>
          <td>${m.streak} 🔥</td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="3" class="muted-text">Could not load the leaderboard.</td></tr>`;
  }
}

/* ---------------------------------------------------------
   10. ADMIN
   --------------------------------------------------------- */

let adminMembers = [];
let adminRecords = [];

function unlockAdmin() {
  localStorage.setItem(ADMIN_KEY, "true");
  document.getElementById("admin-tab-btn").hidden = false;
  showToast("Admin section unlocked.");
}

async function loadAdminData() {
  const memBody = document.getElementById("admin-members-body");
  const recBody = document.getElementById("admin-records-body");
  memBody.innerHTML = `<tr><td colspan="3" class="muted-text">Loading…</td></tr>`;
  recBody.innerHTML = `<tr><td colspan="6" class="muted-text">Loading…</td></tr>`;

  try {
    const [{ data: members, error: mErr }, { data: records, error: rErr }] = await Promise.all([
      supabaseClient.from("members").select("*").order("name", { ascending: true }),
      supabaseClient.from("daily_tracking").select("*").order("date", { ascending: false })
    ]);
    if (mErr) throw mErr;
    if (rErr) throw rErr;

    adminMembers = members || [];
    adminRecords = records || [];
    renderAdminTables();
  } catch (err) {
    console.error(err);
    showToast("Could not load admin data.", true);
  }
}

function renderAdminTables() {
  const search = document.getElementById("admin-search").value.trim().toLowerCase();
  const dateFilter = document.getElementById("admin-date-filter").value;

  const memberLookup = new Map(adminMembers.map((m) => [m.id, m]));

  const filteredMembers = adminMembers.filter((m) =>
    !search || m.name.toLowerCase().includes(search) || m.phone_number.includes(search)
  );

  const filteredRecords = adminRecords.filter((r) => {
    const member = memberLookup.get(r.member_id);
    const matchesSearch =
      !search ||
      (member && (member.name.toLowerCase().includes(search) || member.phone_number.includes(search)));
    const matchesDate = !dateFilter || r.date === dateFilter;
    return matchesSearch && matchesDate;
  });

  document.getElementById("admin-member-count").textContent = filteredMembers.length;
  document.getElementById("admin-record-count").textContent = filteredRecords.length;

  const memBody = document.getElementById("admin-members-body");
  memBody.innerHTML = filteredMembers.length
    ? filteredMembers
        .map(
          (m) => `<tr>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.phone_number)}</td>
            <td>${m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="muted-text">No members match.</td></tr>`;

  const recBody = document.getElementById("admin-records-body");
  recBody.innerHTML = filteredRecords.length
    ? filteredRecords
        .map((r) => {
          const member = memberLookup.get(r.member_id);
          return `<tr>
            <td>${r.date}</td>
            <td>${escapeHtml(member?.name || "Unknown")}</td>
            <td>${r.bible_reading ? "✅" : "—"}</td>
            <td>${r.prayer ? "✅" : "—"}</td>
            <td>${r.scout_activity ? "✅" : "—"}</td>
            <td>${escapeHtml(r.notes || "")}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="muted-text">No records match.</td></tr>`;
}

function exportRecordsAsCsv() {
  if (!adminRecords.length) {
    showToast("No records to export yet.", true);
    return;
  }
  const memberLookup = new Map(adminMembers.map((m) => [m.id, m]));
  const header = ["Date", "Member Name", "Phone Number", "Bible Reading", "Prayer", "Scout Activity", "Notes"];

  const rows = adminRecords.map((r) => {
    const member = memberLookup.get(r.member_id);
    return [
      r.date,
      member?.name || "Unknown",
      member?.phone_number || "",
      r.bible_reading ? "Yes" : "No",
      r.prayer ? "Yes" : "No",
      r.scout_activity ? "Yes" : "No",
      (r.notes || "").replace(/\n/g, " ")
    ];
  });

  const csvLines = [header, ...rows].map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  );
  const csvContent = csvLines.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `raht-elementa-records-${todayKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------
   11. TABS
   --------------------------------------------------------- */

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.tab === tabName)
  );
  document.querySelectorAll(".tab-panel").forEach((panel) =>
    panel.classList.toggle("is-active", panel.id === `tab-${tabName}`)
  );
  if (tabName === "admin") loadAdminData();
}

/* ---------------------------------------------------------
   12. DARK MODE
   --------------------------------------------------------- */

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.getElementById("dark-toggle").querySelector(".icon-sun").hidden = theme === "dark";
  document.getElementById("dark-toggle").querySelector(".icon-moon").hidden = theme !== "dark";
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark");
  const next = isDark ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

/* ---------------------------------------------------------
   13. SECRET ADMIN UNLOCK (tap the logo 5x within the app)
   --------------------------------------------------------- */

function handleLogoTap() {
  logoTapCount++;
  clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 2500);
  if (logoTapCount >= 5) {
    logoTapCount = 0;
    unlockAdmin();
  }
}

/* ---------------------------------------------------------
   14. EVENT WIRING & BOOTSTRAP
   --------------------------------------------------------- */

function wireEvents() {
  document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);
  document.getElementById("dark-toggle").addEventListener("click", toggleTheme);

  document.querySelectorAll(".tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => switchTab(btn.dataset.tab))
  );

  document.querySelectorAll(".checkin-card").forEach((card) =>
    card.addEventListener("click", () => toggleCheckin(card.dataset.key))
  );

  document.getElementById("save-checkin-btn").addEventListener("click", saveTodaysCheckin);

  document.getElementById("cal-prev").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById("day-modal-close").addEventListener("click", closeDayModal);
  document.getElementById("day-modal").addEventListener("click", (e) => {
    if (e.target.id === "day-modal") closeDayModal();
  });

  document.getElementById("export-csv-btn").addEventListener("click", exportRecordsAsCsv);
  document.getElementById("admin-search").addEventListener("input", renderAdminTables);
  document.getElementById("admin-date-filter").addEventListener("input", renderAdminTables);
  document.getElementById("admin-clear-filters").addEventListener("click", () => {
    document.getElementById("admin-search").value = "";
    document.getElementById("admin-date-filter").value = "";
    renderAdminTables();
  });

  document.getElementById("logo-tap-target").addEventListener("click", handleLogoTap);
  document.getElementById("app-logo-tap").addEventListener("click", handleLogoTap);
}

async function bootstrap() {
  wireEvents();
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  const session = loadSession();
  if (session) {
    currentMember = session;
    await enterApp();
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
