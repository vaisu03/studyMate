/* Smart Study Planner Pro - script.js
   Features:
   - Task CRUD, priorities, repeating tasks
   - List view + drag/drop
   - Weekly calendar view
   - Pomodoro timer (associate session to task)
   - Analytics (Chart.js) for last 7 days
   - Notifications, import/export, quotes
*/

(() => {
  // --------- state & storage helpers ----------
  const STORE_KEY = "ssp_tasks_v1";
  const SESSIONS_KEY = "ssp_sessions_v1"; // pomodoro minutes per day
  const THEME_KEY = "ssp_theme_v1";

  let tasks = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  let sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; // { date: 'YYYY-MM-DD', minutes: 25 }
  let editingId = null;
  let currentView = "list"; // 'list' or 'calendar'
  let analyticsChart = null;

  // DOM
  const el = sel => document.querySelector(sel);
  const els = sel => Array.from(document.querySelectorAll(sel));

  // init at DOM load
  document.addEventListener("DOMContentLoaded", init);

  // ------------- init -------------
  function init() {
    // bind
    bindButtons();
    loadTheme();
    renderAll();
    populatePomTaskSelect();
    populateFilterCategories();
    showQuote();

    // request notification permission
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    // periodic check: due tasks today -> notify once per load
    notifyTodaysTasks();

    // init analytics chart
    initChart();
  }

  // ----------- bindings -------------
  function bindButtons() {
    el("#addBtn").addEventListener("click", onAdd);
    el("#updateBtn").addEventListener("click", onSaveEdit);
    el("#cancelEdit").addEventListener("click", cancelEdit);
    el("#searchBox").addEventListener("input", onFilterChange);
    el("#filterCategory").addEventListener("change", onFilterChange);
    el("#sortSelect").addEventListener("change", () => { sortTasks(); renderAll(); });
    el("#viewToggle").addEventListener("click", toggleView);
    el("#exportBtn").addEventListener("click", exportTasks);
    el("#importFile").addEventListener("change", importTasks);
    el("#clearAllBtn").addEventListener("click", clearAll);
    el("#notifyTest").addEventListener("click", () => {
      if (Notification.permission === "granted") new Notification("Test", { body: "This is a test notification."});
      else alert("Notifications not granted.");
    });

    // quotes
    el("#newQuote").addEventListener("click", showQuote);

    // pomodoro
    el("#pomStart").addEventListener("click", pomStart);
    el("#pomPause").addEventListener("click", pomPause);
    el("#pomReset").addEventListener("click", pomReset);

    // theme toggle
    el("#toggleTheme").addEventListener("click", toggleTheme);
  }

  // -------------- task CRUD ----------------
  function onAdd() {
    const name = el("#taskName").value.trim();
    const category = el("#taskCategory").value.trim() || "General";
    const date = el("#taskDate").value;
    const priority = el("#taskPriority").value;
    const repeat = el("#taskRepeat").value;

    if (!name || !date) return alert("Please provide task title and date.");

    const task = {
      id: Date.now().toString(),
      name, category, date,
      priority, repeat,
      completed: false,
      createdAt: new Date().toISOString()
    };
    tasks.push(task);
    saveTasks();
    clearForm();
    renderAll();
    populatePomTaskSelect();
    populateFilterCategories();
  }

  function onSaveEdit() {
    if (!editingId) return;
    const t = tasks.find(x => x.id === editingId);
    if (!t) return;
    t.name = el("#taskName").value.trim();
    t.category = el("#taskCategory").value.trim() || "General";
    t.date = el("#taskDate").value;
    t.priority = el("#taskPriority").value;
    t.repeat = el("#taskRepeat").value;
    saveTasks();
    editingId = null;
    el("#updateBtn").classList.add("hidden");
    el("#cancelEdit").classList.add("hidden");
    el("#addBtn").classList.remove("hidden");
    clearForm();
    renderAll();
    populatePomTaskSelect();
    populateFilterCategories();
  }

  function editTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    el("#taskName").value = t.name;
    el("#taskCategory").value = t.category;
    el("#taskDate").value = t.date;
    el("#taskPriority").value = t.priority;
    el("#taskRepeat").value = t.repeat;
    el("#updateBtn").classList.remove("hidden");
    el("#cancelEdit").classList.remove("hidden");
    el("#addBtn").classList.add("hidden");
  }

  function cancelEdit() {
    editingId = null;
    el("#updateBtn").classList.add("hidden");
    el("#cancelEdit").classList.add("hidden");
    el("#addBtn").classList.remove("hidden");
    clearForm();
  }

  function clearForm() {
    el("#taskName").value = "";
    el("#taskCategory").value = "";
    el("#taskDate").value = "";
    el("#taskPriority").value = "Low";
    el("#taskRepeat").value = "none";
  }

  function deleteTask(id) {
    if (!confirm("Delete this task?")) return;
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderAll();
    populatePomTaskSelect();
    populateFilterCategories();
  }

  function toggleComplete(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.completed = !t.completed;

    // if task completed and repeats -> schedule next
    if (t.completed && t.repeat && t.repeat !== "none") {
      const nextDate = computeNextDate(t.date, t.repeat);
      // create a new task instance for next occurrence (keeps same name/category/priority)
      const newTask = {
        id: Date.now().toString(),
        name: t.name,
        category: t.category,
        date: nextDate,
        priority: t.priority,
        repeat: t.repeat,
        completed: false,
        createdAt: new Date().toISOString()
      };
      tasks.push(newTask);
    }
    saveTasks();
    renderAll();
  }

  function computeNextDate(isoDate, repeat) {
    // isoDate is YYYY-MM-DD
    const d = new Date(isoDate + "T00:00:00");
    if (repeat === "daily") d.setDate(d.getDate() + 1);
    if (repeat === "weekly") d.setDate(d.getDate() + 7);
    if (repeat === "monthly") {
      const mm = d.getMonth();
      d.setMonth(mm + 1);
      // handle month overflow automatically
    }
    // format YYYY-MM-DD
    const y = d.getFullYear(), m = (d.getMonth() + 1).toString().padStart(2, "0"), day = d.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function saveTasks() {
    localStorage.setItem(STORE_KEY, JSON.stringify(tasks));
  }

  // ------------- render --------------
  function renderAll() {
    renderList();
    renderCalendar();
    updateStats();
    updateProgressBar();
    populatePomTaskSelect();
    updateTodayMinutes();
    populateFilterCategories();
    updateChart();
  }

  function renderList() {
    const container = el("#taskList");
    container.innerHTML = "";
    const filter = el("#filterCategory").value;
    const search = el("#searchBox").value.trim().toLowerCase();

    let list = tasks.slice(); // copy
    // filter and search
    if (filter && filter !== "all") list = list.filter(t => t.category === filter);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));

    // sort
    const sortBy = el("#sortSelect").value;
    if (sortBy === "date") list.sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sortBy === "priority") {
      const order = { High: 1, Medium: 2, Low: 3 };
      list.sort((a, b) => (order[a.priority] || 9) - (order[b.priority] || 9));
    }
    if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));

    if (!list.length) {
      container.innerHTML = `<div class="muted small">No tasks found — add one on the left.</div>`;
      return;
    }

    list.forEach(task => {
      const card = document.createElement("div");
      card.className = `task-card ${task.priority.toLowerCase()} ${task.completed ? "completed":""}`;
      card.setAttribute("draggable", "true");
      card.dataset.id = task.id;

      card.innerHTML = `
        <div class="task-left">
          <div class="task-title">${escapeHtml(task.name)}</div>
          <div class="task-meta">${escapeHtml(task.category)} • ${task.date} • ${task.repeat === 'none' ? '' : task.repeat}</div>
        </div>
        <div class="actions">
          <button title="Edit" onclick="window.__ssp.edit('${task.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="primary" title="Done/Undo" onclick="window.__ssp.toggle('${task.id}')">${task.completed ? '↺' : '✅'}</button>
          <button title="Delete" onclick="window.__ssp.del('${task.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      // drag events
      card.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", task.id);
      });
      card.addEventListener("dragover", ev => ev.preventDefault());
      card.addEventListener("drop", ev => {
        ev.preventDefault();
        const draggedId = ev.dataTransfer.getData("text/plain");
        reorderTasks(draggedId, task.id);
      });

      container.appendChild(card);
    });
  }

  // helper used by inline buttons
  window.__ssp = {
    edit: (id) => editTask(id),
    del: (id) => deleteTask(id),
    toggle: (id) => toggleComplete(id)
  };

  function reorderTasks(draggedId, targetId) {
    const dragIndex = tasks.findIndex(t => t.id === draggedId);
    const targetIndex = tasks.findIndex(t => t.id === targetId);
    if (dragIndex === -1 || targetIndex === -1) return;
    const [moved] = tasks.splice(dragIndex, 1);
    tasks.splice(targetIndex, 0, moved);
    saveTasks();
    renderAll();
  }

  // ---------- calendar (week grid) ----------
  function renderCalendar() {
    const container = el("#weekGrid");
    container.innerHTML = "";

    // compute Monday start of current week
    const today = new Date();
    let monday = new Date(today);
    const dayOfWeek = monday.getDay(); // 0 Sun .. 6 Sat
    const shift = (dayOfWeek + 6) % 7; // number of days since Monday
    monday.setDate(monday.getDate() - shift);

    // create 7 columns
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = isoDate(d);
      const dayName = d.toLocaleDateString(undefined, { weekday: "short" });
      const dayNum = d.getDate();

      const col = document.createElement("div");
      col.className = "day-col";
      col.innerHTML = `<div class="day-header"><div>${dayName}</div><div>${dayNum}</div></div>`;

      // tasks for that day
      const dayTasks = tasks.filter(t => t.date === iso);
      dayTasks.sort((a,b) => (a.priority === b.priority) ? a.name.localeCompare(b.name) : priorityOrder(a.priority) - priorityOrder(b.priority));

      dayTasks.forEach(t => {
        const ev = document.createElement("div");
        ev.className = "event";
        ev.innerText = `${t.name} (${t.priority})`;
        ev.onclick = () => {
          // quick actions: toggle or edit
          if (confirm(`Mark "${t.name}" as done?`)) {
            toggleComplete(t.id);
          }
        };
        col.appendChild(ev);
      });

      container.appendChild(col);
    }
  }

  // ------------ pomodoro timer ------------
  let pom = {
    timerId: null,
    remaining: 25 * 60,
    mode: "work", // work | break
    running: false
  };

  function populatePomTaskSelect() {
    const select = el("#pomTaskSelect");
    select.innerHTML = `<option value="">(none)</option>`;
    tasks.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.text = `${t.name} — ${t.date}`;
      select.appendChild(opt);
    });
  }

  function pomStart() {
    if (pom.running) return;
    // set durations from UI
    const workMin = parseInt(el("#pomWork").value || "25", 10);
    const breakMin = parseInt(el("#pomBreak").value || "5", 10);
    if (isNaN(workMin) || isNaN(breakMin)) return alert("Enter pomodoro minutes.");

    if (pom.mode === "work" && pom.remaining === 0) pom.remaining = workMin * 60;
    if (pom.mode === "break" && pom.remaining === 0) pom.remaining = breakMin * 60;
    if (!pom.timerId) {
      pom.timerId = setInterval(pomTick, 1000);
      pom.running = true;
    }
  }

  function pomPause() {
    if (pom.timerId) {
      clearInterval(pom.timerId);
      pom.timerId = null;
      pom.running = false;
    }
  }

  function pomReset() {
    pomPause();
    pom.mode = "work";
    pom.remaining = parseInt(el("#pomWork").value || "25", 10) * 60;
    updatePomDisplay();
  }

  function pomTick() {
    if (pom.remaining > 0) {
      pom.remaining -= 1;
      updatePomDisplay();
    } else {
      // session ended
      pomPause();
      // record session minutes (depending on mode)
      const minutesDone = Math.max(1, Math.round((parseInt(el("#pomWork").value || "25", 10) * 60 - pom.remaining) / 60));
      recordSession(minutesDone);
      // notify
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(pom.mode === "work" ? "Pomodoro complete!" : "Break over!", { body: pom.mode === "work" ? "Time for a break." : "Back to work!" });
      } else {
        alert("Pomodoro finished");
      }
      // flip mode
      pom.mode = (pom.mode === "work") ? "break" : "work";
      // reset remaining for next mode
      pom.remaining = (pom.mode === "work" ? parseInt(el("#pomWork").value || "25",10) : parseInt(el("#pomBreak").value || "5",10)) * 60;
      updatePomDisplay();
      // auto-start next session? keep paused; user can start manually
    }
  }

  function updatePomDisplay() {
    const mm = Math.floor(pom.remaining / 60).toString().padStart(2, "0");
    const ss = (pom.remaining % 60).toString().padStart(2, "0");
    el("#pomTime").innerText = `${mm}:${ss}`;
    el("#pomMode").innerText = pom.mode === "work" ? "Work" : "Break";
  }

  function recordSession(minutes) {
    // if user associated to task, add minutes to that task as metadata
    const assoc = el("#pomTaskSelect").value;
    if (assoc) {
      const t = tasks.find(x => x.id === assoc);
      if (t) {
        t.studyMinutes = (t.studyMinutes || 0) + minutes;
      }
      saveTasks();
      renderAll();
    }
    // also record aggregate today minutes
    const today = isoDate(new Date());
    sessions.push({ date: today, minutes });
    // merge sessions by date
    const merged = {};
    sessions.forEach(s => { merged[s.date] = (merged[s.date] || 0) + s.minutes; });
    sessions = Object.keys(merged).map(d => ({ date: d, minutes: merged[d] }));
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    updateTodayMinutes();
    updateChart();
  }

  function updateTodayMinutes() {
    const today = isoDate(new Date());
    const rec = sessions.find(s => s.date === today);
    el("#todayMinutes").innerText = rec ? `${rec.minutes} min` : "0 min";
  }

  // -------------- analytics (Chart.js) --------------
  function initChart() {
    const ctx = el("#analyticsChart").getContext("2d");
    analyticsChart = new Chart(ctx, {
      type: "bar",
      data: { labels: [], datasets: [
        { label: "Completed tasks", data: [], backgroundColor: 'rgba(99,102,241,0.8)' },
        { label: "Study minutes", data: [], backgroundColor: 'rgba(34,197,94,0.8)' }
      ]},
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
    updateChart();
  }

  function updateChart() {
    if (!analyticsChart) return;
    // last 7 days labels
    const labels = [];
    const completedData = [];
    const minutesData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = isoDate(d);
      labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
      completedData.push(tasks.filter(t => t.completed && t.date === iso).length);
      const rec = sessions.find(s => s.date === iso);
      minutesData.push(rec ? rec.minutes : 0);
    }
    analyticsChart.data.labels = labels;
    analyticsChart.data.datasets[0].data = completedData;
    analyticsChart.data.datasets[1].data = minutesData;
    analyticsChart.update();
  }

  // -------------- misc UI & helpers --------------
  function updateStats() {
    el("#totalCount").innerText = tasks.length;
    el("#completedCount").innerText = tasks.filter(t => t.completed).length;
  }

  function updateProgressBar() {
    const total = tasks.length || 0;
    const completed = tasks.filter(t => t.completed).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    el("#progressBarFill").style.width = `${pct}%`;
  }

  function populateFilterCategories() {
    const sel = el("#filterCategory");
    const categories = Array.from(new Set(tasks.map(t => t.category))).sort();
    sel.innerHTML = `<option value="all">All categories</option>`;
    categories.forEach(c => sel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
  }

  function exportTasks() {
    const data = { tasks, sessions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ssp-export-${isoDate(new Date())}.json`;
    a.click();
  }

  function importTasks(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.tasks) tasks = parsed.tasks;
        if (parsed.sessions) sessions = parsed.sessions;
        saveTasks();
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        renderAll();
        alert("Import complete.");
      } catch (err) { alert("Invalid file."); }
    };
    r.readAsText(f);
  }

  function clearAll() {
    if (!confirm("Erase all tasks and sessions?")) return;
    tasks = [];
    sessions = [];
    saveTasks();
    localStorage.removeItem(SESSIONS_KEY);
    renderAll();
  }

  function onFilterChange() { renderAll(); }

  function sortTasks() {
    // called via change; sort happens in renderList
  }

  // helper to compute iso date string YYYY-MM-DD
  function isoDate(d) {
    const y = d.getFullYear();
    const m = (d.getMonth()+1).toString().padStart(2,"0");
    const dd = d.getDate().toString().padStart(2,"0");
    return `${y}-${m}-${dd}`;
  }

  function priorityOrder(p){ return p === "High" ? 1 : p === "Medium" ? 2 : 3; }

  // escape HTML for safety
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
  }

  // ----------------- view toggle ------------------
  function toggleView() {
    currentView = currentView === "list" ? "calendar" : "list";
    el("#listView").classList.toggle("hidden", currentView !== "list");
    el("#calendarView").classList.toggle("hidden", currentView !== "calendar");
  }

  function loadTheme() {
    const theme = localStorage.getItem(THEME_KEY) || "dark";
    if (theme === "light") {
      document.body.style.background = "linear-gradient(135deg,#f8fafc,#e6eefc)";
      document.body.style.color = "#0b1220";
    } else {
      // keep default dark gradient from CSS
    }
  }
  function toggleTheme() {
    // simple visual toggle: swap background
    const cur = localStorage.getItem(THEME_KEY) || "dark";
    const next = cur === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    loadTheme();
  }

  // --------------- quotes ----------------
  function showQuote() {
    const box = el("#quoteBox");
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    box.innerText = q;
  }

  // -------------- notifications once per load for today's tasks --------------
  function notifyTodaysTasks() {
    const today = isoDate(new Date());
    const todayTasks = tasks.filter(t => t.date === today && !t.completed);
    if (todayTasks.length && Notification && Notification.permission === "granted") {
      new Notification("You have tasks due today", { body: `${todayTasks.length} tasks are due today.` });
    }
  }

  // ------------- helpers -------------
  // expose for quick console debugging
  window.__sspState = () => ({ tasks, sessions });

})();
// Load tasks from localStorage
let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

// Add Task
function addTask() {
  const name = document.getElementById("taskName").value;
  const category = document.getElementById("taskCategory").value || "General";
  const priority = document.getElementById("taskPriority").value;
  const date = document.getElementById("taskDate").value;

  if (!name || !date) return alert("Please enter task name and date!");

  tasks.push({ name, category, priority, date, completed: false });
  localStorage.setItem("tasks", JSON.stringify(tasks));

  document.getElementById("taskName").value = "";
  document.getElementById("taskCategory").value = "";
  document.getElementById("taskDate").value = "";

  renderTasks();
  populateCategories();
}

// Render Tasks
function renderTasks(filterCategory = "all", filterPriority = "all", search = "") {
  const list = document.getElementById("taskList");
  if (!list) return; // only on tasks.html
  list.innerHTML = "";

  let filtered = tasks.filter(t =>
    (filterCategory === "all" || t.category === filterCategory) &&
    (filterPriority === "all" || t.priority === filterPriority) &&
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  filtered.forEach((task, i) => {
    let taskElement = document.createElement("div");
    taskElement.className = `task ${task.priority}`;
    taskElement.draggable = true;

    taskElement.innerHTML = `
      <span class="${task.completed ? "completed" : ""}">
        ${task.name} (${task.category}) - ${task.priority} - ${task.date}
      </span>
      <div class="actions">
        <button class="done" onclick="toggleTask(${i})">${task.completed ? "Undo" : "Done"}</button>
        <button class="delete" onclick="deleteTask(${i})">❌</button>
      </div>
    `;

    // Drag events
    taskElement.addEventListener("dragstart", e => {
      e.dataTransfer.setData("index", i);
    });
    taskElement.addEventListener("dragover", e => e.preventDefault());
    taskElement.addEventListener("drop", e => {
      let draggedIndex = e.dataTransfer.getData("index");
      let temp = tasks[draggedIndex];
      tasks[draggedIndex] = tasks[i];
      tasks[i] = temp;
      localStorage.setItem("tasks", JSON.stringify(tasks));
      renderTasks(filterCategory, filterPriority, search);
    });

    list.appendChild(taskElement);
  });
}

// Toggle Completion
function toggleTask(i) {
  tasks[i].completed = !tasks[i].completed;
  localStorage.setItem("tasks", JSON.stringify(tasks));
  renderTasks();
}

// Delete Task
function deleteTask(i) {
  tasks.splice(i, 1);
  localStorage.setItem("tasks", JSON.stringify(tasks));
  renderTasks();
  populateCategories();
}

// Filters
function searchTasks() {
  let search = document.getElementById("searchBox").value;
  let cat = document.getElementById("filterCategory").value;
  let pri = document.getElementById("filterPriority").value;
  renderTasks(cat, pri, search);
}

function filterTasks() {
  let search = document.getElementById("searchBox").value;
  let cat = document.getElementById("filterCategory").value;
  let pri = document.getElementById("filterPriority").value;
  renderTasks(cat, pri, search);
}

// Populate Categories in dropdown
function populateCategories() {
  let categories = [...new Set(tasks.map(t => t.category))];
  let filter = document.getElementById("filterCategory");
  if (!filter) return;
  filter.innerHTML = `<option value="all">All Categories</option>`;
  categories.forEach(c => {
    filter.innerHTML += `<option value="${c}">${c}</option>`;
  });
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  renderTasks();
  populateCategories();
});
/* ===== Schedule Page Functions ===== */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("calendar")) {
    generateCalendar();
  }
});

function generateCalendar() {
  const calendar = document.getElementById("calendar");
  calendar.innerHTML = "";

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // Get first day & total days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Fill empty slots
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    calendar.appendChild(empty);
  }

  // Fill days
  for (let day = 1; day <= daysInMonth; day++) {
    const div = document.createElement("div");
    div.classList.add("day");

    if (day === today.getDate()) {
      div.classList.add("today");
    }

    div.innerHTML = `<h4>${day}</h4>`;

    // Load tasks from storage
    const key = `${year}-${month + 1}-${day}`;
    const tasks = JSON.parse(localStorage.getItem("schedule")) || {};
    if (tasks[key]) {
      tasks[key].forEach(t => {
        const taskDiv = document.createElement("div");
        taskDiv.classList.add("task");
        taskDiv.textContent = t;
        div.appendChild(taskDiv);
      });
    }

    calendar.appendChild(div);
  }
}

function addSchedule() {
  const date = document.getElementById("scheduleDate").value;
  const task = document.getElementById("scheduleTask").value;

  if (!date || !task) {
    alert("Please select a date and enter a topic!");
    return;
  }

  const tasks = JSON.parse(localStorage.getItem("schedule")) || {};
  if (!tasks[date]) tasks[date] = [];
  tasks[date].push(task);

  localStorage.setItem("schedule", JSON.stringify(tasks));

  document.getElementById("scheduleTask").value = "";
  generateCalendar();
}

/* ===== Progress Page Functions ===== */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("completionChart")) {
    loadCharts();
  }
});

function loadCharts() {
  const tasks = JSON.parse(localStorage.getItem("tasks")) || [];

  const completed = tasks.filter(t => t.completed).length;
  const pending = tasks.length - completed;

  // ===== Task Completion Pie Chart =====
  new Chart(document.getElementById("completionChart"), {
    type: "doughnut",
    data: {
      labels: ["Completed", "Pending"],
      datasets: [{
        data: [completed, pending],
        backgroundColor: ["#4CAF50", "#FF5252"]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });

  // ===== Tasks by Subject Bar Chart =====
  const subjects = {};
  tasks.forEach(t => {
    if (!subjects[t.subject]) subjects[t.subject] = 0;
    subjects[t.subject]++;
  });

  new Chart(document.getElementById("subjectChart"), {
    type: "bar",
    data: {
      labels: Object.keys(subjects),
      datasets: [{
        label: "Tasks",
        data: Object.values(subjects),
        backgroundColor: "#2196F3"
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

/* ===== Weekly Study Hours ===== */
function addStudyHours() {
  const date = document.getElementById("studyDate").value;
  const hours = parseFloat(document.getElementById("studyHours").value);

  if (!date || isNaN(hours)) {
    alert("Please enter a valid date and study hours!");
    return;
  }

  const studyData = JSON.parse(localStorage.getItem("studyHours")) || {};
  studyData[date] = hours;
  localStorage.setItem("studyHours", JSON.stringify(studyData));

  document.getElementById("studyDate").value = "";
  document.getElementById("studyHours").value = "";

  loadCharts(); // Refresh charts
}

function loadCharts() {
  const tasks = JSON.parse(localStorage.getItem("tasks")) || [];
  const completed = tasks.filter(t => t.completed).length;
  const pending = tasks.length - completed;

  // ===== Task Completion Chart =====
  new Chart(document.getElementById("completionChart"), {
    type: "doughnut",
    data: {
      labels: ["Completed", "Pending"],
      datasets: [{
        data: [completed, pending],
        backgroundColor: ["#4CAF50", "#FF5252"]
      }]
    },
    options: { plugins: { legend: { position: "bottom" } } }
  });

  // ===== Tasks by Subject =====
  const subjects = {};
  tasks.forEach(t => {
    if (!subjects[t.subject]) subjects[t.subject] = 0;
    subjects[t.subject]++;
  });

  new Chart(document.getElementById("subjectChart"), {
    type: "bar",
    data: {
      labels: Object.keys(subjects),
      datasets: [{
        label: "Tasks",
        data: Object.values(subjects),
        backgroundColor: "#2196F3"
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });

  // ===== Weekly Study Hours =====
  const studyData = JSON.parse(localStorage.getItem("studyHours")) || {};
  const labels = Object.keys(studyData).sort();
  const hours = labels.map(d => studyData[d]);

  new Chart(document.getElementById("hoursChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Study Hours",
        data: hours,
        borderColor: "#FF9800",
        backgroundColor: "rgba(255,152,0,0.2)",
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, suggestedMax: 12 }
      }
    }
  });
}

/* ===== Auto Study Hours Tracking ===== */
let studyStart = null;

function startStudy() {
  if (studyStart) {
    alert("You are already in a study session!");
    return;
  }
  studyStart = new Date();
  document.getElementById("sessionStatus").textContent =
    "Studying... ⏳ Session started at " + studyStart.toLocaleTimeString();
}

function stopStudy() {
  if (!studyStart) {
    alert("No active study session!");
    return;
  }

  const studyEnd = new Date();
  const durationMs = studyEnd - studyStart;
  const durationHrs = (durationMs / 1000 / 60 / 60).toFixed(2); // convert to hours
  studyStart = null;

  // Save hours to localStorage
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const studyData = JSON.parse(localStorage.getItem("studyHours")) || {};
  studyData[today] = (studyData[today] || 0) + parseFloat(durationHrs);
  localStorage.setItem("studyHours", JSON.stringify(studyData));

  document.getElementById("sessionStatus").textContent =
    `Session ended. You studied ${durationHrs} hrs today.`;

  loadCharts(); // Refresh charts
}

