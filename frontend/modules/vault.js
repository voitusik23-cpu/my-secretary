// ===================================================
// Мой Секретарь — Окремий Модуль «Склерозник» (Сейф паролів)
// frontend/modules/vault.js (v3.7.8)
// ===================================================

const VaultModule = {
  state: {
    items: [],
    currentCategory: "all",
    searchQuery: "",
    editingId: null,
    parsedQueue: [],
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    visiblePasswords: new Set(),
  },

  categoryIcons: {
    all: "🌐",
    ai: "🤖",
    social: "💬",
    email: "📬",
    crypto: "📈",
    wifi: "📶",
    devices: "📱",
    other: "📝",
  },

  categoryNames: {
    all: "Всі",
    ai: "ШІ / AI",
    social: "Соцмережі",
    email: "Пошти",
    crypto: "Крипта",
    wifi: "Wi-Fi",
    devices: "Apple & Гаджети",
    other: "Інше",
  },

  async loadItems() {
    const listEl = document.getElementById("vault-cards-list");
    if (listEl && (!this.state.items || this.state.items.length === 0)) {
      listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">⏳</span><p>Завантажую Склерозник...</p></div>`;
    }

    try {
      let url = "/api/v1/vault/items";
      const params = new URLSearchParams();
      if (this.state.currentCategory && this.state.currentCategory !== "all") {
        params.append("category", this.state.currentCategory);
      }
      if (this.state.searchQuery && this.state.searchQuery.trim()) {
        params.append("q", this.state.searchQuery.trim());
      }
      const qStr = params.toString();
      if (qStr) url += `?${qStr}`;

      const res = await apiFetch(url);
      this.state.items = Array.isArray(res) ? res : [];
      this.renderItems();
      this.updateCounts();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Помилка завантаження: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  },

  updateCounts() {
    const counts = { all: this.state.items.length };
    this.state.items.forEach(it => {
      const c = it.category || "other";
      counts[c] = (counts[c] || 0) + 1;
    });

    document.querySelectorAll(".vault-cat-pill").forEach(pill => {
      const cat = pill.dataset.cat;
      const countBadge = pill.querySelector(".vault-pill-count");
      if (countBadge) {
        if (cat === "all") {
          countBadge.textContent = this.state.items.length;
        } else {
          countBadge.textContent = counts[cat] || 0;
        }
      }
    });
  },

  setCategory(cat) {
    this.state.currentCategory = cat;
    document.querySelectorAll(".vault-cat-pill").forEach(p => {
      if (p.dataset.cat === cat) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });
    this.loadItems();
  },

  togglePasswordVisibility(id) {
    if (this.state.visiblePasswords.has(id)) {
      this.state.visiblePasswords.delete(id);
    } else {
      this.state.visiblePasswords.add(id);
    }
    this.renderItems();
  },

  async copyText(text, label = "Пароль") {
    if (!text) {
      showToast("⚠️ Значення порожнє");
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast(`✅ ${label} скопійовано в буфер!`);
    } catch (err) {
      showToast(`❌ Не вдалося скопіювати: ${err.message}`);
    }
  },

  renderItems() {
    const listEl = document.getElementById("vault-cards-list");
    if (!listEl) return;

    const items = this.state.items || [];
    if (items.length === 0) {
      const isSearch = Boolean(this.state.searchQuery);
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 30px 16px;">
          <span class="empty-icon">${isSearch ? '🔍' : '🔒'}</span>
          <p><strong>${isSearch ? 'Нічого не знайдено' : 'У Склерознику поки порожньо'}</strong></p>
          <p style="font-size:0.85rem;color:var(--text-muted);margin:8px auto 16px auto;max-width:380px;">
            ${isSearch ? 'Спробуйте інше слово або скиньте фільтр' : 'Збережіть паролі від ШІ, соцмереж, бірж чи Wi-Fi. Можна ввести вручну, надиктувати голосом або сфотографувати блокнот!'}
          </p>
          ${!isSearch ? `
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <button class="btn-primary" style="padding:9px 16px;font-size:0.84rem;" onclick="VaultModule.openEditModal()">+ Додати запис</button>
              <button class="action-btn-sm" style="padding:9px 14px;font-size:0.84rem;" onclick="VaultModule.openBulkModal()">📋 Пачкою</button>
              <button class="action-btn-sm" style="padding:9px 14px;font-size:0.84rem;" onclick="document.getElementById('vault-file-input').click()">📸 Сфоткати лист</button>
            </div>
          ` : ''}
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(it => {
      const isVisible = this.state.visiblePasswords.has(it.id);
      const icon = this.categoryIcons[it.category] || "🔐";
      const maskedPwd = it.password ? (isVisible ? escapeHtml(it.password) : "••••••••••••") : "";

      let planBadge = "";
      if (it.plan_type) {
        const isPro = it.plan_type.toLowerCase().includes("pro") || it.plan_type.toLowerCase().includes("plus");
        planBadge = isPro 
          ? `<span class="item-badge" style="background:rgba(234,179,8,0.18);color:#eab308;border:1px solid rgba(234,179,8,0.3);font-size:0.72rem;padding:2px 7px;">💎 ${escapeHtml(it.plan_type.toUpperCase())}</span>`
          : `<span class="item-badge" style="background:rgba(148,163,184,0.18);color:#94a3b8;border:1px solid rgba(148,163,184,0.3);font-size:0.72rem;padding:2px 7px;">🆓 ${escapeHtml(it.plan_type.toUpperCase())}</span>`;
      }

      const isWifi = it.category === "wifi";
      const loginLabel = isWifi ? "Мережа (SSID)" : "Логін / Email";

      return `
        <div class="stat-card" style="margin-bottom:10px;padding:14px;position:relative;">
          <!-- Card Header -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span style="font-size:1.35rem;line-height:1;">${icon}</span>
              <div style="min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <strong style="font-size:0.96rem;color:var(--text-main);">${escapeHtml(it.title)}</strong>
                  ${planBadge}
                </div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
                  ${this.categoryNames[it.category] || it.category}
                </div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:6px;">
              ${it.website_url ? `
                <a href="${escapeHtml(it.website_url)}" target="_blank" rel="noopener noreferrer" class="action-btn-sm" style="text-decoration:none;padding:4px 8px;font-size:0.75rem;color:#38bdf8;" title="Відкрити сайт">
                  🔗 Open ↗
                </a>
              ` : ''}
              <button class="action-btn-sm" style="padding:4px 7px;font-size:0.8rem;" onclick="VaultModule.openEditModal(${it.id})" title="Редагувати">✏️</button>
              <button class="action-btn-sm" style="padding:4px 7px;font-size:0.8rem;color:var(--danger,#ff453a);" onclick="VaultModule.deleteItem(${it.id})" title="Видалити">🗑️</button>
            </div>
          </div>

          <!-- Credential Rows -->
          <div style="background:var(--bg-input);padding:10px 12px;border-radius:10px;font-size:0.82rem;display:flex;flex-direction:column;gap:8px;border:1px solid var(--border-color);">
            <!-- Login row -->
            ${it.login ? `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:0.7rem;color:var(--text-muted);">${loginLabel}:</div>
                  <div style="color:var(--text-main);font-weight:600;word-break:break-all;user-select:all;">${escapeHtml(it.login)}</div>
                </div>
                <button type="button" class="action-btn-sm" style="padding:4px 8px;font-size:0.74rem;" onclick="VaultModule.copyText('${escapeJsString(it.login)}', '${loginLabel}')" title="Скопіювати">
                  📋
                </button>
              </div>
            ` : ''}

            <!-- Password row -->
            ${it.password ? `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:${it.login ? '1px dashed var(--border-color)' : 'none'};padding-top:${it.login ? '6px' : '0'};">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:0.7rem;color:var(--text-muted);">Пароль:</div>
                  <div style="font-family:monospace;font-size:0.92rem;color:var(--text-main);font-weight:700;word-break:break-all;user-select:all;">
                    ${maskedPwd}
                  </div>
                </div>
                <div style="display:flex;gap:4px;">
                  <button type="button" class="action-btn-sm" style="padding:4px 8px;font-size:0.74rem;" onclick="VaultModule.togglePasswordVisibility(${it.id})" title="${isVisible ? 'Сховати' : 'Показати'}">
                    ${isVisible ? '🙈' : '👁️'}
                  </button>
                  <button type="button" class="action-btn-sm" style="padding:4px 8px;font-size:0.74rem;" onclick="VaultModule.copyText('${escapeJsString(it.password)}', 'Пароль')" title="Скопіювати пароль">
                    📋
                  </button>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Extra details: 2FA, Notes, Wi-Fi QR -->
          ${(it.two_factor_note || it.notes || (isWifi && it.password)) ? `
            <div style="margin-top:8px;font-size:0.78rem;display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
              <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;">
                ${it.two_factor_note ? `<div style="color:#0ea5e9;">🛡️ <strong>2FA:</strong> ${escapeHtml(it.two_factor_note)}</div>` : ''}
                ${it.notes ? `<div style="color:var(--text-muted);line-height:1.35;">📝 ${escapeHtml(it.notes)}</div>` : ''}
              </div>

              ${(isWifi && it.password) ? `
                <button type="button" class="action-btn-sm" style="background:rgba(14,165,233,0.15);color:#0ea5e9;padding:4px 9px;font-size:0.75rem;font-weight:700;" onclick="VaultModule.showWifiQR('${escapeJsString(it.title)}', '${escapeJsString(it.login || it.title)}', '${escapeJsString(it.password)}')">
                  📶 QR для гостей
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join("");
  },

  openEditModal(id = null) {
    this.state.editingId = id;
    const modal = document.getElementById("vault-edit-modal");
    if (!modal) return;

    modal.classList.remove("hidden");

    const titleInput = document.getElementById("v-input-title");
    const catSelect = document.getElementById("v-input-cat");
    const loginInput = document.getElementById("v-input-login");
    const pwdInput = document.getElementById("v-input-pwd");
    const urlInput = document.getElementById("v-input-url");
    const planSelect = document.getElementById("v-input-plan");
    const twoFaInput = document.getElementById("v-input-2fa");
    const notesInput = document.getElementById("v-input-notes");
    const modalTitle = document.getElementById("vault-modal-title");

    if (id) {
      const it = this.state.items.find(x => x.id === id);
      if (it) {
        modalTitle.textContent = "✏️ Редагувати запис";
        titleInput.value = it.title || "";
        catSelect.value = it.category || "other";
        loginInput.value = it.login || "";
        pwdInput.value = it.password || "";
        urlInput.value = it.website_url || "";
        planSelect.value = it.plan_type || "";
        twoFaInput.value = it.two_factor_note || "";
        notesInput.value = it.notes || "";
      }
    } else {
      modalTitle.textContent = "➕ Додати в Склерозник";
      titleInput.value = "";
      catSelect.value = this.state.currentCategory !== "all" ? this.state.currentCategory : "ai";
      loginInput.value = "";
      pwdInput.value = "";
      urlInput.value = "";
      planSelect.value = "";
      twoFaInput.value = "";
      notesInput.value = "";
    }
    titleInput.focus();
  },

  closeEditModal() {
    document.getElementById("vault-edit-modal")?.classList.add("hidden");
    this.state.editingId = null;
  },

  generatePassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
    let pwd = "";
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const pwdInput = document.getElementById("v-input-pwd");
    if (pwdInput) {
      pwdInput.value = pwd;
      pwdInput.type = "text";
      showToast("🎲 Згенеровано надійний пароль!");
    }
  },

  async saveItem(e) {
    if (e) e.preventDefault();
    const title = document.getElementById("v-input-title")?.value?.trim();
    if (!title) {
      showToast("⚠️ Будь ласка, вкажіть назву сервісу");
      return;
    }

    const payload = {
      title: title,
      category: document.getElementById("v-input-cat")?.value || "other",
      login: document.getElementById("v-input-login")?.value?.trim() || null,
      password: document.getElementById("v-input-pwd")?.value?.trim() || null,
      website_url: document.getElementById("v-input-url")?.value?.trim() || null,
      plan_type: document.getElementById("v-input-plan")?.value || null,
      two_factor_note: document.getElementById("v-input-2fa")?.value?.trim() || null,
      notes: document.getElementById("v-input-notes")?.value?.trim() || null,
    };

    try {
      if (this.state.editingId) {
        await apiFetch(`/api/v1/vault/items/${this.state.editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("✅ Запис оновлено!");
      } else {
        await apiFetch("/api/v1/vault/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("✅ Запис збережено в Склерозник!");
      }
      this.closeEditModal();
      await this.loadItems();
    } catch (err) {
      showToast(`❌ Помилка: ${err.message}`);
    }
  },

  async deleteItem(id) {
    const it = this.state.items.find(x => x.id === id);
    const title = it ? it.title : "цей запис";
    if (!confirm(`Видалити «${title}» зі Склерозника?`)) return;

    try {
      await apiFetch(`/api/v1/vault/items/${id}`, { method: "DELETE" });
      showToast("🗑️ Запис видалено");
      this.state.items = this.state.items.filter(x => x.id !== id);
      this.renderItems();
      this.updateCounts();
    } catch (err) {
      showToast(`Помилка: ${err.message}`);
    }
  },

  // --- Voice dictation into Vault ---
  async toggleVoiceInput() {
    const voiceBtn = document.getElementById("vault-voice-btn");
    if (this.state.isRecording) {
      this.stopVoiceInput();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.state.audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";
      this.state.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.state.audioChunks.push(e.data);
      };

      this.state.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.state.audioChunks, { type: mimeType });
        stream.getTracks().forEach(t => t.stop());
        await this.processVoiceAudio(audioBlob, mimeType);
      };

      this.state.mediaRecorder.start();
      this.state.isRecording = true;
      if (voiceBtn) {
        voiceBtn.style.background = "#ef4444";
        voiceBtn.style.color = "#fff";
        voiceBtn.innerHTML = "<span>⏹️ Зупинити</span>";
      }
      showToast("🎙️ Говоріть: назву, логін, пароль, Wi-Fi...", 4000);
    } catch (err) {
      showToast(`❌ Помилка мікрофона: ${err.message}`);
    }
  },

  stopVoiceInput() {
    if (this.state.mediaRecorder && this.state.mediaRecorder.state !== "inactive") {
      this.state.mediaRecorder.stop();
    }
    this.state.isRecording = false;
    const voiceBtn = document.getElementById("vault-voice-btn");
    if (voiceBtn) {
      voiceBtn.style.background = "";
      voiceBtn.style.color = "";
      voiceBtn.innerHTML = "<span>🎙️ Голос</span>";
    }
  },

  async processVoiceAudio(blob, mimeType) {
    showToast("⏳ Розпізнаю голос через Gemini AI...", 5000);
    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    try {
      const res = await apiFetch("/api/v1/system/transcribe-audio", {
        method: "POST",
        body: formData,
      });

      if (res && res.text) {
        showToast(`🎙️ Розпізнано: «${res.text}»`, 3500);
        // Parse the transcribed text into vault items
        await this.parseBulkText(res.text);
      } else {
        showToast("⚠️ Не вдалося розібрати слова, спробуйте ще раз");
      }
    } catch (err) {
      showToast(`❌ Помилка обробки голосу: ${err.message}`);
    }
  },

  // --- Photo OCR (Gemini Vision) ---
  async handleImageSelected(e) {
    const file = e.target?.files?.[0];
    if (!file) return;

    showToast("🔍 Зчитую паролі з фото через Gemini Vision OCR...", 6000);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await apiFetch("/api/v1/vault/ai-parse-image", {
        method: "POST",
        body: formData,
      });

      if (res && res.items && res.items.length > 0) {
        this.openReviewModal(res.items);
      } else {
        showToast("⚠️ Не вдалося знайти паролі на фото. Переконайтеся, що аркуш добре освітлений.");
      }
    } catch (err) {
      showToast(`❌ Помилка розпізнавання: ${err.message}`);
    } finally {
      e.target.value = "";
    }
  },

  // --- Bulk Text Paste ---
  openBulkModal() {
    document.getElementById("vault-bulk-modal")?.classList.remove("hidden");
    document.getElementById("vault-bulk-textarea")?.focus();
  },

  closeBulkModal() {
    document.getElementById("vault-bulk-modal")?.classList.add("hidden");
    const ta = document.getElementById("vault-bulk-textarea");
    if (ta) ta.value = "";
  },

  async submitBulkText() {
    const text = document.getElementById("vault-bulk-textarea")?.value?.trim();
    if (!text) {
      showToast("⚠️ Вставте текст або таблицю з паролями");
      return;
    }
    this.closeBulkModal();
    await this.parseBulkText(text);
  },

  async parseBulkText(text) {
    showToast("🤖 Структурую через Gemini AI...", 4500);
    try {
      const res = await apiFetch("/api/v1/vault/ai-parse-text", {
        method: "POST",
        body: JSON.stringify({ text }),
      });

      if (res && res.items && res.items.length > 0) {
        this.openReviewModal(res.items);
      } else {
        showToast("⚠️ Не вдалося знайти записи. Спробуйте уточнити формат.");
      }
    } catch (err) {
      showToast(`❌ Помилка: ${err.message}`);
    }
  },

  // --- Review and Confirm Modal (Safety Check) ---
  openReviewModal(items) {
    this.state.parsedQueue = items.map((it, idx) => ({ ...it, _tempId: idx }));
    const modal = document.getElementById("vault-review-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    this.renderReviewItems();
  },

  closeReviewModal() {
    document.getElementById("vault-review-modal")?.classList.add("hidden");
    this.state.parsedQueue = [];
  },

  renderReviewItems() {
    const container = document.getElementById("vault-review-list");
    if (!container) return;

    if (this.state.parsedQueue.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>Усі записи перевірено або видалено</p></div>`;
      return;
    }

    container.innerHTML = this.state.parsedQueue.map(it => `
      <div class="stat-card" style="margin-bottom:8px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border-color);position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
          <input type="text" value="${escapeHtml(it.title || '')}" placeholder="Назва сервісу" style="flex:1;font-weight:700;font-size:0.88rem;background:transparent;border:none;border-bottom:1px solid var(--border-color);color:var(--text-main);padding:2px 0;" onchange="VaultModule.updateParsedItem(${it._tempId}, 'title', this.value)" />
          
          <select style="font-size:0.75rem;padding:3px 6px;border-radius:6px;background:var(--bg-card);color:var(--text-main);border:1px solid var(--border-color);" onchange="VaultModule.updateParsedItem(${it._tempId}, 'category', this.value)">
            <option value="ai" ${it.category === 'ai' ? 'selected' : ''}>🤖 ШІ</option>
            <option value="social" ${it.category === 'social' ? 'selected' : ''}>💬 Соцмережі</option>
            <option value="email" ${it.category === 'email' ? 'selected' : ''}>📬 Пошти</option>
            <option value="crypto" ${it.category === 'crypto' ? 'selected' : ''}>📈 Крипта</option>
            <option value="wifi" ${it.category === 'wifi' ? 'selected' : ''}>📶 Wi-Fi</option>
            <option value="devices" ${it.category === 'devices' ? 'selected' : ''}>📱 Пристрої</option>
            <option value="other" ${it.category === 'other' ? 'selected' : ''}>📝 Інше</option>
          </select>

          <button type="button" class="action-btn-sm" style="color:var(--danger,#ff453a);padding:2px 6px;font-size:0.75rem;" onclick="VaultModule.removeParsedItem(${it._tempId})">❌</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
          <input type="text" value="${escapeHtml(it.login || '')}" placeholder="Логін / Email / SSID" style="font-size:0.8rem;padding:5px 8px;border-radius:6px;background:var(--bg-card);color:var(--text-main);border:1px solid var(--border-color);" onchange="VaultModule.updateParsedItem(${it._tempId}, 'login', this.value)" />
          <input type="text" value="${escapeHtml(it.password || '')}" placeholder="Пароль" style="font-size:0.8rem;padding:5px 8px;border-radius:6px;background:var(--bg-card);color:var(--text-main);border:1px solid var(--border-color);font-family:monospace;" onchange="VaultModule.updateParsedItem(${it._tempId}, 'password', this.value)" />
        </div>

        ${(it.website_url || it.notes) ? `
          <div style="font-size:0.75rem;color:var(--text-muted);display:flex;gap:6px;align-items:center;">
            ${it.website_url ? `<span>🔗 ${escapeHtml(it.website_url)}</span>` : ''}
            ${it.notes ? `<span>• ${escapeHtml(it.notes)}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `).join("");

    const countEl = document.getElementById("vault-review-count");
    if (countEl) countEl.textContent = this.state.parsedQueue.length;
  },

  updateParsedItem(tempId, field, value) {
    const item = this.state.parsedQueue.find(x => x._tempId === tempId);
    if (item) {
      item[field] = value;
    }
  },

  removeParsedItem(tempId) {
    this.state.parsedQueue = this.state.parsedQueue.filter(x => x._tempId !== tempId);
    this.renderReviewItems();
  },

  async confirmBulkSave() {
    if (this.state.parsedQueue.length === 0) {
      showToast("⚠️ Немає записів для збереження");
      return;
    }

    const saveBtn = document.getElementById("vault-review-save-btn");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "⏳ Зберігаю...";
    }

    try {
      const itemsToSave = this.state.parsedQueue.map(it => ({
        title: it.title,
        category: it.category || "other",
        login: it.login || null,
        password: it.password || null,
        website_url: it.website_url || null,
        plan_type: it.plan_type || null,
        two_factor_note: it.two_factor_note || null,
        notes: it.notes || null,
        is_favorite: false,
      }));

      const res = await apiFetch("/api/v1/vault/bulk-save", {
        method: "POST",
        body: JSON.stringify({ items: itemsToSave }),
      });

      showToast(`🎉 ${res.message || 'Записи збережено!'}`);
      this.closeReviewModal();
      await this.loadItems();
    } catch (err) {
      showToast(`❌ Помилка: ${err.message}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "✅ Зберегти всі в Склерозник";
      }
    }
  },

  // --- Export Modal ---
  async openExportModal() {
    const modal = document.getElementById("vault-export-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    const ta = document.getElementById("vault-export-text");
    if (ta) ta.value = "⏳ Формую список доступу...";

    try {
      const cat = this.state.currentCategory;
      const res = await apiFetch(`/api/v1/vault/export?category=${cat}`);
      if (ta && res && res.text_content) {
        ta.value = res.text_content;
      }
    } catch (err) {
      if (ta) ta.value = `Помилка: ${err.message}`;
    }
  },

  closeExportModal() {
    document.getElementById("vault-export-modal")?.classList.add("hidden");
  },

  copyExportText() {
    const ta = document.getElementById("vault-export-text");
    if (ta && ta.value) {
      this.copyText(ta.value, "Резервний список доступу");
    }
  },

  // --- Wi-Fi QR Code Modal ---
  showWifiQR(title, ssid, password) {
    const modal = document.getElementById("vault-qr-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    document.getElementById("vault-qr-title").textContent = title || "Wi-Fi мережа";
    document.getElementById("vault-qr-ssid").textContent = ssid;
    document.getElementById("vault-qr-pwd").textContent = password;

    // Standard Wi-Fi QR payload: WIFI:S:MySSID;T:WPA;P:MyPassword;;
    const qrData = `WIFI:S:${ssid};T:WPA;P:${password};;`;
    const imgEl = document.getElementById("vault-qr-img");
    if (imgEl) {
      imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;
    }
  },

  closeQrModal() {
    document.getElementById("vault-qr-modal")?.classList.add("hidden");
  },

  init() {
    // Search input
    const searchInput = document.getElementById("vault-search-input");
    let searchTimeout = null;
    searchInput?.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.state.searchQuery = e.target.value;
        this.loadItems();
      }, 250);
    });

    // Category pills
    document.querySelectorAll(".vault-cat-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const cat = pill.dataset.cat;
        if (cat) this.setCategory(cat);
      });
    });

    // Top action buttons
    document.getElementById("vault-add-btn")?.addEventListener("click", () => this.openEditModal());
    document.getElementById("vault-voice-btn")?.addEventListener("click", () => this.toggleVoiceInput());
    document.getElementById("vault-bulk-btn")?.addEventListener("click", () => this.openBulkModal());
    document.getElementById("vault-export-btn")?.addEventListener("click", () => this.openExportModal());

    // File input for photo OCR
    document.getElementById("vault-photo-btn")?.addEventListener("click", () => {
      document.getElementById("vault-file-input")?.click();
    });
    document.getElementById("vault-file-input")?.addEventListener("change", (e) => this.handleImageSelected(e));

    // Modal close buttons & backdrops
    document.getElementById("vault-modal-close-btn")?.addEventListener("click", () => this.closeEditModal());
    document.getElementById("vault-modal-cancel-btn")?.addEventListener("click", () => this.closeEditModal());
    document.getElementById("vault-form")?.addEventListener("submit", (e) => this.saveItem(e));
    document.getElementById("vault-gen-pwd-btn")?.addEventListener("click", () => this.generatePassword());

    document.getElementById("vault-bulk-close-btn")?.addEventListener("click", () => this.closeBulkModal());
    document.getElementById("vault-bulk-cancel-btn")?.addEventListener("click", () => this.closeBulkModal());
    document.getElementById("vault-bulk-submit-btn")?.addEventListener("click", () => this.submitBulkText());

    document.getElementById("vault-review-close-btn")?.addEventListener("click", () => this.closeReviewModal());
    document.getElementById("vault-review-cancel-btn")?.addEventListener("click", () => this.closeReviewModal());
    document.getElementById("vault-review-save-btn")?.addEventListener("click", () => this.confirmBulkSave());

    document.getElementById("vault-export-close-btn")?.addEventListener("click", () => this.closeExportModal());
    document.getElementById("vault-export-copy-btn")?.addEventListener("click", () => this.copyExportText());

    document.getElementById("vault-qr-close-btn")?.addEventListener("click", () => this.closeQrModal());

    // Close on backdrop clicks
    ["vault-edit-modal", "vault-bulk-modal", "vault-review-modal", "vault-export-modal", "vault-qr-modal"].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener("click", (e) => {
        if (e.target === el) el.classList.add("hidden");
      });
    });
  }
};

function escapeJsString(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

window.VaultModule = VaultModule;
window.loadVaultTab = function() {
  VaultModule.loadItems();
};
