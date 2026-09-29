// ===================================================
// Мой Секретарь — Frontend Application Logic
// ===================================================

const urlParams = new URLSearchParams(window.location.search);
const initialKey = urlParams.get("key") || localStorage.getItem("secret_key") || "";
if (urlParams.get("key")) {
  localStorage.setItem("secret_key", initialKey);
}

const state = {
  activeTab: "feed",
  secretKey: initialKey,
  serverUrl: localStorage.getItem("server_url") || window.location.origin,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  recordInterval: null,
  recordStartTime: null,
};

// --- Service Worker Registration with Auto-Update ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js?v=3.5.6")
      .then((reg) => {
        reg.update();
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[PWA] New version installed! Reloading for latest features...");
                window.location.reload();
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn("ServiceWorker registration failed:", err);
      });
  });
}

// --- API Client Helper ---
async function apiFetch(endpoint, options = {}) {
  const url = `${state.serverUrl.replace(/\/$/, "")}${endpoint}`;
  const headers = { ...(options.headers || {}) };

  if (state.secretKey) {
    headers["X-Secret-Key"] = state.secretKey;
  }

  // Set Content-Type only if not FormData
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      updateStatus("auth_error");
      showToast("⚠️ Требуется Секретный Ключ в Настройках ⚙️");
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Ошибка сервера");
    }
    updateStatus("online");
    if (res.status === 204) return true;
    return await res.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    if (!navigator.onLine) {
      updateStatus("offline");
    }
    throw err;
  }
}

// --- Connection Status ---
function updateStatus(status) {
  const indicator = document.getElementById("connection-status");
  if (!indicator) return;

  if (status === "online") {
    indicator.textContent = "● В сети";
    indicator.style.color = "var(--success)";
  } else if (status === "auth_error") {
    indicator.textContent = "● Нужен ключ";
    indicator.style.color = "var(--warning)";
  } else {
    indicator.textContent = "● Не в сети";
    indicator.style.color = "var(--danger)";
  }
}

// Check initial health
async function checkHealth() {
  try {
    const data = await apiFetch("/health");
    if (data && data.status === "online") {
      updateStatus("online");
    }
  } catch {
    updateStatus("offline");
  }
}

// --- Theme Management ---
function initTheme() {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });

  // Listen for system changes if not manually set
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    }
  });
}

// --- Toast Notifications ---
let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById("result-toast");
  const msgEl = document.getElementById("toast-message");
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.remove("hidden");

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 4500);
}

// --- Audio & Voice Recording ---
function initVoice() {
  const micBtn = document.getElementById("mic-btn");
  const pulseRings = document.querySelectorAll(".mic-pulse-ring");
  const statusText = document.getElementById("voice-status-text");
  const timerEl = document.getElementById("recording-timer");

  micBtn.addEventListener("click", async () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];

      // Determine supported MIME type for Safari / iOS / Chrome
      let options = {};
      let mimeType = "audio/mp4";
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/mp4")) {
          options = { mimeType: "audio/mp4" };
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          options = { mimeType: "audio/webm;codecs=opus" };
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          options = { mimeType: "audio/webm" };
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/aac")) {
          options = { mimeType: "audio/aac" };
          mimeType = "audio/aac";
        }
      }

      try {
        state.mediaRecorder = new MediaRecorder(stream, options);
      } catch (recErr) {
        console.warn("MediaRecorder with options failed, fallback to stream default:", recErr);
        state.mediaRecorder = new MediaRecorder(stream);
        mimeType = state.mediaRecorder.mimeType || "audio/mp4";
      }

      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          state.audioChunks.push(e.data);
        }
      };

      state.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const actualMime = state.mediaRecorder.mimeType || mimeType;
        const audioBlob = new Blob(state.audioChunks, { type: actualMime });
        await uploadAudio(audioBlob, actualMime);
      };

      playAudioBeep();
      state.mediaRecorder.start();
      state.isRecording = true;

      micBtn.classList.add("recording");
      statusText.textContent = "Слушаю... Нажмите ещё раз для отправки";
      timerEl.classList.remove("hidden");

      state.recordStartTime = Date.now();
      state.recordInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.recordStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const secs = String(elapsed % 60).padStart(2, "0");
        timerEl.textContent = `${mins}:${secs}`;
      }, 500);
    } catch (err) {
      console.error("Microphone access or recorder error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        statusText.textContent = "Доступ к микрофону заблокирован";
        showToast("❌ Разрешите микрофон: кнопка «аА» в Safari → Настройки веб-сайта → Микрофон: Разрешить");
      } else if (!window.isSecureContext) {
        statusText.textContent = "Требуется защищенное соединение (HTTPS)";
        showToast("⚠️ Для работы микрофона открывайте сайт только по HTTPS ссылке из Cloudflare/Tailscale!");
      } else {
        statusText.textContent = `Ошибка микрофона: ${err.message || err.name}`;
        showToast(`❌ Ошибка: ${err.message || err.name}`);
      }
    }
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }
    state.isRecording = false;
    micBtn.classList.remove("recording");
    clearInterval(state.recordInterval);
    timerEl.classList.add("hidden");
    statusText.textContent = "Обрабатываю запись через Gemini AI...";
  }

  async function uploadAudio(blob, mimeType) {
    const formData = new FormData();
    const ext = mimeType.includes("mp4") ? "mp4" : (mimeType.includes("aac") ? "aac" : (mimeType.includes("wav") ? "wav" : "webm"));
    formData.append("audio", blob, `voice_record.${ext}`);

    try {
      const data = await apiFetch("/api/process/audio", {
        method: "POST",
        body: formData,
      });

      if (data) {
        statusText.textContent = "Нажмите и говорите или введите текст";
        const icon = data.status === "warning" ? "⚠️" : "✅";
        showToast(`${icon} ${data.summary}`);
        if (data.status !== "warning") {
          playSuccessChime();
          showUndoBanner(data.summary);
        }
        if (data.created?.movies?.length > 0) {
          window.switchToTab("movies");
          if (data.created.movies[0]?.movie_info) {
            renderMovieResult(data.created.movies[0].movie_info);
            document.getElementById("movie-result-card")?.classList.remove("hidden");
          }
        } else {
          reloadCurrentTab();
        }
      }
    } catch (err) {
      statusText.textContent = "Ошибка при отправке";
      showToast(`❌ Ошибка обработки: ${err.message}`);
    }
  }
}

// --- Quick Text Ingest ---
function initTextInput() {
  const form = document.getElementById("text-input-form");
  const input = document.getElementById("text-input");
  const statusText = document.getElementById("voice-status-text");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    statusText.textContent = "Обрабатываю запрос...";

    try {
      const data = await apiFetch("/api/process", {
        method: "POST",
        body: JSON.stringify({ text }),
      });

      if (data) {
        statusText.textContent = "Нажмите и говорите или введите текст";
        showToast(`✅ ${data.summary}`);
        playSuccessChime();
        showUndoBanner(data.summary);
        if (data.created?.movies?.length > 0) {
          window.switchToTab("movies");
          if (data.created.movies[0]?.movie_info) {
            renderMovieResult(data.created.movies[0].movie_info);
            document.getElementById("movie-result-card")?.classList.remove("hidden");
          }
        } else {
          reloadCurrentTab();
        }
      }
    } catch (err) {
      statusText.textContent = "Ошибка при отправке";
      showToast(`❌ Ошибка: ${err.message}`);
    }
  });
}

// --- Navigation Tabs ---
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");

  window.switchToTab = function(tabName) {
    const targetTabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (targetTabBtn) {
      targetTabBtn.click();
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      tab.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

      const target = tab.dataset.tab;
      state.activeTab = target;

      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.remove("active");
      });
      const activePanel = document.getElementById(`tab-${target}`);
      if (activePanel) activePanel.classList.add("active");

      loadTabData(target);
    });
  });

  document.getElementById("refresh-feed-btn")?.addEventListener("click", () => loadTabData("feed"));
}

function reloadCurrentTab() {
  loadTabData(state.activeTab);
}

function loadTabData(tab) {
  switch (tab) {
    case "feed":
      loadFeed();
      break;
    case "finance":
      loadFinance();
      break;
    case "shopping":
      loadShopping();
      break;
    case "tasks":
      loadTasks();
      break;
    case "media":
      loadMedia();
      break;
    case "movies":
      loadMoviesTab();
      break;
    case "inventory":
      loadInventory();
      break;
    case "auto":
      loadAuto();
      break;
    case "utilities":
      loadUtilities();
      break;
    case "fitness":
      loadFitness();
      break;
    case "vitals":
      loadVitals();
      break;
    case "hospitality":
      loadHospitality();
      break;
    case "agent":
      document.getElementById("agent-query-input")?.focus();
      break;
    case "translator":
      initTranslatorScreen();
      break;
  }
}

// --- Data Renderers ---

// 1. Feed
async function loadFeed() {
  const list = document.getElementById("feed-list");
  try {
    const items = await apiFetch("/api/feed");
    if (!items || items.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎙️</span>
          <p>Записей пока нет. Нажмите микрофон и скажите, что записать!</p>
        </div>`;
      return;
    }

    list.innerHTML = items
      .map((item) => {
        let badgeClass = `badge-${item.domain}`;
        if (item.domain === "finance" && item.is_positive) badgeClass += " positive";
        const dateStr = new Date(item.created_at).toLocaleString("ru-RU", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        return `
          <div class="item-card">
            <div class="item-content">
              <span class="item-title ${item.is_completed ? "completed" : ""}">${escapeHtml(item.title)}</span>
              <span class="item-subtitle">${escapeHtml(item.subtitle)} • ${dateStr}</span>
              <span class="item-badge ${badgeClass}">${escapeHtml(item.badge || item.domain)}</span>
            </div>
          </div>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Не удалось загрузить ленту</p></div>`;
  }
}

// 2. Finance
async function loadFinance() {
  const list = document.getElementById("finance-list");
  const todayEl = document.getElementById("stat-expense-today");
  const todayUsdEl = document.getElementById("stat-expense-today-usd");
  const monthEl = document.getElementById("stat-expense-month");
  const monthUsdEl = document.getElementById("stat-expense-month-usd");
  const rateBadge = document.getElementById("nbu-rate-badge");

  try {
    const [records, stats] = await Promise.all([
      apiFetch("/api/finance"),
      apiFetch("/api/finance/stats"),
    ]);

    if (stats) {
      todayEl.textContent = `${stats.total_expense_today_uah} ₴`;
      if (todayUsdEl) todayUsdEl.textContent = `~$${stats.total_expense_today_usd}`;
      monthEl.textContent = `${stats.total_expense_month_uah} ₴`;
      if (monthUsdEl) monthUsdEl.textContent = `~$${stats.total_expense_month_usd}`;
      if (rateBadge && stats.usd_rate) {
        rateBadge.textContent = `🇺🇦 1$ = ${stats.usd_rate} ₴`;
      }
    }

    if (!records || records.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Витрат і доходів поки немає</p></div>`;
      return;
    }

    list.innerHTML = records
      .map((r) => {
        const sign = r.type === "expense" ? "-" : "+";
        const colorClass = r.type === "expense" ? "expense" : "income";
        const dateStr = new Date(r.date).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });

        let amountDisplay = "";
        const curr = (r.currency || "UAH").toUpperCase();
        if (curr === "UAH") {
          amountDisplay = `${sign}${r.amount} ₴ <small style="font-size:0.8rem;opacity:0.75;font-weight:normal">(~$${r.amount_usd})</small>`;
        } else if (curr === "USD") {
          amountDisplay = `${sign}$${r.amount} <small style="font-size:0.8rem;opacity:0.75;font-weight:normal">(~${r.amount_uah} ₴)</small>`;
        } else {
          amountDisplay = `${sign}${r.amount} ${curr} <small style="font-size:0.8rem;opacity:0.75;font-weight:normal">(~${r.amount_uah} ₴)</small>`;
        }

        return `
          <div class="item-card">
            <div class="item-content">
              <span class="item-title"><strong class="stat-val ${colorClass}">${amountDisplay}</strong> ${escapeHtml(r.description || r.category)}</span>
              <span class="item-subtitle">${dateStr} • Категорія: ${escapeHtml(r.category)}</span>
              <span class="item-badge badge-finance ${r.type === "income" ? "positive" : ""}">${r.type === "expense" ? "Витрата" : "Дохід"}</span>
            </div>
            <div class="item-actions">
              <button class="delete-btn" onclick="deleteItem('finance', ${r.id})" title="Видалити">🗑️</button>
            </div>
          </div>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження фінансів</p></div>`;
  }
}

// 3. Shopping
async function loadShopping() {
  const list = document.getElementById("shopping-list");
  try {
    const items = await apiFetch("/api/shopping");
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Список покупок пуст</p></div>`;
      return;
    }

    list.innerHTML = items
      .map(
        (i) => `
        <div class="item-card">
          <button class="custom-checkbox ${i.is_purchased ? "checked" : ""}" onclick="toggleShopping(${i.id})">
            ✓
          </button>
          <div class="item-content">
            <span class="item-title ${i.is_purchased ? "completed" : ""}">${escapeHtml(i.item)}</span>
            ${i.quantity ? `<span class="item-subtitle">Кількість: ${escapeHtml(i.quantity)}</span>` : ""}
            <span class="item-badge badge-shopping">🛒 ${escapeHtml(i.category || "Покупка")}</span>
          </div>
          <div class="item-actions">
            <button class="delete-btn" onclick="deleteItem('shopping', ${i.id})" title="Удалить">🗑️</button>
          </div>
        </div>`
      )
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Ошибка загрузки покупок</p></div>`;
  }
}

// 4. Tasks
async function loadTasks() {
  const list = document.getElementById("tasks-list");
  try {
    const tasks = await apiFetch("/api/tasks");
    if (!tasks || tasks.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Немає активних робіт. Скажіть мікрофону: «Постелити плитку, помити авто...»</p></div>`;
      return;
    }

    list.innerHTML = tasks
      .map((t) => {
        let dueStr = "Без срока";
        if (t.due_date) {
          dueStr = new Date(t.due_date).toLocaleString("ru-RU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        const prioColor = t.priority === "high" ? "badge-finance" : (t.priority === "medium" ? "badge-tasks" : "badge-auto");
        const prioLabel = t.priority === "high" ? "🔥 Терміново" : (t.priority === "medium" ? "⚡ Середній" : "☕ Низький");

        return `
          <div class="item-card">
            <button class="custom-checkbox ${t.is_completed ? "checked" : ""}" onclick="toggleTask(${t.id})">
              ✓
            </button>
            <div class="item-content">
              <span class="item-title ${t.is_completed ? "completed" : ""}">${escapeHtml(t.title)}</span>
              <span class="item-subtitle">📅 ${dueStr} • ${escapeHtml(t.category)}</span>
              <span class="item-badge ${prioColor}">${prioLabel}</span>
            </div>
            <div class="item-actions">
              <button class="delete-btn" onclick="deleteItem('tasks', ${t.id})" title="Удалить">🗑️</button>
            </div>
          </div>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Ошибка загрузки задач</p></div>`;
  }
}

// 5. Media Notes / Склерозник
window.copySclerozText = function(text, ev) {
  if (ev) ev.stopPropagation();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("📋 Скопійовано в буфер!");
    }).catch(() => {
      showToast("Не вдалося скопіювати");
    });
  } else {
    showToast(`Текст: ${text}`);
  }
};

async function loadMedia() {
  const list = document.getElementById("media-list");
  try {
    // Склерозник shows only notes, books, podcasts, articles — not movies/series (those go to 🎬 tab)
    const all = await apiFetch("/api/media_notes");
    const notes = (all || []).filter(m => !["movie", "series"].includes(m.type));
    if (notes.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="empty-icon">🧠</span><p>Склерозник порожній.<br><span style="font-size:0.82rem;color:var(--text-muted);">Скажіть голосом: <em>«Склерозник: код домофона 45»</em> або <em>«Запиши пароль від Instagram»</em>.</span></p></div>`;
      return;
    }

    const typeIcons = {
      note: "🧠",
      book: "📚",
      podcast: "🎧",
      article: "📰",
    };

    list.innerHTML = notes.map((m) => `
        <div class="item-card">
          <div class="item-content">
            <span class="item-title ${m.status === "completed" ? "completed" : ""}">${escapeHtml(m.title)}</span>
            ${m.author_creator || m.comment ? `<span class="item-subtitle">${escapeHtml([m.author_creator, m.comment].filter(Boolean).join(" • "))}</span>` : ""}
            ${m.url ? `<a href="${escapeHtml(m.url)}" target="_blank" class="item-subtitle" style="color:var(--primary)">🔗 Посилання</a>` : ""}
            <span class="item-badge badge-media">${typeIcons[m.type] || "📝"} ${m.type === "note" ? "Замітка" : m.type}</span>
          </div>
          <div class="item-actions">
            <button class="action-btn-sm" style="padding:4px 8px;font-size:0.82rem;" onclick="copySclerozText('${escapeHtml(m.title).replace(/'/g, "\\'")}', event)" title="Копіювати">📋</button>
            <button class="custom-checkbox ${m.status === "completed" ? "checked" : ""}" onclick="toggleMedia(${m.id})">✓</button>
            <button class="delete-btn" onclick="deleteItem('media_notes', ${m.id})" title="Видалити">🗑️</button>
          </div>
        </div>`).join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження склерозника</p></div>`;
  }
}

// ─── 6. Movies / Фільми ──────────────────────────────────────────────────────
let _moviesWatchlistType = "all";

async function loadMoviesTab() {
  initMoviesSearch();
  loadMoviesWatchlist();
}

function initMoviesSearch() {
  const input = document.getElementById("movie-search-input");
  const btn = document.getElementById("movie-search-btn");
  const typeBtns = document.querySelectorAll(".movies-type-btn");

  if (btn && !btn._moviesInited) {
    btn._moviesInited = true;
    btn.addEventListener("click", () => searchMovie());
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchMovie();
    });
    typeBtns.forEach(b => {
      b.addEventListener("click", () => {
        typeBtns.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        _moviesWatchlistType = b.dataset.type;
        loadMoviesWatchlist();
      });
    });
  }
}

async function searchMovie() {
  const input = document.getElementById("movie-search-input");
  const title = input?.value?.trim();
  if (!title) return;

  const card = document.getElementById("movie-result-card");
  const inner = document.getElementById("movie-result-inner");
  card?.classList.remove("hidden");
  inner.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);">🔍 Шукаю «${escapeHtml(title)}»...</div>`;

  try {
    const res = await apiFetch("/api/movies/search", {
      method: "POST",
      body: JSON.stringify({ title })
    });

    if (!res?.data?.found) {
      inner.innerHTML = `<div class="empty-state"><span class="empty-icon">🎬</span><p>Фільм «${escapeHtml(title)}» не знайдено.<br><small>Спробуйте написати назву англійською.</small></p></div>`;
      return;
    }
    renderMovieResult(res.data);
  } catch (err) {
    inner.innerHTML = `<div class="empty-state"><p>Помилка пошуку: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderMovieResult(m) {
  const inner = document.getElementById("movie-result-inner");
  const stars = m.rating_imdb ? "⭐".repeat(Math.round(m.rating_imdb / 2)) : "";
  const genre = Array.isArray(m.genre) ? m.genre.join(", ") : (m.genre || "");
  const cast = Array.isArray(m.cast) ? m.cast.slice(0, 4).join(", ") : (m.cast || "");

  const netflixLinks = (m.watch_links || []).filter(w => w.platform && w.platform.includes("Netflix"));
  const otherOfficialLinks = (m.watch_links || []).filter(w => w.category === "official" && (!w.platform || !w.platform.includes("Netflix")));
  const onlineLinks = (m.watch_links || []).filter(w => w.category === "online");
  const torrentLinks = (m.watch_links || []).filter(w => w.category === "torrent");

  let watchLinksHtml = "";
  if (netflixLinks.length || otherOfficialLinks.length || onlineLinks.length || torrentLinks.length) {
    watchLinksHtml = `
      <div class="movie-links-section">
        ${(netflixLinks.length || otherOfficialLinks.length) ? `
          <div class="movie-links-group">
            <span class="movie-links-label">🔴 Стрімінг (Ваш Netflix акаунт & Megogo):</span>
            <div class="movie-links-grid">
              ${netflixLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-netflix">${escapeHtml(w.platform)}</a>`).join("")}
              ${otherOfficialLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-official">${escapeHtml(w.platform)}</a>`).join("")}
            </div>
          </div>` : ""}
        ${onlineLinks.length ? `
          <div class="movie-links-group">
            <span class="movie-links-label">🍿 Дивитись онлайн безкоштовно:</span>
            <div class="movie-links-grid">
              ${onlineLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-online">${escapeHtml(w.platform)}</a>`).join("")}
            </div>
          </div>` : ""}
        ${torrentLinks.length ? `
          <div class="movie-links-group">
            <span class="movie-links-label">🧲 Торренти (завантажити):</span>
            <div class="movie-links-grid">
              ${torrentLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-torrent">${escapeHtml(w.platform)}</a>`).join("")}
            </div>
          </div>` : ""}
      </div>
    `;
  } else if (Array.isArray(m.where_to_watch)) {
    const links = m.where_to_watch.filter(w => w.available !== false).map(w =>
      `<a href="${escapeHtml(w.url || '#')}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-online">🎬 ${escapeHtml(w.platform)}</a>`
    ).join("");
    if (links) {
      watchLinksHtml = `<div class="movie-links-section"><div class="movie-links-grid">${links}</div></div>`;
    }
  }

  inner.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
        <div>
          <h3 style="margin:0;font-size:1.1rem;font-weight:700;">${escapeHtml(m.title)}</h3>
          ${m.original_title ? `<div style="color:var(--text-muted);font-size:0.84rem;">${escapeHtml(m.original_title)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;">
          ${m.rating_imdb ? `<span style="background:#f5c518;color:#000;font-weight:700;border-radius:6px;padding:3px 8px;font-size:0.88rem;">IMDb ${m.rating_imdb}</span>` : ""}
          ${m.rating_kinopoisk ? `<span style="background:#f60;color:#fff;font-weight:700;border-radius:6px;padding:3px 8px;font-size:0.88rem;">КП ${m.rating_kinopoisk}</span>` : ""}
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:0.82rem;">
        ${m.year ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">📅 ${m.year}</span>` : ""}
        ${m.duration_min ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">⏱ ${m.duration_min} хв</span>` : ""}
        ${m.country ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">🌍 ${escapeHtml(m.country)}</span>` : ""}
        ${genre ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">🎭 ${escapeHtml(genre)}</span>` : ""}
      </div>

      ${m.director ? `<div style="font-size:0.88rem;color:var(--text-sub);"><strong>Режисер:</strong> ${escapeHtml(m.director)}</div>` : ""}
      ${cast ? `<div style="font-size:0.88rem;color:var(--text-sub);"><strong>У ролях:</strong> ${escapeHtml(cast)}</div>` : ""}

      ${m.description ? `<p style="margin:0;font-size:0.9rem;line-height:1.55;color:var(--text-main);">${escapeHtml(m.description)}</p>` : ""}

      ${m.review ? `<div style="background:rgba(6,182,212,0.08);border-left:3px solid var(--primary);border-radius:0 8px 8px 0;padding:8px 12px;font-size:0.87rem;color:var(--text-sub);font-style:italic;">${escapeHtml(m.review)}</div>` : ""}

      ${watchLinksHtml}

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
        ${m.trailer_search ? `<a href="${escapeHtml(m.trailer_search)}" target="_blank" rel="noopener noreferrer" style="background:var(--danger);color:#fff;border-radius:8px;padding:6px 14px;font-size:0.85rem;font-weight:600;text-decoration:none;">▶️ Трейлер YouTube</a>` : ""}
        <button onclick='addMovieToWatchlist(${JSON.stringify(m).replace(/'/g, "&#39;")})' style="background:var(--success);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;">📌 До списку перегляду</button>
      </div>
    </div>
  `;
}

window.quickSearchMovie = function(title) {
  const input = document.getElementById("movie-search-input");
  if (input) {
    input.value = title;
  }
  searchMovie();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.addMovieToWatchlist = async function(m) {
  try {
    await apiFetch("/api/movies/watchlist", {
      method: "POST",
      body: JSON.stringify({
        title: m.title,
        original_title: m.original_title || null,
        year: m.year || null,
        type: m.type || "movie",
        rating_imdb: m.rating_imdb || null,
        comment: m.review || null,
        url: m.trailer_search || null
      })
    });
    showToast(`✅ «${m.title}» додано до списку перегляду!`);
    loadMoviesWatchlist();
  } catch (err) {
    showToast(`Помилка: ${err.message}`);
  }
};

async function loadMoviesWatchlist() {
  const list = document.getElementById("movies-watchlist-list");
  if (!list) return;
  try {
    const typeParam = _moviesWatchlistType !== "all" ? `?type=${_moviesWatchlistType}` : "";
    const items = await apiFetch(`/api/movies/watchlist${typeParam}`);
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="empty-icon">🎬</span><p>Список перегляду порожній.<br><small>Знайдіть фільм вище та натисніть «📌 До списку перегляду».</small></p></div>`;
      return;
    }
    const statusIcon = { completed: "✅", to_watch: "👁️", in_progress: "⏳" };
    list.innerHTML = items.map(m => `
      <div class="item-card">
        <div class="item-content">
          <span class="item-title ${m.status === "completed" ? "completed" : ""}">${escapeHtml(m.title)}</span>
          ${m.comment ? `<span class="item-subtitle">${escapeHtml(m.comment)}</span>` : ""}
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;">
            <span class="item-badge badge-media">${m.type === "series" ? "📺 Серіал" : "🎬 Фільм"}</span>
            <a href="https://www.netflix.com/search?q=${encodeURIComponent(m.title)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-netflix" style="padding:2px 8px;font-size:0.78rem;border-radius:6px;text-decoration:none;">🔴 Netflix</a>
            <button onclick="quickSearchMovie('${escapeHtml(m.title).replace(/'/g, "\\'")}')" style="background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.3);color:var(--primary);border-radius:6px;padding:2px 8px;font-size:0.78rem;font-weight:600;cursor:pointer;">🔍 Де дивитись / Торренти</button>
          </div>
        </div>
        <div class="item-actions">
          <span style="font-size:1.1rem;" title="${m.status}">${statusIcon[m.status] || "👁️"}</span>
          <button class="custom-checkbox ${m.status === "completed" ? "checked" : ""}" onclick="toggleMedia(${m.id})" title="Позначити переглянутим">✓</button>
          <button class="delete-btn" onclick="deleteMovieWatchlist(${m.id})" title="Видалити">🗑️</button>
        </div>
      </div>`).join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження</p></div>`;
  }
}

window.deleteMovieWatchlist = async function(id) {
  try {
    await apiFetch(`/api/movies/watchlist/${id}`, { method: "DELETE" });
    loadMoviesWatchlist();
    showToast("Видалено зі списку перегляду");
  } catch (err) {
    showToast(`Помилка: ${err.message}`);
  }
};

// 7. Inventory (Where is what)
async function loadInventory() {
  const list = document.getElementById("inventory-list");
  try {
    const items = await apiFetch("/api/inventory");
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>В інвентарі поки порожньо. Додайте речі та де вони лежать!</p></div>`;
      return;
    }
    list.innerHTML = items
      .map(
        (i) => `
        <div class="item-card">
          <div class="item-content">
            <span class="item-title">📍 ${escapeHtml(i.item_name)}</span>
            <span class="item-subtitle"><strong>Місце:</strong> ${escapeHtml(i.location)}</span>
            ${i.dimensions_or_spec ? `<span class="item-subtitle">Характеристики: ${escapeHtml(i.dimensions_or_spec)}</span>` : ""}
            ${i.tags ? `<span class="item-badge badge-tasks"># ${escapeHtml(i.tags)}</span>` : ""}
          </div>
          <div class="item-actions">
            <button class="delete-btn" onclick="deleteItem('inventory', ${i.id})" title="Видалити">🗑️</button>
          </div>
        </div>`
      )
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження інвентарю</p></div>`;
  }
}

// 7. Auto & Garage
async function loadAuto() {
  const list = document.getElementById("auto-list");
  const currentKmEl = document.getElementById("auto-current-km");
  const nextKmBadge = document.getElementById("auto-next-km-badge");
  const serviceMsgEl = document.getElementById("auto-service-msg");
  const insMsgEl = document.getElementById("auto-insurance-msg");

  try {
    const status = await apiFetch("/api/auto/status");
    if (status) {
      currentKmEl.textContent = status.current_mileage ? `${status.current_mileage} км` : "Не вказано";
      if (status.km_until_service !== null) {
        nextKmBadge.textContent = `ТО через ${status.km_until_service} км`;
        nextKmBadge.className = `item-badge ${status.km_until_service <= 1000 ? "badge-finance" : "badge-shopping"}`;
      } else {
        nextKmBadge.textContent = "ТО не заплановано";
      }
      serviceMsgEl.textContent = status.service_status_message;
      insMsgEl.textContent = status.insurance_status_message;
    }

    const logs = status?.recent_logs || [];
    if (!logs || logs.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Записів гаража поки немає</p></div>`;
      return;
    }

    const typeIcons = {
      mileage: "🛣️ Пробіг",
      maintenance: "🔧 ТО / Ремонт",
      insurance: "🛡️ Страховка",
    };

    list.innerHTML = logs
      .map((l) => {
        const dateStr = new Date(l.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
        return `
          <div class="item-card">
            <div class="item-content">
              <span class="item-title">${escapeHtml(l.notes || typeIcons[l.event_type] || l.event_type)}</span>
              <span class="item-subtitle">${dateStr} ${l.current_mileage ? `• Пробіг: ${l.current_mileage} км` : ""}</span>
              <span class="item-badge badge-finance ${l.event_type === 'insurance' ? 'positive' : ''}">${typeIcons[l.event_type] || l.event_type}</span>
            </div>
            <div class="item-actions">
              <button class="delete-btn" onclick="deleteItem('auto/logs', ${l.id})" title="Видалити">🗑️</button>
            </div>
          </div>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження авто</p></div>`;
  }
}

// 8. Utilities
async function loadUtilities() {
  const list = document.getElementById("utilities-list");
  const elVal = document.getElementById("meter-val-electricity");
  const elDelta = document.getElementById("meter-delta-electricity");
  const wVal = document.getElementById("meter-val-water");
  const wDelta = document.getElementById("meter-delta-water");
  const gVal = document.getElementById("meter-val-gas");
  const gDelta = document.getElementById("meter-delta-gas");

  try {
    const data = await apiFetch("/api/utilities/summary");
    if (data?.meters) {
      const el = data.meters.electricity;
      if (el && el.latest_value !== null) {
        elVal.textContent = `${el.latest_value}`;
        elDelta.textContent = el.delta !== null ? `+${el.delta} кВт·г` : "перший запис";
      }
      const w = data.meters.water;
      if (w && w.latest_value !== null) {
        wVal.textContent = `${w.latest_value}`;
        wDelta.textContent = w.delta !== null ? `+${w.delta} м³` : "перший запис";
      }
      const g = data.meters.gas;
      if (g && g.latest_value !== null) {
        gVal.textContent = `${g.latest_value}`;
        gDelta.textContent = g.delta !== null ? `+${g.delta} м³` : "перший запис";
      }
    }

    const readings = data?.recent_readings || [];
    if (!readings || readings.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Показників лічильників поки немає</p></div>`;
      return;
    }

    const meterIcons = { electricity: "💡 Світло", water: "💧 Вода", gas: "🔥 Газ" };
    const meterUnits = { electricity: "кВт·г", water: "м³", gas: "м³" };

    list.innerHTML = readings
      .map((r) => {
        const dateStr = new Date(r.recorded_at).toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        return `
          <div class="item-card">
            <div class="item-content">
              <span class="item-title"><strong>${r.reading_value}</strong> ${meterUnits[r.meter_type] || ""} ${r.delta !== null ? `(+${r.delta})` : ""}</span>
              <span class="item-subtitle">${dateStr} • ${meterIcons[r.meter_type] || r.meter_type}</span>
              <span class="item-badge badge-tasks">${meterIcons[r.meter_type] || r.meter_type}</span>
            </div>
            <div class="item-actions">
              <button class="delete-btn" onclick="deleteItem('utilities/readings', ${r.id})" title="Видалити">🗑️</button>
            </div>
          </div>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження показників</p></div>`;
  }
}

// 8. Fitness & Apple Health
async function loadFitness() {
  const stepsEl = document.getElementById("stat-fitness-steps");
  const distEl = document.getElementById("stat-fitness-distance");
  const flightsEl = document.getElementById("stat-fitness-flights");
  const progressEl = document.getElementById("stat-fitness-progress");
  const weeklyStepsEl = document.getElementById("stat-weekly-steps");
  const weeklyAvgEl = document.getElementById("stat-weekly-avg");
  const weeklyDistEl = document.getElementById("stat-weekly-dist");
  const weeklyDaysEl = document.getElementById("stat-weekly-active-days");
  const skiBadgeEl = document.getElementById("ski-count-badge");
  const skiListEl = document.getElementById("ski-logs-list");
  const logsListEl = document.getElementById("fitness-logs-list");

  try {
    const data = await apiFetch("/api/v1/fitness/summary");
    if (!data) return;

    // Today stats
    const today = data.today;
    const steps = today ? today.steps : 0;
    const dist = today ? today.distance_km : 0;
    const flights = today ? today.flights_climbed : 0;
    const cals = today ? today.calories : 0;

    if (stepsEl) stepsEl.textContent = steps.toLocaleString("ru-RU");
    if (distEl) distEl.textContent = `${dist} км`;
    if (flightsEl) flightsEl.textContent = `${flights} поверхів • ${cals} ккал`;

    const progressPct = Math.min(100, Math.round((steps / 10000) * 100));
    if (progressEl) progressEl.style.width = `${progressPct}%`;

    // Weekly stats
    if (data.weekly_stats) {
      if (weeklyStepsEl) weeklyStepsEl.textContent = data.weekly_stats.total_steps.toLocaleString("ru-RU");
      if (weeklyAvgEl) weeklyAvgEl.textContent = data.weekly_stats.avg_steps_daily.toLocaleString("ru-RU");
      if (weeklyDistEl) weeklyDistEl.textContent = `${data.weekly_stats.total_distance_km} км`;
      if (weeklyDaysEl) weeklyDaysEl.textContent = `${data.weekly_stats.days_recorded} активних днів`;
    }

    // Ski logs
    const skiLogs = data.ski_logs || [];
    if (skiBadgeEl) skiBadgeEl.textContent = `${skiLogs.length} сесій`;
    if (skiListEl) {
      if (skiLogs.length === 0) {
        skiListEl.innerHTML = `<span style="color:var(--text-muted);">Поки немає записів лижних спусків.</span>`;
      } else {
        skiListEl.innerHTML = skiLogs.map(s => {
          const d = s.workout_details || {};
          return `<div style="padding:6px 0;border-bottom:1px solid var(--border-color);font-size:0.85rem;">
            🎿 <strong>${s.date}</strong>: ${s.distance_km} км • Спусків: <strong>${d.descents || '—'}</strong> • Макс. швидкість: <strong>${d.max_speed_kmh || '—'} км/год</strong>
          </div>`;
        }).join("");
      }
    }

    // Recent logs
    const recent = data.recent_logs || [];
    if (!recent || recent.length === 0) {
      if (logsListEl) logsListEl.innerHTML = `<div class="empty-state"><p>Записів активності поки немає</p></div>`;
      return;
    }

    const typeIcons = { skiing: "🎿 Лижі", running: "🏃 Біг", cycling: "🚴 Велосипед", general: "👟 Кроки" };
    if (logsListEl) {
      logsListEl.innerHTML = recent.map(r => {
        return `
          <div class="item-card">
            <div class="item-content">
              <span class="item-title"><strong>${r.steps.toLocaleString('ru-RU')}</strong> кроків • ${r.distance_km} км</span>
              <span class="item-subtitle">${r.date} • ${r.flights_climbed} поверхів • ${r.calories} ккал</span>
              <span class="item-badge badge-finance">${typeIcons[r.workout_type] || r.workout_type}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  } catch (e) {
    if (logsListEl) logsListEl.innerHTML = `<div class="empty-state"><p>Помилка завантаження фітнес-даних</p></div>`;
  }
}

// 9. Hospitality & Bookings
async function loadHospitality() {
  const revEl = document.getElementById("hosp-total-revenue");
  const countEl = document.getElementById("hosp-active-count");
  const balEl = document.getElementById("hosp-pending-balance");
  const prepEl = document.getElementById("hosp-prepayments");
  const list = document.getElementById("hospitality-list");

  try {
    const summary = await apiFetch("/api/v1/hospitality/summary");
    if (summary) {
      if (revEl) revEl.textContent = `${summary.total_revenue_expected} ₴`;
      if (countEl) countEl.textContent = `${summary.active_bookings_count} активних броней`;
      if (balEl) balEl.textContent = `${summary.total_pending_balance} ₴`;
      if (prepEl) prepEl.textContent = `Передоплата: ${summary.total_prepayments_received} ₴`;
    }

    const bookings = await apiFetch("/api/v1/hospitality/bookings");
    if (!bookings || bookings.length === 0) {
      if (list) list.innerHTML = `<div class="empty-state"><p>Немає створених бронювань</p></div>`;
      return;
    }

    const statusBadge = { active: "badge-tasks", completed: "badge-finance positive", cancelled: "badge-finance" };
    const statusText = { active: "Активно", completed: "Завершено", cancelled: "Скасовано" };

    if (list) {
      list.innerHTML = bookings.map(b => {
        return `
          <div class="item-card">
            <div class="item-content">
              <span class="item-title"><strong>${escapeHtml(b.guest_name)}</strong> • ${escapeHtml(b.apartment_unit)}</span>
              <span class="item-subtitle">📅 ${b.check_in_date} ➔ ${b.check_out_date} (${b.total_days} діб)</span>
              <span class="item-subtitle">💰 Сума: ${b.total_amount} ₴ • Оплачено: ${b.prepayment} ₴ • До сплати: <strong>${b.remaining_balance} ₴</strong></span>
              <span class="item-badge ${statusBadge[b.status] || 'badge-tasks'}">${statusText[b.status] || b.status}</span>
            </div>
            <div class="item-actions">
              <button class="delete-btn" onclick="deleteBooking(${b.id})" title="Видалити бронювання">🗑️</button>
            </div>
          </div>
        `;
      }).join("");
    }
  } catch (e) {
    if (list) list.innerHTML = `<div class="empty-state"><p>Помилка завантаження бронювань</p></div>`;
  }
}

window.deleteBooking = async function (id) {
  if (!confirm("Видалити це бронювання?")) return;
  try {
    await apiFetch(`/api/v1/hospitality/bookings/${id}`, { method: "DELETE" });
    showToast("Бронювання видалено");
    loadHospitality();
  } catch (e) {
    showToast(`Помилка: ${e.message}`);
  }
};

// 10. Google Drive 5TB Backup Status & Trigger
async function loadBackupStatus() {
  const timeLabel = document.getElementById("last-backup-time-label");
  const detailsLabel = document.getElementById("last-backup-details-label");
  if (!timeLabel) return;

  try {
    const data = await apiFetch("/api/v1/system/backup/status");
    if (data) {
      timeLabel.textContent = data.last_backup_time || "ще не створювався";
      const syncStatus = data.gdrive_synced ? "☁️ Синхронізовано з Google Drive" : "💾 Збережено локально (зашифровано)";
      const encStatus = data.encrypted ? "🔒 256-bit Fernet" : "відкрито";
      if (detailsLabel) detailsLabel.textContent = `${syncStatus} • ${encStatus} • Розмір: ${data.size_kb} KB`;
    }
  } catch (e) {
    console.warn("Could not load backup status:", e);
  }
}

async function triggerCloudBackup() {
  const btn = document.getElementById("trigger-cloud-backup-btn");
  const feedback = document.getElementById("backup-action-feedback");
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = `<span>⏳ Створення та шифрування архіву...</span>`;
  if (feedback) feedback.textContent = "Обробка бази даних...";

  try {
    const res = await apiFetch("/api/v1/system/backup", { method: "POST" });
    if (feedback) {
      if (res && res.gdrive_synced) {
        feedback.textContent = `✅ Успішно! Зашифрований архів (${res.size_kb} KB) вивантажено на Google Drive!`;
        feedback.style.color = "var(--success)";
      } else {
        feedback.textContent = `💾 Зашифрований архів (${res?.size_kb || 0} KB) збережено локально в backups/.`;
        feedback.style.color = "var(--warning)";
      }
    }
    showToast("✅ Резервну копію успішно створено!");
    loadBackupStatus();
  } catch (e) {
    if (feedback) {
      feedback.textContent = `❌ Помилка: ${e.message}`;
      feedback.style.color = "var(--danger)";
    }
    showToast(`❌ Помилка бекапу: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>Створити резервну копію зараз</span>
    `;
  }
}

async function checkSystemFeatures() {
  try {
    const data = await apiFetch("/api/v1/system/features");
    if (data && data.enable_hospitality) {
      const hospBtn = document.getElementById("tab-btn-hospitality");
      if (hospBtn) hospBtn.classList.remove("hidden");
    }
  } catch (e) {
    console.warn("Could not check features:", e);
  }
}

// --- Action Handlers (Toggle & Delete) ---
window.toggleShopping = async function (id) {
  try {
    await apiFetch(`/api/shopping/${id}/toggle`, { method: "PATCH" });
    loadShopping();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`);
  }
};

window.toggleTask = async function (id) {
  try {
    await apiFetch(`/api/tasks/${id}/toggle`, { method: "PATCH" });
    loadTasks();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`);
  }
};

window.toggleMedia = async function (id) {
  try {
    await apiFetch(`/api/media_notes/${id}/toggle`, { method: "PATCH" });
    if (state.activeTab === "movies") {
      loadMoviesWatchlist();
    } else {
      loadMedia();
    }
  } catch (e) {
    showToast(`Ошибка: ${e.message}`);
  }
};

window.deleteItem = async function (domain, id) {
  if (!confirm("Удалить эту запись?")) return;
  try {
    await apiFetch(`/api/${domain}/${id}`, { method: "DELETE" });
    reloadCurrentTab();
  } catch (e) {
    showToast(`Ошибка удаления: ${e.message}`);
  }
};

// Clear completed shopping
document.getElementById("clear-shopping-btn")?.addEventListener("click", async () => {
  if (!confirm("Очистить все купленные товары?")) return;
  try {
    const res = await apiFetch("/api/shopping/clear-completed", { method: "POST" });
    showToast(`Удалено купленных товаров: ${res.deleted_count}`);
    loadShopping();
  } catch (e) {
    showToast(`Ошибка: ${e.message}`);
  }
});

// --- Settings Modal ---
function initSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const openBtn = document.getElementById("settings-open-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const saveBtn = document.getElementById("save-settings-btn");
  const testBtn = document.getElementById("test-connection-btn");
  const serverInput = document.getElementById("server-url-input");
  const secretInput = document.getElementById("secret-key-input");
  const resultText = document.getElementById("settings-test-result");

  if (openBtn) {
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      modal.classList.remove("hidden");
      serverInput.value = state.serverUrl;
      secretInput.value = state.secretKey;
      resultText.textContent = "";
      try {
        loadBackupStatus();
      } catch (err) {
        console.warn("loadBackupStatus error:", err);
      }
    });
  }

  document.getElementById("trigger-cloud-backup-btn")?.addEventListener("click", triggerCloudBackup);

  document.getElementById("clear-cache-reload-btn")?.addEventListener("click", async () => {
    showToast("Очищення кешу та оновлення...");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn("Cache clear error:", e);
    }
    setTimeout(() => {
      window.location.reload(true);
    }, 400);
  });

  closeBtn?.addEventListener("click", () => modal.classList.add("hidden"));

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  saveBtn.addEventListener("click", () => {
    state.serverUrl = serverInput.value.trim() || window.location.origin;
    state.secretKey = secretInput.value.trim();
    localStorage.setItem("server_url", state.serverUrl);
    localStorage.setItem("secret_key", state.secretKey);
    modal.classList.add("hidden");
    showToast("⚙️ Настройки сохранены");
    checkHealth();
    reloadCurrentTab();
  });

  testBtn.addEventListener("click", async () => {
    resultText.textContent = "Проверка...";
    resultText.style.color = "var(--text-muted)";
    const prevKey = state.secretKey;
    const prevUrl = state.serverUrl;
    state.serverUrl = serverInput.value.trim() || window.location.origin;
    state.secretKey = secretInput.value.trim();

    try {
      const data = await apiFetch("/health");
      if (data && data.status === "online") {
        resultText.textContent = "✅ Связь успешна! Сервер работает.";
        resultText.style.color = "var(--success)";
      } else {
        resultText.textContent = "⚠️ Сервер ответил, но статус неизвестен";
        resultText.style.color = "var(--warning)";
      }
    } catch (e) {
      resultText.textContent = `❌ Ошибка подключения: ${e.message}`;
      resultText.style.color = "var(--danger)";
    } finally {
      state.serverUrl = prevUrl;
      state.secretKey = prevKey;
    }
  });
}

// --- Manual Add Modal ---
function initManualAddModal() {
  const modal = document.getElementById("manual-add-modal");
  const closeBtn = document.getElementById("manual-close-btn");
  const cancelBtn = document.getElementById("manual-cancel-btn");
  const form = document.getElementById("manual-add-form");
  const titleEl = document.getElementById("manual-modal-title");
  const fieldsEl = document.getElementById("manual-form-fields");

  let currentDomain = "finance";

  function openAdd(domain) {
    currentDomain = domain;
    fieldsEl.innerHTML = "";

    if (domain === "finance") {
      titleEl.textContent = "Додати витрату / дохід";
      fieldsEl.innerHTML = `
        <label>Сума:</label>
        <input type="number" step="0.01" name="amount" required placeholder="85" />
        <label>Валюта:</label>
        <select name="currency">
          <option value="UAH" selected>Гривня (₴ UAH)</option>
          <option value="USD">Долар ($ USD)</option>
          <option value="EUR">Євро (€ EUR)</option>
        </select>
        <label>Тип:</label>
        <select name="type">
          <option value="expense">Витрата</option>
          <option value="income">Дохід</option>
        </select>
        <label>Категорія:</label>
        <input type="text" name="category" placeholder="Кафе, Продукти, Таксі..." value="Різне" />
        <label>Опис:</label>
        <input type="text" name="description" placeholder="Кава та круасан" />
      `;
    } else if (domain === "shopping") {
      titleEl.textContent = "Добавить товар в покупки";
      fieldsEl.innerHTML = `
        <label>Название товара:</label>
        <input type="text" name="item" required placeholder="Молоко" />
        <label>Количество:</label>
        <input type="text" name="quantity" value="1 шт" placeholder="2 шт, 1 кг" />
        <label>Категория:</label>
        <input type="text" name="category" value="Продукты" />
      `;
    } else if (domain === "tasks") {
      titleEl.textContent = "Додати роботу / справу";
      fieldsEl.innerHTML = `
        <label>Назва роботи або справи:</label>
        <input type="text" name="title" required placeholder="Постелити плитку, помити авто..." />
        <label>Термін виконання:</label>
        <input type="datetime-local" name="due_date" />
        <label>Пріоритет:</label>
        <select name="priority">
          <option value="low">Низький</option>
          <option value="medium" selected>Середній</option>
          <option value="high">Високий / Терміново</option>
        </select>
      `;
    } else if (domain === "media") {
      titleEl.textContent = "🧠 Додати запис у Склерозник";
      fieldsEl.innerHTML = `
        <label>Текст замітки / Пароль / Назва:</label>
        <input type="text" name="title" required placeholder="Код шлагбаума 7788 / Пароль Wi-Fi" />
        <label>Тип:</label>
        <select name="type">
          <option value="note">🧠 Склерозник (Замітка / Код / Пароль)</option>
          <option value="movie">🎬 Фільм</option>
          <option value="series">📺 Серіал</option>
          <option value="book">📚 Книга</option>
          <option value="podcast">🎧 Подкаст</option>
          <option value="article">📰 Стаття</option>
        </select>
        <label>Підказка / Деталі (необов'язково):</label>
        <input type="text" name="author_creator" placeholder="Під'їзд 2, кнопка зірочка" />
        <label>Посилання (якщо є):</label>
        <input type="url" name="url" placeholder="https://..." />
        <label>Додатковий коментар:</label>
        <textarea name="comment" rows="2" placeholder="Запасний варіант, уточнити в сусіда"></textarea>
      `;
    } else if (domain === "inventory") {
      titleEl.textContent = "Додати річ до інвентарю";
      fieldsEl.innerHTML = `
        <label>Назва речі:</label>
        <input type="text" name="item_name" required placeholder="Шуруповерт / Паспорт / Ключі" />
        <label>Місцезнаходження:</label>
        <input type="text" name="location" required placeholder="Верхня полиця, синя коробка" />
        <label>Теги (через кому):</label>
        <input type="text" name="tags" placeholder="інструменти, дім, ремонт" />
        <label>Характеристики / опис:</label>
        <input type="text" name="dimensions_or_spec" placeholder="18V синій кейс" />
      `;
    } else if (domain === "auto") {
      titleEl.textContent = "Додати запис у гараж";
      fieldsEl.innerHTML = `
        <label>Тип події:</label>
        <select name="event_type">
          <option value="mileage">Пробіг</option>
          <option value="maintenance">ТО / Сервіс</option>
          <option value="insurance">Страховка</option>
        </select>
        <label>Поточний пробіг (км):</label>
        <input type="number" name="current_mileage" placeholder="145000" />
        <label>Пробіг наступного ТО (км):</label>
        <input type="number" name="next_service_mileage" placeholder="155000" />
        <label>Дата закінчення страховки:</label>
        <input type="date" name="insurance_expiry_date" />
        <label>Примітки:</label>
        <input type="text" name="notes" placeholder="Заміна мастила 5W-30 і фільтрів" />
      `;
    } else if (domain === "utilities") {
      titleEl.textContent = "Внести показники лічильника";
      fieldsEl.innerHTML = `
        <label>Тип лічильника:</label>
        <select name="meter_type">
          <option value="electricity">💡 Електроенергія (кВт·год)</option>
          <option value="water">💧 Вода (м³)</option>
          <option value="gas">🔥 Газ (м³)</option>
        </select>
        <label>Поточні показники:</label>
        <input type="number" step="0.01" name="reading_value" required placeholder="14250.5" />
      `;
    } else if (domain === "fitness") {
      titleEl.textContent = "Додати активність (Apple Health)";
      fieldsEl.innerHTML = `
        <label>Кроки (steps):</label>
        <input type="number" name="steps" required placeholder="8500" value="8500" />
        <label>Дистанція (км):</label>
        <input type="number" step="0.01" name="distance_km" placeholder="6.2" value="6.2" />
        <label>Пройдено поверхів:</label>
        <input type="number" name="flights_climbed" placeholder="12" value="12" />
        <label>Активні калорії (ккал):</label>
        <input type="number" name="calories" placeholder="420" value="420" />
        <label>Тип активності:</label>
        <select name="workout_type">
          <option value="general">Загальна ходьба / активність</option>
          <option value="skiing">⛷️ Гірські лижі (Skiing)</option>
          <option value="running">🏃 Біг</option>
          <option value="cycling">🚴 Велосипед</option>
        </select>
      `;
    } else if (domain === "hospitality") {
      titleEl.textContent = "Створити нове бронювання";
      fieldsEl.innerHTML = `
        <label>Ім'я гостя:</label>
        <input type="text" name="guest_name" required placeholder="Олександр Петренко" />
        <label>Апартаменти:</label>
        <input type="text" name="apartment_unit" value="Apartment #1" />
        <label>Дата заїзду:</label>
        <input type="date" name="check_in_date" required />
        <label>Дата виїзду:</label>
        <input type="date" name="check_out_date" required />
        <label>Добова ставка (₴):</label>
        <input type="number" step="0.01" name="daily_rate" required placeholder="2500" />
        <label>Внесена передоплата (₴):</label>
        <input type="number" step="0.01" name="prepayment" value="0" />
        <label>Статус:</label>
        <select name="status">
          <option value="active">Активно</option>
          <option value="completed">Завершено</option>
          <option value="cancelled">Скасовано</option>
        </select>
        <label>Примітки:</label>
        <input type="text" name="notes" placeholder="2 гостя, пізній заїзд о 21:00" />
      `;
    }

    modal.classList.remove("hidden");
  }

  document.getElementById("add-finance-btn")?.addEventListener("click", () => openAdd("finance"));
  document.getElementById("add-shopping-btn")?.addEventListener("click", () => openAdd("shopping"));
  document.getElementById("add-task-btn")?.addEventListener("click", () => openAdd("tasks"));
  document.getElementById("add-media-btn")?.addEventListener("click", () => openAdd("media"));
  document.getElementById("add-inventory-btn")?.addEventListener("click", () => openAdd("inventory"));
  document.getElementById("add-auto-btn")?.addEventListener("click", () => openAdd("auto"));
  document.getElementById("add-utility-btn")?.addEventListener("click", () => openAdd("utilities"));
  document.getElementById("add-fitness-btn")?.addEventListener("click", () => openAdd("fitness"));
  document.getElementById("add-booking-btn")?.addEventListener("click", () => openAdd("hospitality"));

  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    let endpoint = "";
    if (currentDomain === "finance") {
      endpoint = "/api/finance";
      data.amount = parseFloat(data.amount);
    } else if (currentDomain === "shopping") {
      endpoint = "/api/shopping";
    } else if (currentDomain === "tasks") {
      endpoint = "/api/tasks";
      if (!data.due_date) delete data.due_date;
    } else if (currentDomain === "media") {
      endpoint = "/api/media_notes";
    } else if (currentDomain === "inventory") {
      endpoint = "/api/inventory";
    } else if (currentDomain === "auto") {
      endpoint = "/api/auto/log";
      if (data.current_mileage) data.current_mileage = parseInt(data.current_mileage);
      else delete data.current_mileage;
      if (data.next_service_mileage) data.next_service_mileage = parseInt(data.next_service_mileage);
      else delete data.next_service_mileage;
      if (!data.insurance_expiry_date) delete data.insurance_expiry_date;
    } else if (currentDomain === "utilities") {
      endpoint = "/api/utilities/reading";
      data.reading_value = parseFloat(data.reading_value);
    } else if (currentDomain === "fitness") {
      endpoint = "/api/v1/fitness/sync";
      data.steps = parseInt(data.steps) || 0;
      data.distance_km = parseFloat(data.distance_km) || 0;
      data.flights_climbed = parseInt(data.flights_climbed) || 0;
      data.calories = parseInt(data.calories) || 0;
    } else if (currentDomain === "hospitality") {
      endpoint = "/api/v1/hospitality/bookings";
      data.daily_rate = parseFloat(data.daily_rate);
      data.prepayment = parseFloat(data.prepayment || 0);
    }

    try {
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(data),
      });
      modal.classList.add("hidden");
      showToast("✅ Запис збережено");
      reloadCurrentTab();
    } catch (err) {
      showToast(`❌ Помилка: ${err.message}`);
    }
  });
}

// --- Step 2 Handlers (Telegram, Inventory Search, Web Agent) ---
function initStep2Handlers() {
  // 1. Share Shopping List to Telegram
  document.getElementById("share-shopping-telegram-btn")?.addEventListener("click", async () => {
    try {
      const items = await apiFetch("/api/shopping?is_purchased=false");
      if (!items || items.length === 0) {
        showToast("Список покупок порожній!");
        return;
      }
      let text = "🛒 *Список покупок:*\n\n";
      items.forEach((item, index) => {
        text += `${index + 1}. ▫️ ${item.item} (${item.quantity})\n`;
      });
      const tgUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
      window.open(tgUrl, "_blank");
    } catch (e) {
      showToast(`Помилка: ${e.message}`);
    }
  });

  // 2. Inventory Search ("Де мій...?")
  const invInput = document.getElementById("inventory-search-input");
  const invBtn = document.getElementById("inventory-search-btn");
  const invResult = document.getElementById("inventory-query-result");

  async function runInventorySearch() {
    const q = invInput.value.trim();
    if (!q) return;
    try {
      const res = await apiFetch(`/api/inventory/where?q=${encodeURIComponent(q)}`);
      invResult.classList.remove("hidden");
      invResult.textContent = res.message;
    } catch (e) {
      showToast(`Помилка пошуку: ${e.message}`);
    }
  }

  invBtn?.addEventListener("click", runInventorySearch);
  invInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runInventorySearch();
  });

  // 3. Web Search Agent (Розумний AI-Агент)
  const agentForm = document.getElementById("agent-search-form");
  const agentInput = document.getElementById("agent-query-input");
  const agentLoader = document.getElementById("agent-loading");
  const agentCard = document.getElementById("agent-response-card");
  const agentQueryEl = document.getElementById("agent-res-query");
  const agentAnswerEl = document.getElementById("agent-res-answer");
  const agentSourcesBox = document.getElementById("agent-res-sources");
  const agentSourcesList = document.getElementById("agent-sources-list");
  const agentVoiceBtn = document.getElementById("agent-voice-btn");
  const agentTtsBtn = document.getElementById("agent-tts-btn");
  const agentCopyBtn = document.getElementById("agent-copy-btn");

  let lastAgentRawAnswer = "";

  function formatAgentMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4 style="margin:10px 0 4px;font-size:0.95rem;color:var(--text-main);">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="margin:12px 0 6px;font-size:1.02rem;color:var(--text-main);">$1</h3>');
    // Bullet lists
    html = html.replace(/^\* (.*$)/gim, '<div style="margin-left:10px;">• $1</div>');
    html = html.replace(/^- (.*$)/gim, '<div style="margin-left:10px;">• $1</div>');
    // Markdown links [text](url)
    html = html.replace(/\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="agent-link">🔗 $1</a>');
    // Raw URLs into clickable links
    html = html.replace(/(https?:\/\/[^\s<]+)/g, (match, url) => {
      if (url.includes('class="agent-link"')) return match;
      return `<a href="${url}" target="_blank" rel="noopener" class="agent-link">🔗 ${url.replace(/^https?:\/\/(?:www\.)?/, '').slice(0, 30)}...</a>`;
    });
    return html;
  }

  // Voice recognition for agent
  if (agentVoiceBtn) {
    let agentSpeech = null;
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      agentSpeech = new SpeechRec();
      agentSpeech.continuous = false;
      agentSpeech.interimResults = false;
      agentSpeech.lang = "uk-UA";

      agentSpeech.onresult = (evt) => {
        const tr = evt.results[0][0].transcript;
        if (tr && agentInput) {
          agentInput.value = tr;
          agentForm?.dispatchEvent(new Event("submit"));
        }
      };
      agentSpeech.onend = () => agentVoiceBtn.classList.remove("recording");
      agentSpeech.onerror = () => agentVoiceBtn.classList.remove("recording");
    }

    agentVoiceBtn.addEventListener("click", () => {
      if (!agentSpeech) {
        showToast("Голосове розпізнавання не підтримується у цьому браузері");
        return;
      }
      try {
        agentVoiceBtn.classList.add("recording");
        agentSpeech.start();
      } catch (err) {
        agentVoiceBtn.classList.remove("recording");
      }
    });
  }

  // Suggestion chips
  document.querySelectorAll(".agent-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.q;
      if (q && agentInput) {
        agentInput.value = q;
        agentForm?.dispatchEvent(new Event("submit"));
      }
    });
  });

  // TTS speak button
  agentTtsBtn?.addEventListener("click", () => {
    if (!lastAgentRawAnswer) return;
    unlockAudioPlayback();
    const cleanSpeech = lastAgentRawAnswer.replace(/[*#_~`\[\]\(\)]/g, " ").replace(/https?:\/\/\S+/g, "").trim();
    if (cleanSpeech) {
      speakText(cleanSpeech, "uk-UA");
    }
  });

  // Copy button
  agentCopyBtn?.addEventListener("click", () => {
    if (!lastAgentRawAnswer) return;
    navigator.clipboard?.writeText(lastAgentRawAnswer)
      .then(() => showToast("📋 Текст відповіді скопійовано!"))
      .catch(() => showToast("Не вдалося скопіювати"));
  });

  agentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = agentInput.value.trim();
    if (!query) return;

    agentLoader.classList.remove("hidden");
    agentCard.classList.add("hidden");
    agentTtsBtn?.classList.add("hidden");

    try {
      const res = await apiFetch("/api/v1/agent/ask", {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      agentLoader.classList.add("hidden");
      agentCard.classList.remove("hidden");
      agentQueryEl.textContent = res.query;
      lastAgentRawAnswer = res.answer || "";
      agentAnswerEl.innerHTML = formatAgentMarkdown(res.answer);

      if (agentTtsBtn) agentTtsBtn.classList.remove("hidden");

      if (res.sources && res.sources.length > 0) {
        agentSourcesBox.classList.remove("hidden");
        agentSourcesList.innerHTML = res.sources
          .map(
            (s) =>
              `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="item-badge badge-media agent-link" style="text-decoration:none;">🔗 ${escapeHtml(s.title || "Джерело")}</a>`
          )
          .join("");
      } else {
        agentSourcesBox.classList.add("hidden");
      }
    } catch (err) {
      agentLoader.classList.add("hidden");
      showToast(`Помилка агента: ${err.message}`);
    }
  });
}

// --- Step 3 Handlers (Apple Health & Features) ---
function initStep3Handlers() {
  document.getElementById("sync-apple-health-btn")?.addEventListener("click", async () => {
    const stepsInput = prompt("🍏 Синхронізація Apple Health:\nВведіть кількість кроків за сьогодні:", "10500");
    if (!stepsInput) return;
    const steps = parseInt(stepsInput) || 0;
    const dist = parseFloat((steps * 0.00075).toFixed(2));
    const calories = Math.round(steps * 0.04);
    try {
      await apiFetch("/api/v1/fitness/sync", {
        method: "POST",
        body: JSON.stringify({
          steps,
          distance_km: dist,
          flights_climbed: 10,
          calories,
          workout_type: "general"
        })
      });
      showToast(`🍏 Apple Health синхронізовано: ${steps} кроків!`);
      loadFitness();
    } catch (e) {
      showToast(`Помилка синхронізації: ${e.message}`);
    }
  });
}

// ==========================================================================
// --- Step 5: Web Audio API Feedback (Beep & Chime) ---
// ==========================================================================
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Cls = window.AudioContext || window.webkitAudioContext;
    if (Cls) audioCtx = new Cls();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playAudioBeep() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch (e) {}
}

function playSuccessChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + i * 0.05);
      gain.gain.setValueAtTime(0.06, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.18);
    });
  } catch (e) {}
}

// ==========================================================================
// --- Step 5: Action Undo Floating Banner ---
// ==========================================================================
let undoTimer = null;
function showUndoBanner(summary) {
  const banner = document.getElementById("undo-banner");
  const textEl = document.getElementById("undo-text");
  if (!banner || !textEl) return;
  textEl.textContent = summary || "Дію збережено";
  banner.classList.remove("hidden");
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    banner.classList.add("hidden");
  }, 10000);
}

function initUndoBanner() {
  const banner = document.getElementById("undo-banner");
  document.getElementById("undo-close-btn")?.addEventListener("click", () => {
    banner?.classList.add("hidden");
  });
  document.getElementById("undo-banner-btn")?.addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/v1/system/undo", { method: "POST" });
      if (res) {
        showToast(`↩️ ${res.message}`);
        banner?.classList.add("hidden");
        reloadCurrentTab();
      }
    } catch (e) {
      showToast(`❌ Помилка скасування: ${e.message}`);
    }
  });
}

// ==========================================================================
// --- Step 5: Telegram Family Delegation Modal ---
// ==========================================================================
function initDelegationModal() {
  const modal = document.getElementById("delegation-modal");
  const closeBtn = document.getElementById("delegation-close-btn");
  const listEl = document.getElementById("delegation-contacts-list");
  const saveBtn = document.getElementById("save-new-contact-btn");

  closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  async function loadAndRenderContacts() {
    if (!listEl) return;
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">Завантаження контактів...</div>';
    try {
      const contacts = await apiFetch("/api/v1/delegation/contacts");
      if (!contacts || contacts.length === 0) {
        listEl.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted);padding:8px 0;">Контактів сім\'ї ще не додано. Додайте дружину або доньку у формі нижче.</div>';
        return;
      }
      listEl.innerHTML = contacts.map(c => {
        const icon = c.relationship === "wife" ? "👩" : (c.relationship === "daughter" ? "👧" : (c.relationship === "son" ? "👦" : (c.relationship === "husband" ? "👨" : "👤")));
        const tgLabel = c.telegram_chat_id ? `Telegram: ${c.telegram_chat_id}` : "Немає Telegram ID";
        return `
          <div class="contact-picker-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
            <div class="contact-meta">
              <span class="contact-name">${icon} ${escapeHtml(c.name)}</span>
              <span class="contact-sub">${tgLabel}</span>
            </div>
            <button class="action-btn-sm" style="background:#229ED9;">Відправити ➔</button>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll(".contact-picker-item").forEach(item => {
        item.addEventListener("click", async () => {
          const contactId = parseInt(item.getAttribute("data-id"));
          const name = item.getAttribute("data-name");
          try {
            showToast(`Відправляю список для ${name}...`);
            const res = await apiFetch("/api/v1/delegation/send", {
              method: "POST",
              body: JSON.stringify({ contact_id: contactId, domain: "shopping" })
            });
            if (res) {
              showToast(`✅ Список покупок надіслано для ${name} в Telegram!`);
              modal?.classList.add("hidden");
            }
          } catch (err) {
            showToast(`❌ Помилка відправки: ${err.message}`);
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;">Помилка: ${e.message}</div>`;
    }
  }

  document.getElementById("share-shopping-telegram-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal?.classList.remove("hidden");
    loadAndRenderContacts();
  });

  saveBtn?.addEventListener("click", async () => {
    const name = document.getElementById("new-contact-name")?.value.trim();
    const rel = document.getElementById("new-contact-rel")?.value || "other";
    const tg = document.getElementById("new-contact-tg")?.value.trim();
    if (!name) {
      showToast("Вкажіть ім'я контакту!");
      return;
    }
    try {
      await apiFetch("/api/v1/delegation/contacts", {
        method: "POST",
        body: JSON.stringify({ name, relationship: rel, telegram_chat_id: tg, can_add_items: true })
      });
      showToast(`✅ Контакт «${name}» збережено!`);
      const nameInp = document.getElementById("new-contact-name");
      const tgInp = document.getElementById("new-contact-tg");
      if (nameInp) nameInp.value = "";
      if (tgInp) tgInp.value = "";
      loadAndRenderContacts();
    } catch (err) {
      showToast(`❌ Помилка: ${err.message}`);
    }
  });
}

// ==========================================================================
// --- Step 5: Live Translator (Face-to-Face Split Screen) ---
// ==========================================================================
let translatorAudio = null;
let activeUtterance = null;
let audioUnlocked = false;
let autoDialogEnabled = false;
let autoDialogTimer = null;

// Stop any currently playing speech/audio immediately and reset iOS audio session
function stopAllAudio() {
  if (autoDialogTimer) {
    clearTimeout(autoDialogTimer);
    autoDialogTimer = null;
  }
  if (translatorAudio) {
    try {
      translatorAudio.pause();
      // Crucial for iOS Safari: remove src and load() to release AVAudioSession from playback
      translatorAudio.removeAttribute("src");
      translatorAudio.load();
    } catch (e) {}
  }
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  activeUtterance = null;
  document.querySelectorAll(".half-action-btn").forEach((btn) => {
    btn.textContent = "🔊 Озвучити";
  });
}

// iOS Safari requires audio to be primed on first direct user gesture
function unlockAudioPlayback() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    if (!translatorAudio) {
      translatorAudio = new Audio();
    }
    translatorAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    const p = translatorAudio.play();
    if (p && typeof p.then === "function") {
      p.then(() => translatorAudio.pause()).catch(() => {});
    }
  } catch (e) {}

  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.resume();
    } catch (e) {}
  }
}

async function speakText(text, lang, targetCardId = null, audioBase64 = null, onAudioDone = null) {
  if (!text) return;
  stopAllAudio();

  const cleanLang = (lang || "en").toLowerCase().split("-")[0];
  const targetCard = targetCardId ? document.getElementById(targetCardId) : null;
  const ttsBtn = targetCard ? targetCard.querySelector(".half-action-btn") : null;
  const originalBtnText = ttsBtn ? ttsBtn.textContent : "";
  if (ttsBtn) ttsBtn.textContent = "🔊 Грає...";

  let finishedCalled = false;
  function handleFinished() {
    if (finishedCalled) return;
    finishedCalled = true;
    if (ttsBtn) ttsBtn.textContent = originalBtnText || "🔊 Озвучити";
    if (translatorAudio) {
      try {
        translatorAudio.removeAttribute("src");
        translatorAudio.load();
      } catch (e) {}
    }
    if (onAudioDone) onAudioDone();
  }

  // Tier 1: Inline audioBase64 already returned in the same response (instant, 0ms)
  if (audioBase64) {
    try {
      if (!translatorAudio) translatorAudio = new Audio();
      translatorAudio.src = "data:audio/mpeg;base64," + audioBase64;
      translatorAudio.onended = handleFinished;
      translatorAudio.onerror = () => fallbackSpeechSynthesis(text, cleanLang, handleFinished);
      const playPromise = translatorAudio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => fallbackSpeechSynthesis(text, cleanLang, handleFinished));
      }
      return;
    } catch (e) {
      console.warn("[TTS] Base64 audio failed, fallback to native speech:", e);
    }
  }

  // Tier 2: Instant Native Speech Synthesis (Siri/iOS native speech - offline, zero latency)
  fallbackSpeechSynthesis(text, cleanLang, handleFinished);
}

function fallbackSpeechSynthesis(text, lang, onDone) {
  if (!window.speechSynthesis) {
    if (onDone) onDone();
    return;
  }
  try {
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance = utterance;

    const langMap = { ru: "ru-RU", uk: "uk-UA", en: "en-US", pl: "pl-PL", de: "de-DE", es: "es-ES" };
    utterance.lang = langMap[lang] || (lang === "ru" ? "ru-RU" : "uk-UA");
    utterance.rate = 0.95;

    utterance.onend = () => {
      activeUtterance = null;
      if (onDone) onDone();
    };
    utterance.onerror = () => {
      activeUtterance = null;
      if (onDone) onDone();
    };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("[TTS] Web Speech failed:", e);
    if (onDone) onDone();
  }
}

function initTranslatorScreen() {
  const sSelect = document.getElementById("translator-source-lang");
  const tSelect = document.getElementById("translator-target-lang");
  const swapBtn = document.getElementById("translator-swap-btn");
  const autoDialogBtn = document.getElementById("auto-dialog-btn");
  const foreignerOut = document.getElementById("foreigner-output-text");
  const userOut = document.getElementById("user-output-text");
  const userMicBtn = document.getElementById("user-mic-btn");
  const foreignerMicBtn = document.getElementById("foreigner-mic-btn");
  const userTtsBtn = document.getElementById("user-tts-btn");
  const foreignerTtsBtn = document.getElementById("foreigner-tts-btn");

  if (!userMicBtn || userMicBtn.dataset.bound) return;
  userMicBtn.dataset.bound = "true";

  // Auto-dialogue toggle handler
  autoDialogBtn?.addEventListener("click", () => {
    autoDialogEnabled = !autoDialogEnabled;
    if (autoDialogEnabled) {
      autoDialogBtn.classList.add("active");
      autoDialogBtn.textContent = "🔄 Авто-діалог: УВІМК";
      showToast("Режим авто-діалогу увімкнено! Черга переходитиме автоматично.");
      unlockAudioPlayback();
    } else {
      autoDialogBtn.classList.remove("active");
      autoDialogBtn.textContent = "🔄 Авто-діалог: ВИМК";
      stopAllAudio();
      stopCurrentRecognition();
    }
  });

  swapBtn?.addEventListener("click", () => {
    stopAllAudio();
    stopCurrentRecognition();
    const temp = sSelect.value === "auto" ? "ru" : sSelect.value;
    sSelect.value = tSelect.value;
    tSelect.value = temp;
    updateMicLabels();
  });

  function updateMicLabels() {
    const sName = sSelect?.options[sSelect.selectedIndex]?.text?.replace(/^[^\s]+\s/, "") || "своєю мовою";
    const tName = tSelect?.options[tSelect.selectedIndex]?.text?.replace(/^[^\s]+\s/, "") || "іноземною";
    const uLabel = document.getElementById("user-mic-label");
    const fLabel = document.getElementById("foreigner-mic-label");
    if (uLabel) uLabel.textContent = `Говорити (${sName})`;
    if (fLabel) fLabel.textContent = `Говорити (${tName})`;
  }

  sSelect?.addEventListener("change", updateMicLabels);
  tSelect?.addEventListener("change", updateMicLabels);
  updateMicLabels();

  let activeRecognition = null;
  let isListening = false;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  function stopCurrentRecognition() {
    if (activeRecognition) {
      try {
        activeRecognition.onresult = null;
        activeRecognition.onerror = null;
        activeRecognition.onend = null;
        activeRecognition.abort();
      } catch (e) {}
      activeRecognition = null;
    }
    isListening = false;
    document.querySelectorAll(".face-mic-btn").forEach((b) => b.classList.remove("recording"));
    document.querySelectorAll(".translator-half").forEach((c) => c.classList.remove("listening-card"));
  }

  async function translateAndDisplay(spokenText, fromLang, toLang, isUserSpeaker) {
    if (!spokenText || !spokenText.trim()) return;
    const cleanSpoken = spokenText.trim();
    try {
      if (isUserSpeaker) {
        if (userOut) userOut.textContent = `Ви: ${cleanSpoken}`;
        if (foreignerOut) foreignerOut.textContent = "⚡ Перекладаю...";
      } else {
        if (foreignerOut) foreignerOut.textContent = `Співрозмовник: ${cleanSpoken}`;
        if (userOut) userOut.textContent = "⚡ Перекладаю...";
      }

      // Fast direct backend call (<0.3s) - returns translation AND ready-to-play audioBase64
      const res = await apiFetch("/api/v1/translator/translate-text", {
        method: "POST",
        body: JSON.stringify({ text: cleanSpoken, source_lang: fromLang, target_lang: toLang })
      });

      const translatedText = res?.translated_text?.trim() || "";
      const audioBase64 = res?.audio_base64 || null;

      if (translatedText) {
        const nextSpeakerCallback = () => {
          if (!autoDialogEnabled) return;
          autoDialogTimer = setTimeout(() => {
            if (isUserSpeaker) {
              const sLang = sSelect.value === "auto" ? "ru" : sSelect.value;
              startSpeechRecognition(tSelect.value, sLang, false, foreignerMicBtn);
            } else {
              startSpeechRecognition(sSelect.value, tSelect.value, true, userMicBtn);
            }
          }, 350);
        };

        if (isUserSpeaker) {
          if (foreignerOut) foreignerOut.textContent = translatedText;
          speakText(translatedText, toLang, "translator-foreigner-card", audioBase64, nextSpeakerCallback);
        } else {
          if (userOut) userOut.textContent = translatedText;
          speakText(translatedText, toLang, "translator-user-card", audioBase64, nextSpeakerCallback);
        }
      }
    } catch (e) {
      showToast(`Помилка перекладу: ${e.message}`);
    }
  }

  function startSpeechRecognition(fromLang, toLang, isUserSpeaker, btnEl) {
    unlockAudioPlayback();

    // Toggle: if user taps the same button that is actively recording, stop it
    if (isListening && btnEl.classList.contains("recording")) {
      stopCurrentRecognition();
      return;
    }

    // Stop previous audio and recognition cleanly
    stopAllAudio();
    stopCurrentRecognition();

    if (SpeechRec) {
      const rec = new SpeechRec();
      activeRecognition = rec;
      rec.continuous = false;
      rec.interimResults = true;
      const langMap = { ru: "ru-RU", uk: "uk-UA", en: "en-US", pl: "pl-PL", de: "de-DE", es: "es-ES" };
      rec.lang = langMap[fromLang] || (fromLang === "ru" ? "ru-RU" : "uk-UA");

      const activeCard = isUserSpeaker ? document.getElementById("translator-user-card") : document.getElementById("translator-foreigner-card");
      if (activeCard) activeCard.classList.add("listening-card");

      rec.onstart = () => {
        isListening = true;
        btnEl.classList.add("recording");
      };

      rec.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentSpoken = (finalTranscript || interimTranscript).trim();
        if (currentSpoken) {
          if (isUserSpeaker && userOut) {
            userOut.textContent = `Ви: ${currentSpoken}`;
          } else if (!isUserSpeaker && foreignerOut) {
            foreignerOut.textContent = `Співрозмовник: ${currentSpoken}`;
          }
        }

        if (finalTranscript.trim()) {
          stopCurrentRecognition();
          translateAndDisplay(finalTranscript.trim(), fromLang, toLang, isUserSpeaker);
        }
      };

      rec.onerror = (e) => {
        console.warn("[Translator SpeechRec error]:", e.error);
        stopCurrentRecognition();
        if (e.error !== "no-speech" && e.error !== "aborted") {
          showToast("Не вдалося розпізнати мову. Спробуйте ще раз.");
        }
      };

      rec.onend = () => {
        stopCurrentRecognition();
      };

      // Resilient start for iOS WebKit (avoids InvalidStateError with retry)
      let attempt = 0;
      function attemptStart() {
        attempt++;
        try {
          rec.start();
        } catch (err) {
          if (attempt <= 3) {
            setTimeout(attemptStart, 120);
          } else {
            console.warn("[Translator] rec.start failed:", err);
            stopCurrentRecognition();
          }
        }
      }
      // Small 60ms delay ensures iOS audio session completely resets to Record
      setTimeout(attemptStart, 60);
    } else {
      const text = prompt("Введіть текст для перекладу:");
      if (text) translateAndDisplay(text, fromLang, toLang, isUserSpeaker);
    }
  }

  userMicBtn?.addEventListener("click", () => {
    startSpeechRecognition(sSelect.value, tSelect.value, true, userMicBtn);
  });

  foreignerMicBtn?.addEventListener("click", () => {
    const sLang = sSelect.value === "auto" ? "ru" : sSelect.value;
    startSpeechRecognition(tSelect.value, sLang, false, foreignerMicBtn);
  });

  userTtsBtn?.addEventListener("click", () => {
    unlockAudioPlayback();
    const raw = userOut?.textContent?.replace(/^Ви:\s*/, "")?.trim();
    if (raw && raw !== "Перекладаю...") {
      speakText(raw, sSelect.value === "auto" ? "ru" : sSelect.value, "translator-user-card");
    }
  });

  foreignerTtsBtn?.addEventListener("click", () => {
    unlockAudioPlayback();
    const raw = foreignerOut?.textContent?.replace(/^Співрозмовник:\s*/, "")?.trim();
    if (raw && raw !== "Перекладаю...") {
      speakText(raw, tSelect.value, "translator-foreigner-card");
    }
  });

  document.getElementById("open-google-app-btn")?.addEventListener("click", () => {
    const sl = sSelect.value === "auto" ? "auto" : sSelect.value;
    const tl = tSelect.value;
    showToast("В Google Translate натисніть внизу «Спілкування» (або Conversation) ➔ «Авто» для режиму на столі!", 4500);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      window.location.href = `googletranslate://?sl=${sl}&tl=${tl}`;
      setTimeout(() => {
        window.open(`https://translate.google.com/?sl=${sl}&tl=${tl}&op=translate`, "_blank");
      }, 1500);
    } else {
      window.open(`https://translate.google.com/?sl=${sl}&tl=${tl}&op=translate`, "_blank");
    }
  });
}

function initStep5Handlers() {
  initUndoBanner();
  initDelegationModal();
  initTranslatorScreen();
}

// ==========================================================================
// --- Step 6: Blood Pressure & Vitals Health Journal ---
// ==========================================================================
let vitalsSelectedDays = 90;
let bpChartInstance = null;
let bpModalChartInstance = null;
let lastLoadedVitalsLogs = [];

async function loadVitals() {
  const avgEl = document.getElementById("stat-bp-avg");
  const rangeEl = document.getElementById("stat-bp-range");
  const pulseEl = document.getElementById("stat-bp-pulse");
  const normPctEl = document.getElementById("stat-bp-norm-pct");
  const totalCountEl = document.getElementById("stat-bp-total-count");
  const morningAvgEl = document.getElementById("stat-bp-morning-avg");
  const eveningAvgEl = document.getElementById("stat-bp-evening-avg");
  const correlationsCard = document.getElementById("bp-correlations-card");
  const correlationsList = document.getElementById("bp-correlations-list");
  const logsContainer = document.getElementById("bp-logs-container");
  const tableCountLabel = document.getElementById("bp-table-count-label");

  try {
    const [analytics, logs] = await Promise.all([
      apiFetch(`/api/v1/vitals/bp/analytics?days=${vitalsSelectedDays}`),
      apiFetch(`/api/v1/vitals/bp?days=${vitalsSelectedDays}`),
    ]);

    if (!analytics || !logs) return;
    lastLoadedVitalsLogs = logs;

    // 1. Stats Cards
    if (analytics.total_readings > 0) {
      if (avgEl) avgEl.textContent = `${analytics.avg_systolic} / ${analytics.avg_diastolic}`;
      if (rangeEl) rangeEl.textContent = `Мін: ${analytics.min_systolic}/${analytics.min_diastolic} • Макс: ${analytics.max_systolic}/${analytics.max_diastolic}`;
      if (pulseEl) pulseEl.textContent = analytics.avg_pulse ? `${analytics.avg_pulse} уд/хв` : "—";
      if (normPctEl) normPctEl.textContent = `${analytics.normal_percentage}% в нормі (SYS<130, DIA<85)`;
      if (totalCountEl) totalCountEl.textContent = `${analytics.total_readings} вимірів`;

      if (morningAvgEl) {
        morningAvgEl.textContent = analytics.morning_avg
          ? `${analytics.morning_avg.systolic} / ${analytics.morning_avg.diastolic} (${analytics.morning_avg.count})`
          : "— / —";
      }
      if (eveningAvgEl) {
        eveningAvgEl.textContent = analytics.evening_avg
          ? `${analytics.evening_avg.systolic} / ${analytics.evening_avg.diastolic} (${analytics.evening_avg.count})`
          : "— / —";
      }
    } else {
      if (avgEl) avgEl.textContent = "— / —";
      if (rangeEl) rangeEl.textContent = "Немає даних за цей період";
      if (pulseEl) pulseEl.textContent = "—";
      if (normPctEl) normPctEl.textContent = "0 вимірів";
      if (totalCountEl) totalCountEl.textContent = "0 вимірів";
      if (morningAvgEl) morningAvgEl.textContent = "— / —";
      if (eveningAvgEl) eveningAvgEl.textContent = "— / —";
    }

    if (tableCountLabel) {
      tableCountLabel.textContent = `Всього вимірів: ${logs.length}`;
    }

    // 2. Lifestyle Correlations
    if (correlationsCard && correlationsList) {
      const corrs = analytics.lifestyle_correlations || [];
      if (corrs.length > 0) {
        correlationsCard.classList.remove("hidden");
        correlationsList.innerHTML = corrs.map(c => {
          const sign = c.delta > 0 ? `+${c.delta}` : `${c.delta}`;
          const color = c.impact === "negative" ? "#ff453a" : (c.impact === "positive" ? "#30d158" : "var(--text-muted)");
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;">
              <span><strong>${escapeHtml(c.factor)}</strong> (${c.count} вимірів)</span>
              <span style="font-weight:700;color:${color};">${sign} мм рт. ст. (середній: ${c.avg_systolic})</span>
            </div>
          `;
        }).join("");
      } else {
        correlationsCard.classList.add("hidden");
      }
    }

    // 3. Render Chart
    renderBpChart(logs);

    // 4. Render Table / List
    if (logsContainer) {
      if (logs.length === 0) {
        logsContainer.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🩺</span>
            <p>За вибраний період немає вимірювань тиску.</p>
            <p style="font-size:0.8rem;color:var(--text-muted);">Скористайтеся формою швидкого запису вище або скажіть: «Давление 120 на 80 пульс 70».</p>
          </div>
        `;
        return;
      }

      const todIcons = { morning: "☀️ Ранок", afternoon: "🌤️ День", evening: "🌙 Вечір", night: "🌌 Ніч" };

      logsContainer.innerHTML = logs.map(l => {
        const dt = new Date(l.recorded_at);
        const dateStr = dt.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
        const timeStr = dt.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
        const todText = todIcons[l.time_of_day] || l.time_of_day;
        const notesText = [l.medications_taken ? `💊 ${l.medications_taken}` : "", l.notes ? `📝 ${l.notes}` : ""].filter(Boolean).join(" • ");

        return `
          <div class="bp-log-card" data-id="${l.id}">
            <div class="bp-log-left">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="bp-reading-val" style="color:${l.color || 'var(--text-main)'};">${l.systolic} / ${l.diastolic}</span>
                <span class="item-badge" style="background:${l.color}22;color:${l.color};border:1px solid ${l.color}44;font-size:0.75rem;">${escapeHtml(l.classification)}</span>
                ${l.pulse ? `<span class="bp-pulse-val">💓 ${l.pulse}</span>` : ""}
              </div>
              <div style="font-size:0.78rem;color:var(--text-muted);display:flex;gap:6px;margin-top:2px;">
                <span>📅 ${dateStr} ${timeStr}</span>
                <span>• ${todText}</span>
              </div>
              ${notesText ? `<div style="font-size:0.8rem;color:var(--text-main);margin-top:3px;">${escapeHtml(notesText)}</div>` : ""}
            </div>
            <button class="delete-bp-btn icon-btn-danger" data-id="${l.id}" title="Видалити замір" style="background:transparent;border:none;color:#ff453a;cursor:pointer;padding:6px;">
              🗑️
            </button>
          </div>
        `;
      }).join("");

      // Bind delete buttons
      logsContainer.querySelectorAll(".delete-bp-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (confirm("Видалити цей запис тиску?")) {
            try {
              await apiFetch(`/api/v1/vitals/bp/${id}`, { method: "DELETE" });
              showToast("Запис видалено");
              loadVitals();
            } catch (err) {
              showToast(`Помилка: ${err.message}`);
            }
          }
        });
      });
    }

  } catch (err) {
    console.error("[Vitals] Load failed:", err);
  }
}

function createBpChartConfig(chronLogs, isFullscreen) {
  const labels = chronLogs.map(l => {
    const dt = new Date(l.recorded_at);
    return `${dt.getDate()}.${dt.getMonth() + 1} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}`;
  });

  const sysData = chronLogs.map(l => l.systolic);
  const diaData = chronLogs.map(l => l.diastolic);
  const pulseData = chronLogs.map(l => l.pulse || null);

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const textColor = isDark ? "#8e9bb0" : "#555";
  const pointRad = isFullscreen ? 5 : (chronLogs.length > 25 ? 3 : 4);

  return {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Систолічний (SYS)",
          data: sysData,
          borderColor: "#ff453a",
          backgroundColor: "rgba(255, 69, 58, 0.12)",
          borderWidth: isFullscreen ? 3 : 2.5,
          tension: 0.25,
          pointRadius: pointRad,
          pointHoverRadius: 7,
          pointBackgroundColor: "#ff453a",
        },
        {
          label: "Діастолічний (DIA)",
          data: diaData,
          borderColor: "#0a84ff",
          backgroundColor: "rgba(10, 132, 255, 0.1)",
          borderWidth: isFullscreen ? 3 : 2.5,
          tension: 0.25,
          pointRadius: pointRad,
          pointHoverRadius: 7,
          pointBackgroundColor: "#0a84ff",
        },
        {
          label: "Пульс (BPM)",
          data: pulseData,
          borderColor: "#af52de",
          borderDash: [4, 4],
          borderWidth: 2,
          tension: 0.25,
          pointRadius: pointRad > 2 ? pointRad - 1 : 2,
          pointHoverRadius: 6,
          pointBackgroundColor: "#af52de",
          yAxisID: "y1",
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: textColor,
            boxWidth: 14,
            font: { size: isFullscreen ? 13 : 11 }
          }
        },
        tooltip: {
          backgroundColor: isDark ? "#1b2234" : "#ffffff",
          titleColor: isDark ? "#ffffff" : "#111111",
          bodyColor: isDark ? "#e0e6ed" : "#333333",
          borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            afterBody: function(items) {
              if (!items || items.length === 0) return "";
              const idx = items[0].dataIndex;
              const log = chronLogs[idx];
              if (!log) return "";
              const lines = [];
              if (log.medications_taken) lines.push(`💊 ${log.medications_taken}`);
              if (log.notes) lines.push(`📝 ${log.notes}`);
              return lines.length ? "\n" + lines.join("\n") : "";
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: isFullscreen ? 11 : 9 }, maxRotation: 45 }
        },
        y: {
          min: 40,
          max: 200,
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: isFullscreen ? 12 : 10 } },
          title: { display: true, text: "мм рт. ст.", color: textColor, font: { size: 10 } }
        },
        y1: {
          position: "right",
          min: 40,
          max: 160,
          grid: { drawOnChartArea: false },
          ticks: { color: "#af52de", font: { size: isFullscreen ? 12 : 10 } },
          title: { display: true, text: "уд/хв", color: "#af52de", font: { size: 10 } }
        }
      }
    }
  };
}

function renderBpChart(logs) {
  const canvas = document.getElementById("bp-chart");
  const scroller = document.getElementById("bp-chart-scroller");
  const viewport = document.getElementById("bp-chart-viewport");
  if (!canvas) return;

  if (bpChartInstance) {
    bpChartInstance.destroy();
    bpChartInstance = null;
  }

  if (!window.Chart) {
    console.warn("[Chart.js] Not loaded yet.");
    return;
  }

  if (!logs || logs.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const chronLogs = [...logs].reverse();

  // Dynamic horizontal scroll on phone for 3 months
  if (scroller && viewport) {
    if (chronLogs.length > 15) {
      const neededWidth = Math.max(viewport.clientWidth, chronLogs.length * 28);
      scroller.style.width = `${neededWidth}px`;
      setTimeout(() => {
        viewport.scrollLeft = viewport.scrollWidth;
      }, 60);
    } else {
      scroller.style.width = "100%";
    }
  }

  const config = createBpChartConfig(chronLogs, false);
  bpChartInstance = new window.Chart(canvas, config);

  const modal = document.getElementById("bp-chart-modal");
  if (modal && !modal.classList.contains("hidden")) {
    renderBpModalChart(logs);
  }
}

function renderBpModalChart(logs) {
  const canvas = document.getElementById("bp-modal-chart");
  const scroller = document.getElementById("bp-modal-scroller");
  const viewport = document.getElementById("bp-modal-viewport");
  if (!canvas || !window.Chart) return;

  if (bpModalChartInstance) {
    bpModalChartInstance.destroy();
    bpModalChartInstance = null;
  }

  if (!logs || logs.length === 0) return;

  const chronLogs = [...logs].reverse();
  if (scroller && viewport) {
    const isMobile = window.innerWidth < 640;
    const step = isMobile ? 22 : 36;
    const neededWidth = Math.max(viewport.clientWidth, chronLogs.length * step);
    scroller.style.width = `${neededWidth}px`;
    setTimeout(() => {
      viewport.scrollLeft = viewport.scrollWidth;
    }, 60);
  }

  const config = createBpChartConfig(chronLogs, true);
  bpModalChartInstance = new window.Chart(canvas, config);
}

function initVitalsScreen() {
  const todPills = document.querySelectorAll("#bp-tod-group .tod-pill");
  let selectedTod = "morning";

  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) selectedTod = "morning";
  else if (hour >= 12 && hour < 17) selectedTod = "afternoon";
  else if (hour >= 17 && hour < 23) selectedTod = "evening";
  else selectedTod = "night";

  todPills.forEach(p => {
    if (p.dataset.tod === selectedTod) p.classList.add("active");
    else p.classList.remove("active");

    p.addEventListener("click", () => {
      todPills.forEach(btn => btn.classList.remove("active"));
      p.classList.add("active");
      selectedTod = p.dataset.tod;
    });
  });

  const factorPills = document.querySelectorAll("#bp-factors-group .factor-pill");
  factorPills.forEach(pill => {
    pill.addEventListener("click", () => {
      pill.classList.toggle("active");
    });
  });

  const saveBtn = document.getElementById("bp-quick-save-btn");
  saveBtn?.addEventListener("click", async () => {
    const sysInput = document.getElementById("bp-input-systolic");
    const diaInput = document.getElementById("bp-input-diastolic");
    const pulseInput = document.getElementById("bp-input-pulse");
    const notesInput = document.getElementById("bp-input-notes");

    const sys = parseInt(sysInput?.value);
    const dia = parseInt(diaInput?.value);
    const pulse = pulseInput?.value ? parseInt(pulseInput.value) : null;

    if (!sys || !dia || sys < 50 || dia < 30) {
      showToast("Введіть коректні значення тиску (SYS і DIA)!");
      return;
    }

    const selectedFactors = Array.from(document.querySelectorAll("#bp-factors-group .factor-pill.active"))
      .map(b => b.dataset.factor);
    const rawNotes = notesInput?.value?.trim() || "";
    const combinedNotes = [...selectedFactors, rawNotes].filter(Boolean).join(", ");

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Зберігаю...";

      await apiFetch("/api/v1/vitals/bp", {
        method: "POST",
        body: JSON.stringify({
          systolic: sys,
          diastolic: dia,
          pulse: pulse,
          time_of_day: selectedTod,
          notes: combinedNotes || null
        })
      });

      showToast(`✅ Замір ${sys}/${dia} збережено!`);
      if (notesInput) notesInput.value = "";
      factorPills.forEach(p => p.classList.remove("active"));
      loadVitals();
    } catch (err) {
      showToast(`Помилка: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Зберегти";
    }
  });

  // Range buttons synced across main card and fullscreen modal
  const rangeBtns = document.querySelectorAll(".bp-range-btn");
  rangeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const days = parseInt(btn.dataset.days) || 90;
      rangeBtns.forEach(b => {
        if (parseInt(b.dataset.days) === days) b.classList.add("active");
        else b.classList.remove("active");
      });
      vitalsSelectedDays = days;
      loadVitals();
    });
  });

  // Fullscreen Modal Controls
  const expandBtn = document.getElementById("bp-chart-expand-btn");
  const modal = document.getElementById("bp-chart-modal");
  const modalCloseBtn = document.getElementById("bp-chart-modal-close-btn");
  const modalBottomCloseBtn = document.getElementById("bp-chart-modal-bottom-close-btn");

  const closeBpModal = () => {
    modal?.classList.add("hidden");
    if (bpModalChartInstance) {
      bpModalChartInstance.destroy();
      bpModalChartInstance = null;
    }
  };

  expandBtn?.addEventListener("click", () => {
    modal?.classList.remove("hidden");
    renderBpModalChart(lastLoadedVitalsLogs);
  });

  modalCloseBtn?.addEventListener("click", closeBpModal);
  modalBottomCloseBtn?.addEventListener("click", closeBpModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeBpModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeBpModal();
    }
  });

  document.getElementById("export-bp-csv-btn")?.addEventListener("click", () => {
    const keyParam = state.secretKey ? `&key=${encodeURIComponent(state.secretKey)}` : "";
    const exportUrl = `${state.serverUrl}/api/v1/vitals/bp/export?days=${vitalsSelectedDays}${keyParam}`;
    const link = document.createElement("a");
    link.href = exportUrl;
    link.setAttribute("download", `blood_pressure_journal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("📥 Завантаження таблиці тиску CSV розпочато...");
  });

  document.getElementById("scroll-to-bp-form-btn")?.addEventListener("click", () => {
    document.getElementById("bp-quick-input-card")?.scrollIntoView({ behavior: "smooth" });
  });
}

// --- Offline Listener ---
function initNetworkListeners() {
  const banner = document.getElementById("offline-banner");
  window.addEventListener("online", () => {
    banner.classList.add("hidden");
    checkHealth();
  });
  window.addEventListener("offline", () => {
    banner.classList.remove("hidden");
    updateStatus("offline");
  });
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initVoice();
  initTextInput();
  initTabs();
  initSettingsModal();
  initManualAddModal();
  initStep2Handlers();
  initStep3Handlers();
  initStep5Handlers();
  initVitalsScreen();
  initNetworkListeners();
  checkHealth();
  checkSystemFeatures();
  loadFeed();
});
