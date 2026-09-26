// ===================================================
// Мой Секретарь — Frontend Application Logic
// ===================================================

const state = {
  activeTab: "feed",
  secretKey: localStorage.getItem("secret_key") || "",
  serverUrl: localStorage.getItem("server_url") || window.location.origin,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  recordInterval: null,
  recordStartTime: null,
};

// --- Service Worker Registration ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
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
  const pulseRing = document.getElementById("pulse-ring");
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

      // Determine supported MIME type
      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/aac")) {
          mimeType = "audio/aac";
        }
      }

      state.mediaRecorder = new MediaRecorder(stream, { credentials: mimeType });

      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          state.audioChunks.push(e.data);
        }
      };

      state.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(state.audioChunks, { type: mimeType });
        await uploadAudio(audioBlob, mimeType);
      };

      state.mediaRecorder.start();
      state.isRecording = true;

      micBtn.classList.add("recording");
      pulseRing.classList.add("active");
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
      console.error("Microphone access denied:", err);
      statusText.textContent = "Ошибка: доступ к микрофону заблокирован";
      showToast("❌ Разрешите доступ к микрофону в браузере");
    }
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }
    state.isRecording = false;
    micBtn.classList.remove("recording");
    pulseRing.classList.remove("active");
    clearInterval(state.recordInterval);
    timerEl.classList.add("hidden");
    statusText.textContent = "Обрабатываю запись через Gemini AI...";
  }

  async function uploadAudio(blob, mimeType) {
    const formData = new FormData();
    formData.append("audio", blob, "voice_record.webm");

    try {
      const data = await apiFetch("/api/process/audio", {
        method: "POST",
        body: formData,
      });

      if (data) {
        statusText.textContent = "Нажмите и говорите или введите текст";
        showToast(`✅ ${data.summary}`);
        reloadCurrentTab();
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
        reloadCurrentTab();
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
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

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
    case "inventory":
      loadInventory();
      break;
    case "auto":
      loadAuto();
      break;
    case "utilities":
      loadUtilities();
      break;
    case "agent":
      document.getElementById("agent-query-input")?.focus();
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
            <span class="item-subtitle">${escapeHtml(i.quantity)} • ${escapeHtml(i.category)}</span>
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
      list.innerHTML = `<div class="empty-state"><p>Нет активных задач</p></div>`;
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

        return `
          <div class="item-card">
            <button class="custom-checkbox ${t.is_completed ? "checked" : ""}" onclick="toggleTask(${t.id})">
              ✓
            </button>
            <div class="item-content">
              <span class="item-title ${t.is_completed ? "completed" : ""}">${escapeHtml(t.title)}</span>
              <span class="item-subtitle">📅 ${dueStr} • ${escapeHtml(t.category)}</span>
              <span class="item-badge badge-tasks">Приоритет: ${t.priority}</span>
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

// 5. Media Notes
async function loadMedia() {
  const list = document.getElementById("media-list");
  try {
    const notes = await apiFetch("/api/media_notes");
    if (!notes || notes.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>Заметок пока нет</p></div>`;
      return;
    }

    const typeIcons = {
      movie: "🎬 Фильм",
      series: "📺 Сериал",
      book: "📚 Книга",
      podcast: "🎧 Подкаст",
      article: "📰 Статья",
      note: "📝 Заметка",
    };

    list.innerHTML = notes
      .map(
        (m) => `
        <div class="item-card">
          <div class="item-content">
            <span class="item-title ${m.status === "completed" ? "completed" : ""}">${escapeHtml(m.title)}</span>
            <span class="item-subtitle">${escapeHtml(m.author_creator || m.comment || "")}</span>
            ${m.url ? `<a href="${escapeHtml(m.url)}" target="_blank" class="item-subtitle" style="color:var(--primary)">🔗 Открыть ссылку</a>` : ""}
            <span class="item-badge badge-media">${typeIcons[m.type] || m.type}</span>
          </div>
          <div class="item-actions">
            <button class="custom-checkbox ${m.status === "completed" ? "checked" : ""}" onclick="toggleMedia(${m.id})">✓</button>
            <button class="delete-btn" onclick="deleteItem('media_notes', ${m.id})" title="Удалить">🗑️</button>
          </div>
        </div>`
      )
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Ошибка загрузки заметок</p></div>`;
// 6. Inventory (Where is what)
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
    loadMedia();
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

  openBtn.addEventListener("click", () => {
    serverInput.value = state.serverUrl;
    secretInput.value = state.secretKey;
    resultText.textContent = "";
    modal.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

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
      titleEl.textContent = "Добавить задачу";
      fieldsEl.innerHTML = `
        <label>Название задачи:</label>
        <input type="text" name="title" required placeholder="Позвонить в банк" />
        <label>Срок выполнения:</label>
        <input type="datetime-local" name="due_date" />
        <label>Приоритет:</label>
        <select name="priority">
          <option value="low">Низкий</option>
          <option value="medium" selected>Средний</option>
          <option value="high">Высокий</option>
        </select>
      `;
    } else if (domain === "media") {
      titleEl.textContent = "Добавить медиа или заметку";
      fieldsEl.innerHTML = `
        <label>Название:</label>
        <input type="text" name="title" required placeholder="Интерстеллар / Атомные привычки" />
        <label>Тип:</label>
        <select name="type">
          <option value="movie">Фильм</option>
          <option value="series">Сериал</option>
          <option value="book">Книга</option>
          <option value="podcast">Подкаст</option>
          <option value="article">Статья</option>
          <option value="note">Заметка</option>
        </select>
        <label>Автор / Режиссер:</label>
        <input type="text" name="author_creator" placeholder="Кристофер Нолан" />
        <label>Ссылка (если есть):</label>
        <input type="url" name="url" placeholder="https://..." />
        <label>Заметка / Отзыв:</label>
        <textarea name="comment" rows="2" placeholder="Хочу посмотреть на выходных"></textarea>
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

  // 3. Web Search Agent
  const agentForm = document.getElementById("agent-search-form");
  const agentInput = document.getElementById("agent-query-input");
  const agentLoader = document.getElementById("agent-loading");
  const agentCard = document.getElementById("agent-response-card");
  const agentQueryEl = document.getElementById("agent-res-query");
  const agentAnswerEl = document.getElementById("agent-res-answer");
  const agentSourcesBox = document.getElementById("agent-res-sources");
  const agentSourcesList = document.getElementById("agent-sources-list");

  agentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = agentInput.value.trim();
    if (!query) return;

    agentLoader.classList.remove("hidden");
    agentCard.classList.add("hidden");

    try {
      const res = await apiFetch("/api/v1/agent/ask", {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      agentLoader.classList.add("hidden");
      agentCard.classList.remove("hidden");
      agentQueryEl.textContent = res.query;
      agentAnswerEl.textContent = res.answer;

      if (res.sources && res.sources.length > 0) {
        agentSourcesBox.classList.remove("hidden");
        agentSourcesList.innerHTML = res.sources
          .map(
            (s) =>
              `<a href="${escapeHtml(s.url)}" target="_blank" class="item-badge badge-media" style="text-decoration:none;">🔗 ${escapeHtml(s.title || "Джерело")}</a>`
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
  initNetworkListeners();
  checkHealth();
  loadFeed();
});
