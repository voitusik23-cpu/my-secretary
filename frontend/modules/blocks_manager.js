// ===================================================
// Мой Секретарь — Модуль Конструктора Блоків
// frontend/modules/blocks_manager.js
// ===================================================

const ALL_APP_BLOCKS = [
  { id: "feed", label: "Головна / Лента", icon: "⚡", desc: "Голосові нотатки, останні записи, швидкий ввід" },
  { id: "music", label: "Музика та плеєр (в авто)", icon: "🎵", desc: "Стрімінг, Shazam-треки, офлайн-кеш, автоплейлист" },
  { id: "movies", label: "Фільми та серіали", icon: "🎬", desc: "Онлайн-кінотеатр, пошук фільмів, закладки" },
  { id: "shopping", label: "Список покупок", icon: "🛒", desc: "Швидкий список продуктів та речей для дому" },
  { id: "tasks", label: "Роботи та справи", icon: "🛠️", desc: "Особисті завдання, доручення, дедлайни" },
  { id: "finance", label: "Фінанси та витрати", icon: "💰", desc: "Облік доходів, витрат, перерахунок у USD" },
  { id: "business", label: "Бизнес и касса", icon: "💼", desc: "Облік доходів і витрат бізнесу, баланс на руках, звіт для відправки" },
  { id: "translator", label: "Перекладач ШІ", icon: "🌐", desc: "Миттєвий переклад текстів та мовні підказки" },

  { id: "fitness", label: "Спорт та активність", icon: "🏃", desc: "Кроки, дистанція, тренування, вага" },
  { id: "vitals", label: "Тиск та пульс", icon: "❤️", desc: "Журнал артеріального тиску, графіки норми" },
  { id: "media", label: "Склерозник / Замітки", icon: "🧠", desc: "Пам'ятки, фото документів, збережені посилання" },
  { id: "inventory", label: "Де що лежить (Інвентар)", icon: "📦", desc: "Швидкий пошук домашніх речей та інструментів" },
  { id: "auto", label: "Гараж та авто", icon: "🚗", desc: "Пробіг, витрати на ТО, страховка" },
  { id: "utilities", label: "Лічильники та ЖКГ", icon: "💡", desc: "Показники світла, води, газу та квитанції" },
  { id: "agent", label: "Розумний пошук", icon: "🔍", desc: "Пошук в інтернеті та аналітика через ШІ" }
];

const DEFAULT_GUEST_BLOCKS = ["feed", "music", "movies", "shopping", "tasks"];
const DEFAULT_ALL_BLOCKS = ALL_APP_BLOCKS.map(b => b.id);

function getCurrentUsername() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("user") || localStorage.getItem("secretary_user") || "admin";
}

function getBlocksStorageKey() {
  return `secretary_blocks_${getCurrentUsername()}`;
}

function getLocalEnabledBlocks() {
  const user = getCurrentUsername();
  const raw = localStorage.getItem(getBlocksStorageKey());
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  // Default: if admin/owner -> all blocks, if friend/guest -> guest blocks
  return (user === "admin" || user === "owner" || user === "default") 
    ? [...DEFAULT_ALL_BLOCKS] 
    : [...DEFAULT_GUEST_BLOCKS];
}

function saveLocalEnabledBlocks(blocks) {
  localStorage.setItem(getBlocksStorageKey(), JSON.stringify(blocks));
  // Sync with server in background
  if (typeof apiFetch === "function") {
    apiFetch("/api/v1/users/me/modules", {
      method: "PUT",
      body: JSON.stringify({ enabled_modules: blocks })
    }).catch(err => console.warn("Failed to sync blocks to server:", err));
  }
}

function applyEnabledBlocks(blocks) {
  const tabButtons = document.querySelectorAll(".tab-btn");
  let activeTabStillVisible = false;
  let firstVisibleTab = null;

  tabButtons.forEach(btn => {
    const tabName = btn.dataset.tab;
    if (!tabName) return;

    if (blocks.includes(tabName)) {
      btn.classList.remove("block-hidden");
      if (!firstVisibleTab) firstVisibleTab = tabName;
      if (btn.classList.contains("active")) {
        activeTabStillVisible = true;
      }
    } else {
      btn.classList.add("block-hidden");
    }
  });

  // If current active tab was hidden, switch smoothly to the first visible enabled tab
  if (!activeTabStillVisible && firstVisibleTab && typeof window.switchToTab === "function") {
    window.switchToTab(firstVisibleTab);
  }
}

function renderBlocksModal(selectedBlocks) {
  const container = document.getElementById("blocks-modal-list");
  if (!container) return;

  container.innerHTML = ALL_APP_BLOCKS.map(block => {
    const isChecked = selectedBlocks.includes(block.id);
    return `
      <div class="block-toggle-card ${isChecked ? 'active' : ''}" data-block-id="${block.id}">
        <div class="block-toggle-info">
          <span class="block-toggle-icon">${block.icon}</span>
          <div>
            <div class="block-toggle-title">${escapeHtml(block.label)}</div>
            <div class="block-toggle-desc">${escapeHtml(block.desc)}</div>
          </div>
        </div>
        <div class="block-checkbox-custom">${isChecked ? '✓' : ''}</div>
      </div>
    `;
  }).join("");

  // Add click listeners to cards
  container.querySelectorAll(".block-toggle-card").forEach(card => {
    card.addEventListener("click", () => {
      const blockId = card.dataset.blockId;
      const isNowActive = !card.classList.contains("active");
      card.classList.toggle("active", isNowActive);
      const chk = card.querySelector(".block-checkbox-custom");
      if (chk) chk.textContent = isNowActive ? "✓" : "";
    });
  });
}

function initBlocksManager() {
  const blocksBtn = document.getElementById("blocks-toggle-btn");
  const modal = document.getElementById("blocks-modal");
  const closeBtn = document.getElementById("blocks-modal-close-btn");
  const saveBtn = document.getElementById("blocks-save-btn");
  const presetAllBtn = document.getElementById("preset-all-blocks-btn");
  const presetMediaBtn = document.getElementById("preset-media-blocks-btn");
  const presetCarBtn = document.getElementById("preset-car-blocks-btn");

  // Initial load from storage and apply
  const currentBlocks = getLocalEnabledBlocks();
  applyEnabledBlocks(currentBlocks);

  // Sync profile from server if online
  if (typeof apiFetch === "function") {
    apiFetch("/api/v1/users/me/profile")
      .then(profile => {
        if (profile && Array.isArray(profile.enabled_modules) && profile.enabled_modules.length > 0) {
          localStorage.setItem(getBlocksStorageKey(), JSON.stringify(profile.enabled_modules));
          applyEnabledBlocks(profile.enabled_modules);
        }
      })
      .catch(() => {});
  }

  // Open modal
  if (blocksBtn) {
    blocksBtn.addEventListener("click", () => {
      const activeBlocks = getLocalEnabledBlocks();
      renderBlocksModal(activeBlocks);
      modal?.classList.remove("hidden");
    });
  }

  // Close modal
  closeBtn?.addEventListener("click", () => {
    modal?.classList.add("hidden");
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
  });

  // Presets
  presetAllBtn?.addEventListener("click", () => {
    renderBlocksModal([...DEFAULT_ALL_BLOCKS]);
  });

  presetMediaBtn?.addEventListener("click", () => {
    renderBlocksModal(["music", "movies", "feed"]);
  });

  presetCarBtn?.addEventListener("click", () => {
    renderBlocksModal(["music", "auto", "feed"]);
  });

  // Save selection
  saveBtn?.addEventListener("click", () => {
    const activeCards = document.querySelectorAll("#blocks-modal-list .block-toggle-card.active");
    const selectedIds = Array.from(activeCards).map(c => c.dataset.blockId);

    if (selectedIds.length === 0) {
      if (typeof showToast === "function") {
        showToast("⚠️ Оберіть хоча б один блок!");
      }
      return;
    }

    saveLocalEnabledBlocks(selectedIds);
    applyEnabledBlocks(selectedIds);
    modal?.classList.add("hidden");

    if (typeof showToast === "function") {
      showToast("🧩 Блоки оновлено!");
    }
  });
}

// Global exports
window.BlocksManager = {
  ALL_APP_BLOCKS,
  getLocalEnabledBlocks,
  saveLocalEnabledBlocks,
  applyEnabledBlocks,
  initBlocksManager
};
