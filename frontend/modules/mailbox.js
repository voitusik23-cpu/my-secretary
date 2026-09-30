// ===================================================
// Мой Секретарь — Окремий Модуль «Пошта та Фільтр Спаму»
// frontend/modules/mailbox.js (v3.7.2)
// ===================================================

const MailboxModule = {
  state: {
    accounts: [],
    selectedAccountId: null,
    currentFilter: "spam", // "spam" | "important" | "accounts"
    messages: [],
    selectedMessageIds: new Set(),
    isChecking: false,
    isCleaning: false,
    summary: null,
  },

  async loadData() {
    await Promise.all([
      this.loadAccounts(),
      this.loadMessages(),
      this.loadSummary()
    ]);
  },

  async loadAccounts() {
    try {
      const res = await apiFetch("/api/v1/mailbox/accounts");
      this.state.accounts = Array.isArray(res) ? res : [];
      this.renderAccountsBar();
      this.updateCounts();
      if (this.state.currentFilter === "accounts") {
        this.renderAccountsList();
      }
    } catch (err) {
      console.warn("Failed to load mail accounts:", err);
    }
  },

  async loadMessages() {
    const listEl = document.getElementById("mail-content-area");
    if (!listEl) return;

    if (this.state.currentFilter === "accounts") {
      this.renderAccountsList();
      return;
    }

    try {
      let url = `/api/v1/mailbox/messages?category=${this.state.currentFilter}`;
      if (this.state.selectedAccountId) {
        url += `&account_id=${this.state.selectedAccountId}`;
      }

      const res = await apiFetch(url);
      this.state.messages = Array.isArray(res) ? res : [];
      this.renderMessagesList();
      this.updateCounts();
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Помилка завантаження: ${escapeHtml(err.message)}</p></div>`;
    }
  },

  async loadSummary() {
    try {
      const sum = await apiFetch("/api/v1/mailbox/summary");
      if (sum) {
        this.state.summary = sum;
        const digestTextEl = document.getElementById("mail-digest-text");
        if (digestTextEl && sum.digest) {
          digestTextEl.textContent = sum.digest;
        }
      }
    } catch (err) {
      console.warn("Failed to load mail summary:", err);
    }
  },

  updateCounts() {
    let spamCount = 0;
    let importantCount = 0;
    this.state.accounts.forEach(a => {
      spamCount += (a.spam_count || 0);
      importantCount += (a.important_count || 0);
    });

    const spamEl = document.getElementById("mail-spam-count");
    const impEl = document.getElementById("mail-important-count");
    const accEl = document.getElementById("mail-accounts-count");

    if (spamEl) spamEl.textContent = spamCount;
    if (impEl) impEl.textContent = importantCount;
    if (accEl) accEl.textContent = this.state.accounts.length;
  },

  renderAccountsBar() {
    const bar = document.getElementById("mail-accounts-bar");
    if (!bar) return;

    let html = `
      <button class="music-pl-pill ${!this.state.selectedAccountId ? 'active' : ''}" onclick="MailboxModule.selectAccount(null)">
        🌐 Всі скриньки (${this.state.accounts.length})
      </button>
    `;

    html += this.state.accounts.map(acc => {
      const isSel = this.state.selectedAccountId === acc.id;
      return `
        <button class="music-pl-pill ${isSel ? 'active' : ''}" onclick="MailboxModule.selectAccount(${acc.id})">
          📫 ${escapeHtml(acc.name || acc.email)} (${acc.messages_count || 0})
        </button>
      `;
    }).join("");

    bar.innerHTML = html;
  },

  selectAccount(accId) {
    this.state.selectedAccountId = accId;
    this.renderAccountsBar();
    this.loadMessages();
  },

  setFilter(filter) {
    this.state.currentFilter = filter;
    document.querySelectorAll(".mail-cat-pill").forEach(p => {
      if (p.dataset.cat === filter) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });

    if (filter === "accounts") {
      this.renderAccountsList();
    } else {
      this.loadMessages();
    }
  },

  renderMessagesList() {
    const container = document.getElementById("mail-content-area");
    if (!container) return;

    const msgs = this.state.messages || [];

    if (msgs.length === 0) {
      if (this.state.accounts.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📬</span>
            <p><strong>Ще немає підключених скриньок</strong></p>
            <p style="font-size:0.85rem;color:var(--text-muted);margin-top:6px;max-width:440px;margin-inline:auto;">
              Додайте ваші поштові скриньки (Gmail, Ukr.net, Yahoo та ін.), щоб AI перевірив їх та відділив важливі листи від сміття.
            </p>
            <button class="btn-primary" style="margin-top:14px;padding:10px 20px;" onclick="MailboxModule.openAddAccountModal()">
              + Додати першу скриньку
            </button>
          </div>
        `;
        return;
      }

      const isSpam = this.state.currentFilter === "spam";
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">${isSpam ? '🎉' : '⭐'}</span>
          <p>${isSpam ? 'У пошті немає сміття та спаму! Чисто.' : 'Важливих листів наразі немає.'}</p>
          <button class="action-btn-sm" style="margin-top:10px;" onclick="MailboxModule.checkMailboxes()">
            ⚡ Перевірити пошту зараз
          </button>
        </div>
      `;
      return;
    }

    const isSpamFilter = this.state.currentFilter === "spam";

    const bulkActionHeader = isSpamFilter ? `
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(239,68,68,0.1);border:1px dashed rgba(239,68,68,0.35);padding:10px 14px;border-radius:12px;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="font-size:0.86rem;font-weight:700;color:var(--text-main);">
          🗑️ Знайдено ${msgs.length} рекламних та спам-листів
        </div>
        <button type="button" class="btn-primary" style="background:#ef4444;color:#fff;border:none;padding:7px 14px;font-size:0.82rem;font-weight:700;border-radius:8px;box-shadow:0 3px 10px rgba(239,68,68,0.35);" onclick="MailboxModule.cleanSpam()">
          🔥 Видалити все сміття з пошти
        </button>
      </div>
    ` : "";

    container.innerHTML = bulkActionHeader + msgs.map(m => {
      const d = m.date ? new Date(m.date) : new Date();
      const dateStr = d.toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

      const badge = m.is_spam 
        ? `<span class="item-badge" style="background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">🗑️ ${escapeHtml(m.spam_reason || 'Спам')}</span>`
        : (m.category === "important" 
            ? `<span class="item-badge" style="background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid rgba(34,197,94,0.3);">⭐ Важливе</span>`
            : `<span class="item-badge" style="background:rgba(14,165,233,0.18);color:#0ea5e9;border:1px solid rgba(14,165,233,0.3);">📩 Звичайний</span>`);

      return `
        <div class="stat-card" style="margin-bottom:8px;padding:12px;display:flex;gap:12px;align-items:flex-start;position:relative;cursor:pointer;transition:transform 0.15s, background 0.15s;" onclick="MailboxModule.openMessagePreview(${m.id})">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                <span style="font-size:1.05rem;">${m.is_spam ? '🚫' : '📩'}</span>
                <strong style="font-size:0.92rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${escapeHtml(m.sender || m.sender_email || 'Невідомий')}
                </strong>
                ${m.account_name ? `<span style="font-size:0.72rem;color:var(--text-muted);background:var(--bg-input);padding:2px 6px;border-radius:6px;">${escapeHtml(m.account_name)}</span>` : ''}
              </div>
              <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${dateStr}</span>
            </div>

            <div style="font-weight:700;font-size:0.92rem;color:var(--text-main);margin-bottom:4px;">
              ${escapeHtml(m.subject)}
            </div>

            ${m.snippet ? `<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.4;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(m.snippet)}</div>` : ''}

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;" onclick="event.stopPropagation();">
              <div>${badge}</div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="action-btn-sm" style="font-size:0.76rem;padding:3px 9px;" onclick="MailboxModule.openMessagePreview(${m.id})" title="Читати повний лист">
                  👁️ Читати
                </button>
                <button type="button" class="action-btn-sm" style="font-size:0.76rem;color:var(--danger,#ff453a);padding:3px 8px;" onclick="MailboxModule.deleteSingleMessage(${m.id})" title="Видалити лист із сервера">
                  🗑️ Видалити
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  renderAccountsList() {
    const container = document.getElementById("mail-content-area");
    if (!container) return;

    if (this.state.accounts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚙️</span>
          <p>Немає налаштованих поштових скриньок.</p>
          <button class="btn-primary" style="margin-top:12px;padding:10px 20px;" onclick="MailboxModule.openAddAccountModal()">
            + Додати скриньку
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:0.85rem;color:var(--text-muted);font-weight:700;">Підключені скриньки (${this.state.accounts.length} з 20):</span>
        <button class="action-btn-sm" onclick="MailboxModule.openAddAccountModal()">+ Додати ще скриньку</button>
      </div>
      ${this.state.accounts.map(acc => {
        const lastCheck = acc.last_checked_at 
          ? new Date(acc.last_checked_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) 
          : "Ще не перевірялось";

        return `
          <div class="stat-card" style="margin-bottom:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:1.3rem;">📫</span>
                <div>
                  <strong style="font-size:0.98rem;color:var(--text-main);">${escapeHtml(acc.name || acc.email)}</strong>
                  <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(acc.email)} • ${acc.imap_server}:${acc.imap_port}</div>
                </div>
              </div>
              <div style="margin-top:6px;display:flex;gap:6px;font-size:0.75rem;color:var(--text-muted);">
                <span>Всього: <strong>${acc.messages_count || 0}</strong></span>
                <span>•</span>
                <span style="color:#ef4444;">Спам: <strong>${acc.spam_count || 0}</strong></span>
                <span>•</span>
                <span style="color:#22c55e;">Важливі: <strong>${acc.important_count || 0}</strong></span>
                <span>•</span>
                <span>Оновлено: ${lastCheck}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="action-btn-sm" onclick="MailboxModule.checkMailboxes(${acc.id})" title="Перевірити зараз">⚡ Перевірити</button>
              <button class="action-btn-sm" style="color:var(--danger,#ff453a);" onclick="MailboxModule.deleteAccount(${acc.id})" title="Видалити скриньку">🗑️</button>
            </div>
          </div>
        `;
      }).join("")}
    `;
  },

  async checkMailboxes(accId = null) {
    if (this.state.isChecking) return;
    const checkBtn = document.getElementById("mail-check-all-btn");

    try {
      this.state.isChecking = true;
      if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = "⏳ Перевіряю пошту...";
      }
      showToast("🔍 З'єднуюсь із серверами пошти та аналізую вхідні...", 3500);

      const url = accId ? `/api/v1/mailbox/check?account_id=${accId}` : "/api/v1/mailbox/check";
      const res = await apiFetch(url, { method: "POST" });

      if (res && res.summary) {
        showToast(`✅ ${res.summary}`, 5000);
      } else {
        showToast("✅ Перевірку пошти завершено!");
      }

      await this.loadData();
    } catch (err) {
      showToast(`❌ Помилка перевірки: ${err.message}`);
    } finally {
      this.state.isChecking = false;
      if (checkBtn) {
        checkBtn.disabled = false;
        checkBtn.textContent = "⚡ Перевірити пошту";
      }
    }
  },

  async cleanSpam() {
    if (this.state.isCleaning) return;

    let targetName = "всіх підключених скриньках";
    if (this.state.selectedAccountId) {
      const acc = this.state.accounts.find(a => a.id === this.state.selectedAccountId);
      if (acc) targetName = `скриньці «${acc.name || acc.email}»`;
    }

    if (!confirm(`Видалити весь виявлений спам та сміття у ${targetName}?\nЛисти буде видалено на сервері пошти!`)) {
      return;
    }

    const cleanBtn = document.getElementById("mail-clean-spam-btn");

    try {
      this.state.isCleaning = true;
      if (cleanBtn) {
        cleanBtn.disabled = true;
        cleanBtn.textContent = "🧹 Видаляю...";
      }
      showToast("🧹 Очищаю спам із поштових серверів...", 3500);

      const payload = {
        account_id: this.state.selectedAccountId || null
      };

      const res = await apiFetch("/api/v1/mailbox/clean-spam", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showToast(res.message || "🧹 Спам успішно видалено!", 4500);
      await this.loadData();
    } catch (err) {
      showToast(`❌ Помилка очищення: ${err.message}`);
    } finally {
      this.state.isCleaning = false;
      if (cleanBtn) {
        cleanBtn.disabled = false;
        cleanBtn.textContent = "🗑️ Очистити сміття";
      }
    }
  },

  async deleteSingleMessage(msgId) {
    if (!confirm("Видалити цей лист із поштової скриньки назавжди?")) return;
    try {
      await apiFetch(`/api/v1/mailbox/messages/${msgId}`, { method: "DELETE" });
      showToast("🗑️ Лист видалено");
      this.state.messages = this.state.messages.filter(m => m.id !== msgId);
      this.renderMessagesList();
      this.loadSummary();
    } catch (err) {
      showToast(`Помилка: ${err.message}`);
    }
  },

  async openMessagePreview(msgId) {
    const modal = document.getElementById("mail-preview-modal");
    if (!modal) return;

    modal.classList.remove("hidden");

    const subjectEl = document.getElementById("mail-preview-subject");
    const senderEl = document.getElementById("mail-preview-sender");
    const dateEl = document.getElementById("mail-preview-date");
    const accLineEl = document.getElementById("mail-preview-account-line");
    const badgeEl = document.getElementById("mail-preview-badge");
    const bodyEl = document.getElementById("mail-preview-body");
    const webmailBtn = document.getElementById("mail-preview-webmail-btn");
    const deleteBtn = document.getElementById("mail-preview-delete-btn");

    // Quick populate from cached state
    const cached = (this.state.messages || []).find(m => m.id === msgId);
    if (cached) {
      if (subjectEl) subjectEl.textContent = cached.subject || "(Без теми)";
      if (senderEl) senderEl.textContent = cached.sender || cached.sender_email || "Невідомий";
      const d = cached.date ? new Date(cached.date) : new Date();
      if (dateEl) dateEl.textContent = d.toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      if (accLineEl) accLineEl.textContent = `Скринька: ${cached.account_name || cached.account_email || ''}`;
      if (badgeEl) {
        badgeEl.innerHTML = cached.is_spam 
          ? `<span class="item-badge" style="background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">🗑️ ${escapeHtml(cached.spam_reason || 'Спам')}</span>`
          : (cached.category === "important" 
              ? `<span class="item-badge" style="background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid rgba(34,197,94,0.3);">⭐ Важливе</span>`
              : `<span class="item-badge" style="background:rgba(14,165,233,0.18);color:#0ea5e9;border:1px solid rgba(14,165,233,0.3);">📩 Звичайний</span>`);
      }
      if (bodyEl) {
        bodyEl.textContent = cached.snippet || "Завантажую текст листа з сервера...";
      }
    } else {
      if (bodyEl) bodyEl.textContent = "Завантаження листа...";
    }

    // Configure delete button inside preview modal
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        this.closeMessagePreview();
        await this.deleteSingleMessage(msgId);
      };
    }

    try {
      const data = await apiFetch(`/api/v1/mailbox/messages/${msgId}`);
      if (data) {
        if (subjectEl) subjectEl.textContent = data.subject || "(Без теми)";
        if (senderEl) senderEl.textContent = `${data.sender || ''} ${data.sender_email ? '<' + data.sender_email + '>' : ''}`;
        const d = data.date ? new Date(data.date) : new Date();
        if (dateEl) dateEl.textContent = d.toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
        if (accLineEl) accLineEl.textContent = `Скринька: ${data.account_name || data.account_email || ''} • Кому: ${data.recipient || ''}`;
        
        if (badgeEl) {
          badgeEl.innerHTML = data.is_spam 
            ? `<span class="item-badge" style="background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid rgba(239,68,68,0.3);">🗑️ ${escapeHtml(data.spam_reason || 'Спам')}</span>`
            : (data.category === "important" 
                ? `<span class="item-badge" style="background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid rgba(34,197,94,0.3);">⭐ Важливе</span>`
                : `<span class="item-badge" style="background:rgba(14,165,233,0.18);color:#0ea5e9;border:1px solid rgba(14,165,233,0.3);">📩 Звичайний</span>`);
        }

        if (bodyEl) {
          bodyEl.textContent = data.body || data.snippet || "(Текст листа порожній або містить тільки медіавкладення)";
        }

        if (webmailBtn) {
          if (data.webmail_url) {
            webmailBtn.href = data.webmail_url;
            webmailBtn.style.display = "inline-flex";
            const label = data.webmail_url.includes("gmail") ? "🌐 Відкрити в Gmail ↗" : (data.webmail_url.includes("ukr.net") ? "🌐 Відкрити в Ukr.net ↗" : "🌐 Відкрити в пошті ↗");
            const spanEl = webmailBtn.querySelector("span");
            if (spanEl) spanEl.textContent = label;
          } else {
            webmailBtn.style.display = "none";
          }
        }
      }
    } catch (err) {
      if (bodyEl && (!bodyEl.textContent || bodyEl.textContent.includes("Завантаж"))) {
        bodyEl.textContent = `Помилка завантаження листа: ${err.message}`;
      }
    }
  },

  closeMessagePreview() {
    document.getElementById("mail-preview-modal")?.classList.add("hidden");
  },

  async deleteAccount(accId) {
    const acc = this.state.accounts.find(a => a.id === accId);
    const name = acc ? acc.name || acc.email : "цю скриньку";
    if (!confirm(`Відключити ${name} від Секретаря?`)) return;

    try {
      await apiFetch(`/api/v1/mailbox/accounts/${accId}`, { method: "DELETE" });
      showToast("🗑️ Скриньку відключено");
      if (this.state.selectedAccountId === accId) {
        this.state.selectedAccountId = null;
      }
      await this.loadData();
    } catch (err) {
      showToast(`Помилка: ${err.message}`);
    }
  },

  speakDigest() {
    const text = document.getElementById("mail-digest-text")?.textContent?.trim();
    if (!text) return;

    if (!window.speechSynthesis) {
      showToast("Синтез мови не підтримується у цьому браузері");
      return;
    }

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "uk-UA";
    utter.rate = 1.0;
    window.speechSynthesis.speak(utter);
    showToast("🔊 Озвучую звіт пошти...");
  },

  openAddAccountModal() {
    document.getElementById("mail-add-account-modal")?.classList.remove("hidden");
    document.getElementById("mail-acc-email")?.focus();
  },

  closeAddAccountModal() {
    document.getElementById("mail-add-account-modal")?.classList.add("hidden");
    const fb = document.getElementById("mail-acc-feedback");
    if (fb) fb.textContent = "";
  },

  async submitAddAccount(e) {
    if (e) e.preventDefault();
    const emailEl = document.getElementById("mail-acc-email");
    const nameEl = document.getElementById("mail-acc-name");
    const pwdEl = document.getElementById("mail-acc-password");
    const serverEl = document.getElementById("mail-acc-server");
    const portEl = document.getElementById("mail-acc-port");
    const fbEl = document.getElementById("mail-acc-feedback");
    const submitBtn = document.getElementById("mail-acc-submit-btn");

    const emailVal = emailEl?.value?.trim();
    const pwdVal = pwdEl?.value?.trim();
    if (!emailVal || !pwdVal) {
      if (fbEl) fbEl.textContent = "Будь ласка, заповніть пошту та пароль!";
      return;
    }

    let cleanPwd = pwdVal;
    if (emailVal.toLowerCase().includes("@gmail.com") && cleanPwd.replace(/\s+/g, "").length === 16) {
      cleanPwd = cleanPwd.replace(/\s+/g, "");
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Перевіряю зв'язок...";
      }
      if (fbEl) fbEl.textContent = "Підключаюсь до IMAP сервера...";

      const payload = {
        email: emailVal,
        name: nameEl?.value?.trim() || null,
        password: cleanPwd,
        imap_server: serverEl?.value?.trim() || null,
        imap_port: portEl?.value ? parseInt(portEl.value) : 993,
        use_ssl: true
      };

      const res = await apiFetch("/api/v1/mailbox/accounts", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showToast(`✅ Скриньку «${res.email}» успішно підключено!`);
      this.closeAddAccountModal();

      // Clear fields
      if (emailEl) emailEl.value = "";
      if (nameEl) nameEl.value = "";
      if (pwdEl) pwdEl.value = "";
      if (serverEl) serverEl.value = "";

      await this.loadData();
      // Auto-trigger initial check for new account
      this.checkMailboxes(res.id);
    } catch (err) {
      if (fbEl) fbEl.textContent = `❌ ${err.message}`;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 Підключити скриньку";
      }
    }
  },

  init() {
    document.getElementById("mail-check-all-btn")?.addEventListener("click", () => this.checkMailboxes());
    document.getElementById("mail-clean-spam-btn")?.addEventListener("click", () => this.cleanSpam());
    document.getElementById("mail-add-account-btn")?.addEventListener("click", () => this.openAddAccountModal());
    document.getElementById("mail-speak-digest-btn")?.addEventListener("click", () => this.speakDigest());
    document.getElementById("mail-acc-close-btn")?.addEventListener("click", () => this.closeAddAccountModal());
    document.getElementById("mail-acc-cancel-btn")?.addEventListener("click", () => this.closeAddAccountModal());
    document.getElementById("mail-add-account-form")?.addEventListener("submit", (e) => this.submitAddAccount(e));

    // Mail preview modal close listeners
    document.getElementById("mail-preview-close-btn")?.addEventListener("click", () => this.closeMessagePreview());
    document.getElementById("mail-preview-cancel-btn")?.addEventListener("click", () => this.closeMessagePreview());
    const previewModal = document.getElementById("mail-preview-modal");
    previewModal?.addEventListener("click", (e) => {
      if (e.target === previewModal) this.closeMessagePreview();
    });

    const addAccModal = document.getElementById("mail-add-account-modal");
    addAccModal?.addEventListener("click", (e) => {
      if (e.target === addAccModal) this.closeAddAccountModal();
    });

    // Category pills filter
    document.querySelectorAll(".mail-cat-pill").forEach(p => {
      p.addEventListener("click", () => {
        const cat = p.dataset.cat;
        if (cat) this.setFilter(cat);
      });
    });

    // Auto-detect server helper when email is typed
    const emailInput = document.getElementById("mail-acc-email");
    const serverInput = document.getElementById("mail-acc-server");
    const helpHint = document.getElementById("mail-hint-text");

    const updateProviderHint = () => {
      const val = emailInput.value.toLowerCase().trim();
      if (val.includes("@gmail.com") || val.includes("@googlemail.com")) {
        if (serverInput && !serverInput.value) serverInput.value = "imap.gmail.com";
        if (helpHint) helpHint.innerHTML = "Для захисту Google вимагає окремий <strong>16-значний пароль додатку</strong>. Основний пароль Google не спрацює.";
      } else if (val.includes("@ukr.net")) {
        if (serverInput && !serverInput.value) serverInput.value = "imap.ukr.net";
        if (helpHint) helpHint.innerHTML = "Для <strong>Ukr.net</strong> увімкніть IMAP у налаштуваннях та створіть 'Пароль для програм'.";
      } else if (val.includes("@yahoo.com")) {
        if (serverInput && !serverInput.value) serverInput.value = "imap.mail.yahoo.com";
        if (helpHint) helpHint.innerHTML = "Для <strong>Yahoo</strong> згенеруйте App Password у безпеці акаунта Yahoo.";
      } else if (val.includes("@outlook.com") || val.includes("@hotmail.com")) {
        if (serverInput && !serverInput.value) serverInput.value = "outlook.office365.com";
        if (helpHint) helpHint.innerHTML = "Для <strong>Outlook</strong> використовуйте звичайний пароль або App Password.";
      }
    };

    emailInput?.addEventListener("blur", updateProviderHint);
    emailInput?.addEventListener("input", updateProviderHint);
  }
};

window.MailboxModule = MailboxModule;
window.loadMailboxTab = function() {
  MailboxModule.loadData();
};
