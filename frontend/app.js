// ===================================================
// Мой Секретарь — Frontend Application Logic
// ===================================================

const urlParams = new URLSearchParams(window.location.search);
const initialKey = urlParams.get("token") || urlParams.get("key") || localStorage.getItem("secret_key") || "";
if (urlParams.get("token") || urlParams.get("key")) {
  localStorage.setItem("secret_key", initialKey);
}
const initialUser = urlParams.get("user") || localStorage.getItem("secretary_user") || "admin";
if (urlParams.get("user")) {
  localStorage.setItem("secretary_user", initialUser);
}

// Strip sensitive key/token from browser address bar immediately to prevent history/referrer leakage
if (urlParams.has("key") || urlParams.has("secret") || urlParams.has("token")) {
  urlParams.delete("key");
  urlParams.delete("secret");
  urlParams.delete("token");
  const cleanSearch = urlParams.toString();
  const cleanUrl = window.location.pathname + (cleanSearch ? "?" + cleanSearch : "") + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);
}

const state = {
  activeTab: "feed",
  secretKey: initialKey,
  currentUser: initialUser,
  serverUrl: localStorage.getItem("server_url") || window.location.origin,
  preferredCurrency: localStorage.getItem("preferred_currency") || "₴",
  preferredLanguage: localStorage.getItem("preferred_language") || "uk",
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  recordInterval: null,
  recordStartTime: null,
};


// --- Service Worker Registration with Safe Auto-Update & Hard-Cache Flush ---
const APP_VERSION = "3.7.27";
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // If version changed, purge old caches to prevent stale script/audio issues on iPhone
    if (localStorage.getItem("secretary_sw_version") !== APP_VERSION) {
      localStorage.setItem("secretary_sw_version", APP_VERSION);
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key !== `my-secretary-v${APP_VERSION}`) {
              caches.delete(key);
            }
          });
        });
      }
    }

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker
      .register(`/sw.js?v=${APP_VERSION}`)
      .then((reg) => {
        reg.update().catch(() => {});
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
  if (state.currentUser) {
    headers["X-Secretary-User"] = state.currentUser;
  }


  // Set Content-Type only if not FormData
  const isFormData = (typeof FormData !== "undefined" && options.body instanceof FormData) ||
                     (options.body && typeof options.body.append === "function") ||
                     (options.body && Object.prototype.toString.call(options.body) === "[object FormData]");

  if (isFormData) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  } else if (!headers["Content-Type"]) {
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

// Global App Force-Update function
async function forceAppUpdate() {
  try {
    localStorage.removeItem("secretary_sw_version");
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch (e) {
    console.warn("Update error:", e);
  }
  const keyParam = state.secretKey ? `key=${encodeURIComponent(state.secretKey)}` : "";
  const tParam = `_force=${Date.now()}`;
  const queryStr = [keyParam, tParam].filter(Boolean).join("&");
  window.location.replace(`${window.location.origin}/?${queryStr}`);
}

function showAppUpdatePrompt(newVer) {
  if (document.getElementById("pwa-update-banner")) return;
  const banner = document.createElement("div");
  banner.id = "pwa-update-banner";
  banner.className = "pwa-update-banner";
  banner.innerHTML = `
    <span>🚀 Доступне оновлення <b>v${newVer}</b>!</span>
    <button id="pwa-quick-update-btn" class="pwa-update-btn">🔄 Оновити зараз</button>
  `;
  document.body.appendChild(banner);
  document.getElementById("pwa-quick-update-btn")?.addEventListener("click", () => {
    banner.innerHTML = `<span>⏳ Оновлення додатку...</span>`;
    forceAppUpdate();
  });
}

// Check initial health
async function checkHealth() {
  try {
    const data = await apiFetch("/health");
    if (data && data.status === "online") {
      updateStatus("online");
      if (data.version && data.version !== APP_VERSION) {
        console.warn(`[App] Update detected: server ${data.version}, client ${APP_VERSION}`);
        showAppUpdatePrompt(data.version);
      }
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
  const voiceHeroCard = document.getElementById("voice-hero-card");
  const pulseRings = document.querySelectorAll(".mic-pulse-ring");
  const statusText = document.getElementById("voice-status-text");
  const timerEl = document.getElementById("recording-timer");

  // Tap anywhere on the wide ergonomic card for effortless dictation
  if (voiceHeroCard) {
    voiceHeroCard.addEventListener("click", (e) => {
      if (e.target.closest("#mic-btn")) return; // already handled by micBtn listener
      micBtn?.click();
    });
  }

  micBtn.addEventListener("click", async () => {
    // Warm up audio element for iOS Safari autoplay permissions
    const musicAudio = document.getElementById("global-music-audio");
    if (musicAudio && !state.isRecording) {
      try { musicAudio.load(); } catch (e) {}
    }

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
      voiceHeroCard?.classList.add("recording");
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
      const isHttps = window.isSecureContext && window.location.protocol === "https:";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        statusText.textContent = "Доступ к микрофону заблокирован";
        showToast("❌ Разрешите микрофон: в Safari кнопка «аА» слева вверху → Настройки веб-сайта → Микрофон: Разрешить");
      } else if (!isHttps) {
        statusText.textContent = `Требуется HTTPS (сейчас: ${window.location.protocol}//${window.location.host})`;
        showToast(`⚠️ Вы открыли сайт по ${window.location.protocol}//! Удалите старый ярлык и откройте ссылку с https://`);
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
    voiceHeroCard?.classList.remove("recording");
    clearInterval(state.recordInterval);
    timerEl.classList.add("hidden");
    statusText.textContent = "Обрабатываю запись через Gemini AI...";
  }

  async function uploadAudio(blob, mimeType) {
    const formData = new FormData();
    const ext = mimeType.includes("mp4") ? "mp4" : (mimeType.includes("aac") ? "aac" : (mimeType.includes("wav") ? "wav" : "webm"));
    formData.append("audio", blob, `voice_record.${ext}`);
    if (state.currentTab) {
      formData.append("current_tab", state.currentTab);
    }

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
        if (data.created?.music?.length > 0) {
          window.switchToTab("music");
          const createdTrack = data.created.music[0];
          if (typeof loadMusicTab === "function") {
            loadMusicTab().then(() => {
              if (createdTrack?.id && typeof playTrackById === "function") {
                playTrackById(createdTrack.id);
              }
            });
          }
          if (createdTrack && typeof window.playTrack === "function") {
            window.playTrack(createdTrack, [createdTrack, ...(window.musicState?.tracks || [])]);
          }
        } else if (data.created?.movies?.length > 0) {
          window.switchToTab("movies");
          if (data.created.movies[0]?.movie_info) {
            renderMovieResult(data.created.movies[0].movie_info);
            document.getElementById("movie-result-card")?.classList.remove("hidden");
          }
        } else if (data.created?.business?.length > 0) {
          window.switchToTab("business");
          if (typeof window.loadBusinessTab === "function") window.loadBusinessTab();
        } else if (state.activeTab === "mailbox" || (data.summary && (data.summary.toLowerCase().includes("почт") || data.summary.toLowerCase().includes("спам") || data.summary.toLowerCase().includes("скриньк")))) {
          window.switchToTab("mailbox");
          if (typeof window.loadMailboxTab === "function") window.loadMailboxTab();
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
        body: JSON.stringify({
          text,
          current_tab: state.currentTab
        }),
      });

      if (data) {
        statusText.textContent = "Нажмите и говорите или введите текст";
        showToast(`✅ ${data.summary}`);
        playSuccessChime();
        showUndoBanner(data.summary);
        if (data.created?.music?.length > 0) {
          window.switchToTab("music");
          loadMusicTab();
          if (data.created.music[0]?.id) {
            setTimeout(() => playTrackById(data.created.music[0].id), 500);
          }
        } else if (data.created?.movies?.length > 0) {
          window.switchToTab("movies");
          if (data.created.movies[0]?.movie_info) {
            renderMovieResult(data.created.movies[0].movie_info);
            document.getElementById("movie-result-card")?.classList.remove("hidden");
          }
        } else if (data.created?.business?.length > 0) {
          window.switchToTab("business");
          if (typeof window.loadBusinessTab === "function") window.loadBusinessTab();
        } else if (state.activeTab === "mailbox" || (data.summary && (data.summary.toLowerCase().includes("почт") || data.summary.toLowerCase().includes("спам") || data.summary.toLowerCase().includes("скриньк")))) {
          window.switchToTab("mailbox");
          if (typeof window.loadMailboxTab === "function") window.loadMailboxTab();
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

  // Account nav tab listener -> opens settings & account modal
  const accountBtn = document.getElementById("tab-btn-account");
  if (accountBtn) {
    accountBtn.addEventListener("click", () => {
      document.getElementById("settings-open-btn")?.click();
    });
  }

  // Update account label with current user phone if saved
  function refreshAccountBadge() {
    const userPhone = localStorage.getItem("secretary_user_phone") || localStorage.getItem("secretary_phone");
    const accLabel = document.getElementById("nav-account-label");
    if (accLabel && userPhone) {
      const cleanPhone = userPhone.replace(/\D/g, "");
      const shortPhone = cleanPhone.length > 4 ? `+..${cleanPhone.slice(-4)}` : userPhone;
      accLabel.textContent = shortPhone;
    }
  }
  refreshAccountBadge();

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
    case "business":
      if (typeof window.loadBusinessTab === "function") window.loadBusinessTab();
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
    case "music":
      loadMusicTab();
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
      if (typeof window.loadAgentTab === "function") window.loadAgentTab();
      document.getElementById("ai-chat-input")?.focus();
      break;
    case "translator":
      initTranslatorScreen();
      break;
    case "mailbox":
      if (typeof window.loadMailboxTab === "function") window.loadMailboxTab();
      break;
    case "vault":
      if (typeof window.loadVaultTab === "function") window.loadVaultTab();
      break;
  }
}

// Dynamic updater for Dashboard Bento Grid (Music, Business, Vault, Shopping)
async function updateDashboardBento() {
  try {
    // 1. Music live track
    if (window.musicState) {
      const trackName = document.getElementById("bento-track-name");
      const trackSub = document.getElementById("bento-track-sub");
      const playBtn = document.getElementById("bento-music-play-btn");
      if (window.musicState.currentTrack) {
        if (trackName) trackName.textContent = window.musicState.currentTrack.title || "Трек";
        if (trackSub) trackSub.textContent = window.musicState.currentTrack.artist || "Музыка";
      } else {
        if (trackName) trackName.textContent = "Нажмите для воспроизведения";
      }
      if (playBtn) {
        playBtn.textContent = window.musicState.isPlaying ? "⏸" : "▶";
      }
    }

    // 2. Business Balance
    const bizBalEl = document.getElementById("bento-biz-balance");
    if (bizBalEl) {
      try {
        const balData = await apiFetch("/api/v1/business/balance");
        if (balData && typeof balData.balance !== "undefined") {
          const cur = balData.currency || "₴";
          bizBalEl.textContent = `${cur} ${Number(balData.balance).toLocaleString("uk-UA")}`;
        }
      } catch (e) {}
    }

    // 3. Vault & Notes Preview
    try {
      const vaultData = await apiFetch("/api/v1/vault");
      if (vaultData && Array.isArray(vaultData.items)) {
        const vCount = document.getElementById("bento-vault-count");
        if (vCount) vCount.textContent = `${vaultData.items.length} зам.`;
        const vPrev = document.getElementById("bento-vault-preview");
        if (vPrev && vaultData.items.length > 0) {
          const top2 = vaultData.items.slice(0, 2);
          vPrev.innerHTML = top2.map(item => `<div class="bento-check-item">• ${item.title || item.category || "Заметка"}</div>`).join("");
        }
      }
    } catch (e) {}

    // 4. Shopping List Preview
    try {
      const shopItems = await apiFetch("/api/shopping");
      if (shopItems && Array.isArray(shopItems)) {
        const activeItems = shopItems.filter(i => !i.is_bought);
        const shopCount = document.getElementById("bento-shop-count");
        if (shopCount) shopCount.textContent = `${activeItems.length} поз.`;
        const shopPrev = document.getElementById("bento-shop-preview");
        if (shopPrev && activeItems.length > 0) {
          const top2 = activeItems.slice(0, 2);
          shopPrev.innerHTML = top2.map(i => `<div class="bento-check-item">• ${i.name || "Товар"}</div>`).join("");
        }
      }
    } catch (e) {}
  } catch (err) {
    console.warn("[Dashboard Bento] update error:", err);
  }
}
window.updateDashboardBento = updateDashboardBento;

// --- Data Renderers ---

// 1. Feed & Dashboard
async function loadFeed() {
  updateDashboardBento();
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
        const dateStr = new Date(item.created_at).toLocaleString("uk-UA", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        const isVault = item.domain === "vault";
        const clickAttr = isVault ? `onclick="window.switchToTab('vault')"` : "";
        const cardStyle = isVault ? `style="cursor:pointer;"` : "";

        return `
          <div class="item-card" ${clickAttr} ${cardStyle}>
            <div class="item-content">
              <span class="item-title ${item.is_completed ? "completed" : ""}">${escapeHtml(item.title)}</span>
              <span class="item-subtitle">${escapeHtml(item.subtitle)} • ${dateStr}</span>
              <span class="item-badge ${badgeClass}">${escapeHtml(item.badge || item.domain)}</span>
            </div>
            ${isVault ? `<div class="item-actions"><span style="font-size:0.78rem;color:#38bdf8;font-weight:700;">Перейти ➔</span></div>` : ''}
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

// 4. Tasks — TasksModule
const TasksModule = {
  _filter: "active",
  _tasks: [],

  setFilter(f, btn) {
    this._filter = f;
    document.querySelectorAll(".tasks-filter-pill").forEach(p => p.classList.remove("active"));
    if (btn) btn.classList.add("active");
    this.render();
  },

  _urgencyInfo(dueDate) {
    if (!dueDate) return { label: "Без дедлайну", cls: "tasks-due-none", urgent: false };
    const now = Date.now();
    const due = new Date(dueDate).getTime();
    const diff = due - now; // ms
    if (diff < 0) return { label: "⚠️ Прострочено!", cls: "tasks-due-overdue", urgent: true };
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return { label: `🔥 через ${mins} хв`, cls: "tasks-due-hot", urgent: true };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { label: `⏰ через ${hrs} год`, cls: "tasks-due-soon", urgent: true };
    const days = Math.floor(hrs / 24);
    if (days === 1) return { label: "📅 Завтра", cls: "tasks-due-tomorrow", urgent: false };
    if (days < 7) return { label: `📅 через ${days} дн.`, cls: "tasks-due-week", urgent: false };
    const d = new Date(dueDate);
    return {
      label: d.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      cls: "tasks-due-ok", urgent: false
    };
  },

  _catIcon(cat) {
    const map = { "Здоров'я": "❤️", "Роботи": "🔨", "Документи": "📄", "Фінанси": "💳", "Сім'я": "👨‍👩‍👧", "Авто": "🚗", "Покупки": "🛍️", "Особисте": "👤" };
    return map[cat] || "📌";
  },

  render() {
    const list = document.getElementById("tasks-list");
    if (!list) return;
    let tasks = this._tasks;
    const f = this._filter;
    const now = Date.now();

    if (f === "active") tasks = tasks.filter(t => !t.is_completed);
    else if (f === "done") tasks = tasks.filter(t => t.is_completed);
    else if (f === "urgent") tasks = tasks.filter(t => !t.is_completed && t.due_date && (new Date(t.due_date).getTime() - now) < 86400000);
    else if (f === "no_date") tasks = tasks.filter(t => !t.is_completed && !t.due_date);

    const activeCnt = this._tasks.filter(t => !t.is_completed).length;
    const badge = document.getElementById("tasks-total-badge");
    if (badge) badge.textContent = `${activeCnt} активних`;

    if (tasks.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:32px 16px;">
          <span class="empty-icon">${f === "done" ? "✅" : "📋"}</span>
          <p><strong>${f === "done" ? "Виконаних справ немає" : "Справ немає"}</strong></p>
          <p style="font-size:0.85rem;color:var(--text-muted);margin:8px auto 16px;max-width:340px;">
            ${f === "active" ? "Скажіть мікрофону: «Здати кров 7 жовтня о 8 ранку» або натисніть «+ Додати роботу»" : "Нічого не знайдено у цьому фільтрі"}
          </p>
          ${f === "active" ? `<button class="btn-primary" style="padding:9px 18px;font-size:0.85rem;background:linear-gradient(135deg,#8b5cf6,#6d28d9);" onclick="document.getElementById('add-task-btn').click()">+ Додати роботу</button>` : ""}
        </div>`;
      return;
    }

    list.innerHTML = tasks.map(t => {
      const due = this._urgencyInfo(t.due_date);
      const prioMap = { high: { cls: "tasks-prio-high", label: "🔥 Терміново" }, medium: { cls: "tasks-prio-med", label: "⚡ Середній" }, low: { cls: "tasks-prio-low", label: "☕ Низький" } };
      const prio = prioMap[t.priority] || prioMap.medium;
      const catIcon = this._catIcon(t.category);
      const desc = t.description ? `<div class="tasks-card-desc">${escapeHtml(t.description)}</div>` : "";

      return `
        <div class="tasks-card ${t.is_completed ? "tasks-card-done" : ""} ${due.urgent && !t.is_completed ? "tasks-card-urgent" : ""}">
          <div class="tasks-card-check-col">
            <button class="tasks-check-btn ${t.is_completed ? "checked" : ""}" onclick="toggleTask(${t.id})" title="${t.is_completed ? "Позначити як активну" : "Позначити виконаною"}">
              ${t.is_completed ? "✓" : ""}
            </button>
          </div>
          <div class="tasks-card-body">
            <div class="tasks-card-title ${t.is_completed ? "tasks-title-done" : ""}">${escapeHtml(t.title)}</div>
            ${desc}
            <div class="tasks-card-meta">
              <span class="tasks-due-badge ${due.cls}">${due.label}</span>
              <span class="tasks-cat-badge">${catIcon} ${escapeHtml(t.category || "Особисте")}</span>
              <span class="${prio.cls} tasks-prio-badge">${prio.label}</span>
            </div>
          </div>
          <div class="tasks-card-actions">
            ${!t.is_completed && t.due_date ? `<button class="tasks-remind-btn" onclick="TasksModule.setReminder(${t.id},'${escapeHtml(t.title)}','${t.due_date}')" title="Встановити нагадування">🔔</button>` : ""}
            <button class="delete-btn" onclick="deleteItem('tasks', ${t.id})" title="Видалити">🗑️</button>
          </div>
        </div>`;
    }).join("");
  },

  async load() {
    const list = document.getElementById("tasks-list");
    if (list) list.innerHTML = `<div class="empty-state"><span class="empty-icon">⏳</span><p>Завантажую справи...</p></div>`;
    try {
      const tasks = await apiFetch("/api/tasks?limit=200");
      this._tasks = Array.isArray(tasks) ? tasks : [];
      this.render();
      this._scheduleReminders();
    } catch {
      if (list) list.innerHTML = `<div class="empty-state"><p>❌ Помилка завантаження</p></div>`;
    }
  },

  setReminder(id, title, dueDate) {
    if (!("Notification" in window)) {
      showToast("❌ Браузер не підтримує сповіщення");
      return;
    }
    const requestAndSet = () => {
      const due = new Date(dueDate).getTime();
      const now = Date.now();
      const delay = due - now;
      if (delay <= 0) { showToast("⚠️ Термін вже минув!"); return; }
      // Save to localStorage
      const reminders = JSON.parse(localStorage.getItem("task_reminders") || "{}");
      reminders[id] = { title, dueDate, notified: false };
      localStorage.setItem("task_reminders", JSON.stringify(reminders));
      const mins = Math.round(delay / 60000);
      showToast(`🔔 Нагадування встановлено! Спрацює через ${mins < 60 ? mins + " хв" : Math.round(mins/60) + " год"}`);
    };
    if (Notification.permission === "granted") {
      requestAndSet();
    } else {
      Notification.requestPermission().then(p => {
        if (p === "granted") requestAndSet();
        else showToast("🔕 Дозвіл на сповіщення не надано");
      });
    }
  },

  _scheduleReminders() {
    const reminders = JSON.parse(localStorage.getItem("task_reminders") || "{}");
    const now = Date.now();
    Object.entries(reminders).forEach(([id, r]) => {
      if (r.notified) return;
      const due = new Date(r.dueDate).getTime();
      const delay = due - now;
      if (delay > 0 && delay < 7 * 24 * 3600000) { // within 7 days
        setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification("📋 Нагадування: " + r.title, {
              body: "Час виконати справу! " + new Date(r.dueDate).toLocaleString("uk-UA"),
              icon: "/static/icon-192.png",
            });
          }
          const rem = JSON.parse(localStorage.getItem("task_reminders") || "{}");
          if (rem[id]) { rem[id].notified = true; localStorage.setItem("task_reminders", JSON.stringify(rem)); }
        }, delay);
      }
    });
  },
};
window.TasksModule = TasksModule;

async function loadTasks() {
  await TasksModule.load();
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

// ─── 6. Movies / Фільми (модуль frontend/modules/movies.js) ──────────

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

async function loadVersionInfo() {
  const versionBadge = document.getElementById("bot-version-badge");
  const buildTimeLabel = document.getElementById("bot-build-time");
  const pwaLabel = document.getElementById("pwa-version-label");
  const statusTag = document.getElementById("bot-status-tag");
  const connStatus = document.getElementById("bot-connection-status");

  if (pwaLabel) pwaLabel.textContent = `v${APP_VERSION}`;

  try {
    const res = await apiFetch("/api/v1/system/version");
    if (res && res.bot_version) {
      if (versionBadge) versionBadge.textContent = `v${res.bot_version}`;
      if (buildTimeLabel) buildTimeLabel.textContent = res.build_date_time || "30.09.2026";
      if (connStatus) {
        connStatus.textContent = "● Підключено";
        connStatus.style.color = "#22c55e";
      }

      if (statusTag) {
        if (res.bot_version === APP_VERSION) {
          statusTag.textContent = `● Актуальна (v${APP_VERSION})`;
          statusTag.style.color = "#22c55e";
          statusTag.style.background = "rgba(34,197,94,0.18)";
          statusTag.style.borderColor = "rgba(34,197,94,0.3)";
        } else {
          statusTag.textContent = `⚠️ Доступно v${res.bot_version}`;
          statusTag.style.color = "#f59e0b";
          statusTag.style.background = "rgba(245,158,11,0.18)";
          statusTag.style.borderColor = "rgba(245,158,11,0.3)";
        }
      }
    }
  } catch (err) {
    console.warn("loadVersionInfo error:", err);
    if (connStatus) {
      connStatus.textContent = "⚠️ Помилка зв'язку";
      connStatus.style.color = "#ef4444";
    }
  }
}

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
      const currencySelect = document.getElementById("currency-select");
      if (currencySelect) currencySelect.value = state.preferredCurrency || "₴";
      const languageSelect = document.getElementById("language-select");
      if (languageSelect) languageSelect.value = state.preferredLanguage || "uk";
      resultText.textContent = "";
      try {
        loadBackupStatus();
        loadVersionInfo();
      } catch (err) {
        console.warn("Settings init error:", err);
      }
    });
  }

  document.getElementById("check-version-btn")?.addEventListener("click", async () => {
    await loadVersionInfo();
    showToast("✅ Дані версії бота оновлено!");
  });

  document.getElementById("trigger-cloud-backup-btn")?.addEventListener("click", triggerCloudBackup);

  document.getElementById("clear-cache-reload-btn")?.addEventListener("click", async () => {
    const feedback = document.getElementById("version-action-feedback");
    if (feedback) feedback.textContent = "⏳ Очищення кешу Safari/PWA та оновлення...";
    showToast("🔄 Очищення кешу та примусове оновлення...", 3500);
    setTimeout(() => {
      forceAppUpdate();
    }, 300);
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

    const currencySelect = document.getElementById("currency-select");
    if (currencySelect) {
      state.preferredCurrency = currencySelect.value;
      localStorage.setItem("preferred_currency", state.preferredCurrency);
    }
    const languageSelect = document.getElementById("language-select");
    if (languageSelect) {
      state.preferredLanguage = languageSelect.value;
      localStorage.setItem("preferred_language", state.preferredLanguage);
    }

    modal.classList.add("hidden");
    showToast("⚙️ Настройки збережено");
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

// --- Help, FAQ & Feedback Modal ---
function initHelpModal() {
  const modal = document.getElementById("help-modal");
  const openBtn = document.getElementById("help-open-btn");
  const closeBtn = document.getElementById("help-close-btn");
  const tabFaqBtn = document.getElementById("help-tab-faq-btn");
  const tabFeedbackBtn = document.getElementById("help-tab-feedback-btn");
  const faqContent = document.getElementById("help-faq-content");
  const feedbackContent = document.getElementById("help-feedback-content");
  const textInput = document.getElementById("feedback-text-input");
  const micBtn = document.getElementById("feedback-mic-btn");
  const sendBtn = document.getElementById("send-feedback-btn");
  const statusMsg = document.getElementById("feedback-status-msg");
  const typeChips = document.querySelectorAll(".fb-type-chip");

  let selectedType = "idea";
  let feedbackRecognition = null;
  let isDictating = false;

  if (openBtn && modal) {
    openBtn.addEventListener("click", (e) => {
      e.preventDefault();
      modal.classList.remove("hidden");
      if (statusMsg) statusMsg.textContent = "";
    });
  }

  closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  function switchTab(target) {
    if (target === "faq") {
      tabFaqBtn.style.background = "linear-gradient(135deg, #0ea5e9, #2563eb)";
      tabFaqBtn.style.color = "#fff";
      tabFaqBtn.style.fontWeight = "700";
      tabFeedbackBtn.style.background = "transparent";
      tabFeedbackBtn.style.color = "var(--text-muted)";
      tabFeedbackBtn.style.fontWeight = "600";
      faqContent?.classList.remove("hidden");
      feedbackContent?.classList.add("hidden");
    } else {
      tabFeedbackBtn.style.background = "linear-gradient(135deg, #0ea5e9, #2563eb)";
      tabFeedbackBtn.style.color = "#fff";
      tabFeedbackBtn.style.fontWeight = "700";
      tabFaqBtn.style.background = "transparent";
      tabFaqBtn.style.color = "var(--text-muted)";
      tabFaqBtn.style.fontWeight = "600";
      feedbackContent?.classList.remove("hidden");
      faqContent?.classList.add("hidden");
    }
  }

  tabFaqBtn?.addEventListener("click", () => switchTab("faq"));
  tabFeedbackBtn?.addEventListener("click", () => switchTab("feedback"));

  typeChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      typeChips.forEach((c) => {
        c.classList.remove("active");
        c.style.borderColor = "var(--border-color)";
        c.style.background = "var(--bg-input)";
        c.style.color = "var(--text-muted)";
        c.style.fontWeight = "600";
      });
      chip.classList.add("active");
      chip.style.borderColor = "#0ea5e9";
      chip.style.background = "rgba(14,165,233,0.18)";
      chip.style.color = "#0ea5e9";
      chip.style.fontWeight = "700";
      selectedType = chip.dataset.type || "idea";
    });
  });

  // Voice dictation for feedback (Universal MediaRecorder + Gemini Transcription)
  if (micBtn && textInput) {
    let feedbackRecorder = null;
    let feedbackChunks = [];
    let isFeedbackRecording = false;

    micBtn.addEventListener("click", async () => {
      if (isFeedbackRecording) {
        if (feedbackRecorder && feedbackRecorder.state !== "inactive") {
          feedbackRecorder.stop();
        }
        isFeedbackRecording = false;
        micBtn.style.background = "rgba(244,63,94,0.18)";
        micBtn.style.transform = "scale(1)";
        micBtn.title = "Диктувати голосом";
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        feedbackChunks = [];
        const mimeType = (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4"))
          ? "audio/mp4"
          : "audio/webm";

        try {
          feedbackRecorder = new MediaRecorder(stream, { mimeType });
        } catch (e) {
          feedbackRecorder = new MediaRecorder(stream);
        }

        feedbackRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) feedbackChunks.push(e.data);
        };

        feedbackRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const actualMime = feedbackRecorder.mimeType || mimeType;
          const audioBlob = new Blob(feedbackChunks, { type: actualMime });

          if (statusMsg) {
            statusMsg.textContent = "⏳ Розпізнаю голос через Gemini...";
            statusMsg.style.color = "#38bdf8";
          }

          const formData = new FormData();
          formData.append("audio", audioBlob, "feedback_voice.webm");

          try {
            const res = await apiFetch("/api/v1/system/transcribe-audio", {
              method: "POST",
              body: formData,
            });

            if (res && res.text) {
              const prev = textInput.value.trim();
              textInput.value = prev ? `${prev} ${res.text}` : res.text;
              if (statusMsg) {
                statusMsg.textContent = "✅ Голос розпізнано!";
                statusMsg.style.color = "var(--success)";
                setTimeout(() => { if (statusMsg && statusMsg.textContent.includes("розпізнано")) statusMsg.textContent = ""; }, 2500);
              }
            } else {
              if (statusMsg) {
                statusMsg.textContent = "⚠️ Не вдалося розібрати слова";
                statusMsg.style.color = "var(--warning)";
              }
            }
          } catch (err) {
            if (statusMsg) {
              statusMsg.textContent = `❌ Помилка розпізнавання: ${err.message}`;
              statusMsg.style.color = "var(--danger)";
            }
          }
        };

        feedbackRecorder.start();
        isFeedbackRecording = true;
        micBtn.style.background = "#ef4444";
        micBtn.style.transform = "scale(1.15)";
        micBtn.title = "Слухаю... Натисніть для завершення";
        if (statusMsg) {
          statusMsg.textContent = "🎙️ Слухаю... Говоріть, потім натисніть мікрофон ще раз";
          statusMsg.style.color = "#f43f5e";
        }
      } catch (err) {
        console.warn("Feedback voice record error:", err);
        showToast("❌ Дозвольте доступ до мікрофона для диктування");
        if (statusMsg) {
          statusMsg.textContent = "Доступ до мікрофона заблоковано";
          statusMsg.style.color = "var(--danger)";
        }
      }
    });
  }

  // Submit feedback to server
  sendBtn?.addEventListener("click", async () => {
    const message = textInput?.value.trim();
    if (!message) {
      if (statusMsg) {
        statusMsg.textContent = "⚠️ Будь ласка, напишіть хоча б кілька слів";
        statusMsg.style.color = "#f59e0b";
      }
      textInput?.focus();
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span>⏳ Відправка...</span>`;
    if (statusMsg) {
      statusMsg.textContent = "Відправка розробнику...";
      statusMsg.style.color = "var(--text-muted)";
    }

    try {
      const res = await apiFetch("/system/feedback", {
        method: "POST",
        body: JSON.stringify({
          feedback_type: selectedType,
          message: message,
          client_info: `PWA v${APP_VERSION} (${navigator.userAgent})`,
        }),
      });

      if (res && res.status === "ok") {
        if (statusMsg) {
          statusMsg.textContent = "✅ Дякуємо! Ваш відгук успішно передано.";
          statusMsg.style.color = "var(--success)";
        }
        showToast("🚀 Відгук надіслано розробнику! Дякуємо!");
        if (textInput) textInput.value = "";
        setTimeout(() => {
          modal.classList.add("hidden");
          if (statusMsg) statusMsg.textContent = "";
        }, 1800);
      } else {
        throw new Error(res?.message || "Помилка відправки");
      }
    } catch (err) {
      if (statusMsg) {
        statusMsg.textContent = `❌ ${err.message || "Не вдалося надіслати"}`;
        statusMsg.style.color = "var(--danger)";
      }
      showToast(`❌ Помилка: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<span>🚀 Надіслати розробнику</span>`;
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
      titleEl.textContent = "📋 Нова робота / справа";
      fieldsEl.innerHTML = `
        <label>📝 Назва роботи або справи:</label>
        <input type="text" name="title" required placeholder="Здати кров, оформити пенсію, помити авто..." autofocus />
        <label>📄 Опис / деталі (необов'язково):</label>
        <textarea name="description" rows="2" placeholder="Адреса лабораторії: вул. Шевченка 5&#10;Взяти направлення від лікаря"></textarea>
        <label>📅 Дедлайн — до якого часу зробити:</label>
        <input type="datetime-local" name="due_date" id="task-due-date-input" />
        <label>🔔 Нагадати мені о: <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;">(оберіть дату і час)</span></label>
        <input type="datetime-local" name="remind_at" id="task-remind-at-input"
          style="border-color:rgba(56,189,248,0.4);" />
        <p style="font-size:0.76rem;color:var(--text-muted);margin:-6px 0 4px 0;">
          💡 Телефон пропищить у вказаний час навіть якщо додаток згорнутий
        </p>
        <label>🏷️ Категорія:</label>
        <select name="category">
          <option value="Особисте">👤 Особисте</option>
          <option value="Здоров'я">❤️ Здоров'я / Лікарі</option>
          <option value="Роботи">🔨 Роботи / Ремонт</option>
          <option value="Документи">📄 Документи / Держоргани</option>
          <option value="Фінанси">💳 Фінанси / Платежі</option>
          <option value="Сім'я">👨‍👩‍👧 Сім'я</option>
          <option value="Авто">🚗 Авто</option>
          <option value="Покупки">🛍️ Покупки</option>
        </select>
        <label>⚡ Пріоритет:</label>
        <select name="priority">
          <option value="low">☕ Низький — коли буде час</option>
          <option value="medium" selected>⚡ Середній — цього тижня</option>
          <option value="high">🔥 Терміново — якомога швидше</option>
        </select>
      `;

      // Pre-fill due_date to +1 hour from now
      const dueDateInput = fieldsEl.querySelector('#task-due-date-input');
      const remindAtInput = fieldsEl.querySelector('#task-remind-at-input');
      const roundToHour = (d) => { d.setMinutes(0,0,0); d.setHours(d.getHours()+1); return d; };

      if (dueDateInput) {
        const d = roundToHour(new Date());
        dueDateInput.value = d.toISOString().slice(0, 16);
        // Pre-fill remind_at to 1 hour before due_date
        if (remindAtInput) {
          const r = new Date(d.getTime() - 60 * 60000);
          remindAtInput.value = r.toISOString().slice(0, 16);
        }
        // When user changes due_date → auto-update remind_at to 1h before
        dueDateInput.addEventListener('change', () => {
          if (!dueDateInput.value) return;
          const due = new Date(dueDateInput.value);
          const remind = new Date(due.getTime() - 60 * 60000);
          if (remindAtInput && !remindAtInput._userEdited) {
            remindAtInput.value = remind.toISOString().slice(0, 16);
          }
        });
        // Mark remind_at as user-edited if they touch it
        if (remindAtInput) {
          remindAtInput.addEventListener('change', () => { remindAtInput._userEdited = true; });
        }
      }

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
      if (data.description === "") delete data.description;
      if (!data.remind_at) delete data.remind_at;

      // Also schedule browser notification (works even without Telegram)
      const remindAt = data.remind_at;
      if (remindAt) {
        const remindMs = new Date(remindAt).getTime();
        const delayMs = remindMs - Date.now();
        if (delayMs > 0) {
          const scheduleIt = () => {
            const reminders = JSON.parse(localStorage.getItem("task_reminders") || "{}");
            const key = "_pending_" + Date.now();
            reminders[key] = { title: data.title, dueDate: data.due_date || remindAt, notified: false, remindAt };
            localStorage.setItem("task_reminders", JSON.stringify(reminders));
            setTimeout(() => {
              if (Notification.permission === "granted") {
                new Notification("🔔 Нагадування: " + data.title, {
                  body: "Час виконати справу!\n" + new Date(data.due_date || remindAt).toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
                  icon: "/static/icon-192.png",
                  tag: key,
                  requireInteraction: true,
                });
              }
              const rem = JSON.parse(localStorage.getItem("task_reminders") || "{}");
              if (rem[key]) { rem[key].notified = true; localStorage.setItem("task_reminders", JSON.stringify(rem)); }
            }, delayMs);
            const mins = Math.round(delayMs / 60000);
            const timeStr = mins < 60 ? `${mins} хв` : mins < 1440 ? `${Math.round(mins/60)} год` : `${Math.round(mins/1440)} дн.`;
            showToast(`🔔 Нагадування встановлено! Спрацює через ${timeStr}`);
          };
          if (Notification.permission === "granted") { scheduleIt(); }
          else { Notification.requestPermission().then(p => { if (p === "granted") scheduleIt(); }); }
        }
      }

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
            if (!autoDialogEnabled) return;
            stopAllAudio();
            if (isUserSpeaker) {
              const sLang = sSelect.value === "auto" ? "ru" : sSelect.value;
              startSpeechRecognition(tSelect.value, sLang, false, foreignerMicBtn);
            } else {
              startSpeechRecognition(sSelect.value, tSelect.value, true, userMicBtn);
            }
          }, 550);
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

      let latestTranscript = "";
      let hasDispatched = false;

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
          latestTranscript = currentSpoken;
          if (isUserSpeaker && userOut) {
            userOut.textContent = `Ви: ${currentSpoken}`;
          } else if (!isUserSpeaker && foreignerOut) {
            foreignerOut.textContent = `Співрозмовник: ${currentSpoken}`;
          }
        }

        if (finalTranscript.trim() && !hasDispatched) {
          hasDispatched = true;
          const textToSend = finalTranscript.trim();
          latestTranscript = "";
          stopCurrentRecognition();
          translateAndDisplay(textToSend, fromLang, toLang, isUserSpeaker);
        }
      };

      rec.onerror = (e) => {
        console.warn("[Translator SpeechRec error]:", e.error);
        stopCurrentRecognition();
        if (autoDialogEnabled) {
          // If in auto-dialog mode, automatically keep listening without giving up!
          autoDialogTimer = setTimeout(() => {
            if (autoDialogEnabled) {
              startSpeechRecognition(fromLang, toLang, isUserSpeaker, btnEl);
            }
          }, 450);
        } else if (e.error !== "no-speech" && e.error !== "aborted") {
          showToast("Не вдалося розпізнати мову. Спробуйте ще раз.");
        }
      };

      rec.onend = () => {
        stopCurrentRecognition();
        // If speech ended with captured text that wasn't dispatched via isFinal (iOS Safari quirk)
        if (latestTranscript.trim() && !hasDispatched) {
          hasDispatched = true;
          const textToSend = latestTranscript.trim();
          latestTranscript = "";
          translateAndDisplay(textToSend, fromLang, toLang, isUserSpeaker);
          return;
        }

        // If nothing was spoken, but auto-dialogue is active: stay listening!
        if (autoDialogEnabled && !hasDispatched) {
          autoDialogTimer = setTimeout(() => {
            if (autoDialogEnabled) {
              startSpeechRecognition(fromLang, toLang, isUserSpeaker, btnEl);
            }
          }, 400);
        }
      };

      // Resilient start for iOS WebKit (avoids InvalidStateError with retry)
      let attempt = 0;
      function attemptStart() {
        attempt++;
        try {
          rec.start();
        } catch (err) {
          if (attempt <= 3) {
            setTimeout(attemptStart, 150);
          } else {
            console.warn("[Translator] rec.start failed:", err);
            stopCurrentRecognition();
            if (autoDialogEnabled) {
              autoDialogTimer = setTimeout(() => {
                if (autoDialogEnabled) startSpeechRecognition(fromLang, toLang, isUserSpeaker, btnEl);
              }, 600);
            }
          }
        }
      }
      setTimeout(attemptStart, 80);
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

  document.getElementById("export-bp-csv-btn")?.addEventListener("click", async () => {
    let tokenParam = "";
    try {
      const res = await apiFetch("/api/v1/vitals/bp/export-token");
      if (res && res.token) {
        tokenParam = `&token=${encodeURIComponent(res.token)}`;
      }
    } catch (e) {
      console.warn("Could not get export token:", e);
    }
    const exportUrl = `${state.serverUrl}/api/v1/vitals/bp/export?days=${vitalsSelectedDays}${tokenParam}`;
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

// ─── Music Hub (модуль frontend/modules/music.js) ───────────────────

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
  if (window.AuthPhone && typeof window.AuthPhone.init === "function") {
    window.AuthPhone.init();
  }
  if (window.BlocksManager && typeof window.BlocksManager.initBlocksManager === "function") {
    window.BlocksManager.initBlocksManager();
  }
  if (window.BusinessModule && typeof window.BusinessModule.init === "function") {
    window.BusinessModule.init();
  }
  if (window.AIChatModule && typeof window.AIChatModule.init === "function") {
    window.AIChatModule.init();
  }
  if (window.MailboxModule && typeof window.MailboxModule.init === "function") {
    window.MailboxModule.init();
  }
  if (window.VaultModule && typeof window.VaultModule.init === "function") {
    window.VaultModule.init();
  }

  initSettingsModal();
  initHelpModal();
  initManualAddModal();
  initStep2Handlers();
  initStep3Handlers();
  initStep5Handlers();
  initVitalsScreen();
  if (typeof initMusicPlayer === "function") initMusicPlayer();
  initNetworkListeners();
  checkHealth();
  checkSystemFeatures();
  loadFeed();
});

