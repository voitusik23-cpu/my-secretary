// ===================================================
// Мой Секретарь — Окремий Модуль «Пошта та Фільтр Спаму»
// frontend/modules/mailbox.js (v3.7.17)
// ===================================================

const MailboxModule = {
  state: {
    accounts: [],
    selectedAccountId: null,
    currentFilter: "spam", // "spam" | "important" | "accounts"
    currentSubFilter: "all", // "all" | "casino" | "promo" | "bots"
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
      this.renderAccountsFilterSelect();
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
      let url = `/api/v1/mailbox/messages?category=${this.state.currentFilter}&limit=1000`;
      if (this.state.selectedAccountId) {
        url += `&account_id=${this.state.selectedAccountId}`;
      }

      const res = await apiFetch(url);
      this.state.messages = Array.isArray(res) ? res : [];
      
      // Auto-select all spam messages for batch toolbar
      this.state.selectedMessageIds = new Set(this.state.messages.map(m => m.id));

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

  classifySpamSubcategory(m) {
    const text = `${m.subject || ''} ${m.sender || ''} ${m.spam_reason || ''} ${m.snippet || ''}`.toLowerCase();
    if (text.includes("казино") || text.includes("casino") || text.includes("ставки") || text.includes("слоти") || text.includes("рулетка") || text.includes("free spin") || text.includes("фриспин") || text.includes("вигравай")) {
      return "casino";
    }
    if (text.includes("знижк") || text.includes("скидк") || text.includes("акці") || text.includes("розпродаж") || text.includes("aliexpress") || text.includes("шопінг") || text.includes("promo") || text.includes("промо") || text.includes("розсилк")) {
      return "promo";
    }
    if (text.includes("робот") || text.includes("no-reply") || text.includes("noreply") || text.includes("newsletter") || text.includes("дайджест") || text.includes("автоматичн") || text.includes("mailer")) {
      return "bots";
    }
    return "other";
  },

  updateCounts() {
    let spamCount = 0;
    let importantCount = 0;
    this.state.accounts.forEach(a => {
      spamCount += (a.spam_count || 0);
      importantCount += (a.important_count || 0);
    });

    // Subcategory counts based on current spam messages
    let casinoCount = 0;
    let promoCount = 0;
    let botsCount = 0;
    if (this.state.currentFilter === "spam") {
      this.state.messages.forEach(m => {
        const sub = this.classifySpamSubcategory(m);
        if (sub === "casino") casinoCount++;
        else if (sub === "promo") promoCount++;
        else if (sub === "bots") botsCount++;
      });
    }

    // 1. KPI Cards
    const kpiSpam = document.getElementById("mail-kpi-spam");
    const kpiMb = document.getElementById("mail-kpi-mb");
    const kpiImp = document.getElementById("mail-kpi-important");
    const kpiAcc = document.getElementById("mail-kpi-accounts");
    const kpiAccList = document.getElementById("mail-kpi-acc-list");

    if (kpiSpam) kpiSpam.textContent = spamCount;
    if (kpiMb) {
      const mb = Math.max(1, Math.round(spamCount * 0.45));
      kpiMb.textContent = spamCount > 0 ? `~${mb} МБ сміття` : `0 МБ (чисто)`;
    }
    if (kpiImp) kpiImp.textContent = importantCount;
    if (kpiAcc) kpiAcc.textContent = this.state.accounts.length;
    if (kpiAccList) {
      if (this.state.accounts.length === 0) {
        kpiAccList.textContent = "Немає підключених пошт";
      } else {
        const names = this.state.accounts.map(a => a.name || a.email.split("@")[0]).slice(0, 2).join(", ");
        kpiAccList.textContent = names + (this.state.accounts.length > 2 ? ` та ще ${this.state.accounts.length - 2}` : "");
      }
    }

    // 2. Tab Badges
    const spamEl = document.getElementById("mail-spam-count");
    const impEl = document.getElementById("mail-important-count");
    const accEl = document.getElementById("mail-accounts-count");
    if (spamEl) spamEl.textContent = spamCount;
    if (impEl) impEl.textContent = importantCount;
    if (accEl) accEl.textContent = this.state.accounts.length;

    // 3. Subcategory Pill Badges
    const subAll = document.getElementById("mail-subcat-all-count");
    const subCasino = document.getElementById("mail-subcat-casino-count");
    const subPromo = document.getElementById("mail-subcat-promo-count");
    const subBots = document.getElementById("mail-subcat-bots-count");
    if (subAll) subAll.textContent = this.state.messages.length;
    if (subCasino) subCasino.textContent = casinoCount;
    if (subPromo) subPromo.textContent = promoCount;
    if (subBots) subBots.textContent = botsCount;

    // 4. Clean Button label & state
    const cleanBtnCount = document.getElementById("mail-clean-btn-count");
    const cleanBtn = document.getElementById("mail-clean-spam-btn");
    if (cleanBtnCount) cleanBtnCount.textContent = spamCount;
    if (cleanBtn) {
      if (spamCount === 0) {
        cleanBtn.style.opacity = "0.6";
        cleanBtn.title = "У пошті немає спаму для видалення!";
      } else {
        cleanBtn.style.opacity = "1";
        cleanBtn.title = `Видалити всі ${spamCount} спам-листів із сервера`;
      }
    }

    this.updateBatchToolbar();
  },

  updateBatchToolbar() {
    const toolbar = document.getElementById("mail-batch-toolbar");
    const statusText = document.getElementById("mail-selected-status-text");
    const delSelectedBtn = document.getElementById("mail-delete-selected-btn");
    const selectAllCb = document.getElementById("mail-select-all-cb");

    if (!toolbar) return;

    if (this.state.currentFilter !== "spam" || this.state.messages.length === 0) {
      toolbar.style.display = "none";
      return;
    }

    toolbar.style.display = "flex";
    const total = this.state.messages.length;
    const selected = this.state.selectedMessageIds.size;

    if (statusText) {
      statusText.textContent = `Вибрано ${selected} з ${total} листів`;
    }

    if (selectAllCb) {
      selectAllCb.checked = selected > 0 && selected === total;
      selectAllCb.indeterminate = selected > 0 && selected < total;
    }

    if (delSelectedBtn) {
      if (selected > 0 && selected < total) {
        delSelectedBtn.style.display = "inline-block";
        delSelectedBtn.textContent = `Видалити вибрані (${selected})`;
      } else {
        delSelectedBtn.style.display = "none";
      }
    }
  },

  renderAccountsFilterSelect() {
    const sel = document.getElementById("mail-account-filter-select");
    if (!sel) return;

    let html = `<option value="">🌐 Всі скриньки (${this.state.accounts.length})</option>`;
    this.state.accounts.forEach(acc => {
      const isSel = this.state.selectedAccountId === acc.id ? "selected" : "";
      html += `<option value="${acc.id}" ${isSel}>📫 ${escapeHtml(acc.name || acc.email)} (${acc.messages_count || 0})</option>`;
    });
    sel.innerHTML = html;
  },

  selectAccount(accId) {
    this.state.selectedAccountId = accId ? parseInt(accId, 10) : null;
    this.loadMessages();
  },

  setFilter(filter) {
    this.state.currentFilter = filter;
    document.querySelectorAll(".mail-cat-pill").forEach(p => {
      if (p.dataset.cat === filter) {
        p.classList.add("active");
        p.style.background = filter === 'spam' ? 'rgba(239,68,68,0.18)' : (filter === 'important' ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.18)');
        p.style.fontWeight = "800";
      } else {
        p.classList.remove("active");
        p.style.background = "transparent";
        p.style.fontWeight = "600";
      }
    });

    const subcatsBar = document.getElementById("mail-spam-subcats-bar");
    if (subcatsBar) {
      subcatsBar.style.display = filter === "spam" ? "flex" : "none";
    }

    if (filter === "accounts") {
      this.renderAccountsList();
    } else {
      this.loadMessages();
    }
  },

  setSubFilter(subcat) {
    this.state.currentSubFilter = subcat;
    document.querySelectorAll(".mail-subcat-pill").forEach(p => {
      if (p.dataset.subcat === subcat) {
        p.classList.add("active");
        p.style.background = "rgba(255,255,255,0.14)";
        p.style.color = "#ffffff";
        p.style.fontWeight = "700";
      } else {
        p.classList.remove("active");
        p.style.background = "rgba(255,255,255,0.04)";
        p.style.color = "var(--text-muted)";
        p.style.fontWeight = "600";
      }
    });
    this.renderMessagesList();
  },

  renderMessagesList() {
    const container = document.getElementById("mail-content-area");
    if (!container) return;

    let msgs = this.state.messages || [];

    // Filter by subcategory if on spam tab
    if (this.state.currentFilter === "spam" && this.state.currentSubFilter !== "all") {
      msgs = msgs.filter(m => this.classifySpamSubcategory(m) === this.state.currentSubFilter);
    }

    if (msgs.length === 0) {
      if (this.state.accounts.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding:40px 20px;text-align:center;">
            <span class="empty-icon" style="font-size:3rem;display:block;margin-bottom:12px;">📬</span>
            <p><strong style="font-size:1.15rem;color:var(--text-main);">Ще немає підключених поштових скриньок</strong></p>
            <p style="font-size:0.92rem;color:var(--text-muted);margin:8px auto 16px auto;max-width:440px;line-height:1.5;">
              Додайте ваші скриньки (Gmail, Ukr.net та ін.), щоб AI перевірив їх та відділив важливі листи від спаму.
            </p>
            <button class="btn-primary" style="padding:12px 24px;font-size:1.0rem;font-weight:800;border-radius:12px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;box-shadow:0 4px 14px rgba(14,165,233,0.35);cursor:pointer;" onclick="MailboxModule.openAddAccountModal()">
              ➕ Додати Email / Пошту
            </button>
          </div>
        `;
        return;
      }

      const isSpam = this.state.currentFilter === "spam";
      container.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;text-align:center;">
          <span class="empty-icon" style="font-size:3rem;display:block;margin-bottom:12px;">${isSpam ? '🎉' : '⭐'}</span>
          <p style="font-size:1.1rem;font-weight:800;color:var(--text-main);">${isSpam ? 'У пошті немає спаму та сміття! Все чисто.' : 'Важливих листів наразі не виявлено.'}</p>
          <p style="font-size:0.85rem;color:var(--text-muted);margin-top:6px;">Натисніть сканування, щоб перевірити наступні листи з архіву.</p>
          <button class="action-btn-sm" style="margin-top:14px;padding:8px 18px;font-size:0.88rem;font-weight:700;" onclick="MailboxModule.checkMailboxes()">
            ⚡ Сканувати наступну порцію
          </button>
        </div>
      `;
      this.updateBatchToolbar();
      return;
    }

    const isSpamFilter = this.state.currentFilter === "spam";

    container.innerHTML = msgs.map(m => {
      const d = m.date ? new Date(m.date) : new Date();
      const dateStr = d.toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const sub = this.classifySpamSubcategory(m);

      let badgeHtml = "";
      if (m.is_spam) {
        if (sub === "casino") {
          badgeHtml = `<span style="background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid rgba(239,68,68,0.35);font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;">🎰 Казино та ставки</span>`;
        } else if (sub === "promo") {
          badgeHtml = `<span style="background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;">🛍️ Акції та знижки</span>`;
        } else if (sub === "bots") {
          badgeHtml = `<span style="background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.35);font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;">🤖 Бот / No-reply</span>`;
        } else {
          badgeHtml = `<span style="background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid rgba(239,68,68,0.35);font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;">🗑️ ${escapeHtml(m.spam_reason || 'Спам')}</span>`;
        }
      } else {
        badgeHtml = m.category === "important"
          ? `<span style="background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid rgba(34,197,94,0.35);font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;">⭐ Важливе</span>`
          : `<span style="background:rgba(14,165,233,0.18);color:#0ea5e9;border:1px solid rgba(14,165,233,0.35);font-size:0.72rem;font-weight:800;padding:2px 8px;border-radius:6px;text-transform:uppercase;">📩 Звичайний</span>`;
      }

      const isChecked = this.state.selectedMessageIds.has(m.id) ? "checked" : "";

      return `
        <div class="stat-card" style="margin-bottom:8px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start;position:relative;transition:background 0.15s;border-radius:12px;" onclick="MailboxModule.openMessagePreview(${m.id})">
          ${isSpamFilter ? `
            <div onclick="event.stopPropagation();" style="padding-top:2px;">
              <input type="checkbox" class="mail-msg-cb" data-id="${m.id}" ${isChecked} style="cursor:pointer;width:16px;height:16px;" onchange="MailboxModule.toggleMessageSelect(${m.id}, this.checked)" />
            </div>
          ` : ''}

          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                ${badgeHtml}
                <strong style="font-size:0.92rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${escapeHtml(m.sender || m.sender_email || 'Невідомий')}
                </strong>
                ${m.account_name ? `<span style="font-size:0.72rem;color:var(--text-muted);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:6px;">${escapeHtml(m.account_name)}</span>` : ''}
              </div>
              <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;font-family:monospace;">${dateStr}</span>
            </div>

            <div style="font-weight:700;font-size:0.92rem;color:var(--text-main);margin-bottom:4px;line-height:1.35;">
              ${escapeHtml(m.subject)}
            </div>

            ${m.snippet ? `<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.4;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(m.snippet)}</div>` : ''}

            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--border-color);" onclick="event.stopPropagation();">
              <div style="font-size:0.74rem;color:#fca5a5;font-weight:600;">
                ${m.is_spam ? `⚠️ ${escapeHtml(m.spam_reason || 'Автоматична класифікація спаму')}` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                ${m.is_spam ? `
                  <button type="button" class="action-btn-sm" style="font-size:0.74rem;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);padding:3px 9px;border-radius:6px;" onclick="MailboxModule.whitelistMessage(${m.id})" title="Внести відправника у білий список">
                    ⭐ Це не спам
                  </button>
                ` : ''}
                <button type="button" class="action-btn-sm" style="font-size:0.74rem;padding:3px 8px;" onclick="MailboxModule.openMessagePreview(${m.id})" title="Читати повний лист">
                  👁️ Читати
                </button>
                <button type="button" class="action-btn-sm" style="font-size:0.74rem;color:var(--danger,#ff453a);padding:3px 8px;" onclick="MailboxModule.deleteSingleMessage(${m.id})" title="Видалити лист із сервера">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    this.updateBatchToolbar();
  },

  renderAccountsList() {
    const container = document.getElementById("mail-content-area");
    if (!container) return;

    const subcatsBar = document.getElementById("mail-spam-subcats-bar");
    if (subcatsBar) subcatsBar.style.display = "none";
    const batchToolbar = document.getElementById("mail-batch-toolbar");
    if (batchToolbar) batchToolbar.style.display = "none";

    if (this.state.accounts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;text-align:center;">
          <span class="empty-icon" style="font-size:3rem;display:block;margin-bottom:12px;">⚙️</span>
          <p style="font-size:1.15rem;font-weight:700;">Немає налаштованих поштових скриньок.</p>
          <button class="btn-primary" style="margin-top:14px;padding:12px 24px;font-size:1.0rem;font-weight:800;border-radius:12px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;box-shadow:0 4px 14px rgba(14,165,233,0.35);cursor:pointer;" onclick="MailboxModule.openAddAccountModal()">
            ➕ Додати Email / Пошту
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:0.95rem;color:var(--text-main);font-weight:800;">Підключені скриньки (${this.state.accounts.length} з 20):</span>
        <button class="action-btn-sm" style="font-weight:800;font-size:0.86rem;padding:7px 14px;background:rgba(14,165,233,0.18);color:#38bdf8;border:1.5px solid rgba(56,189,248,0.4);border-radius:10px;" onclick="MailboxModule.openAddAccountModal()">
          ➕ Додати ще одну пошту
        </button>
      </div>
      ${this.state.accounts.map(acc => {
        const lastCheck = acc.last_checked_at 
          ? new Date(acc.last_checked_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) 
          : "Ще не перевірялось";

        return `
          <div class="stat-card" style="margin-bottom:10px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-radius:14px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:1.4rem;">📫</span>
                <div>
                  <strong style="font-size:0.98rem;color:var(--text-main);">${escapeHtml(acc.name || acc.email)}</strong>
                  <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(acc.email)} • ${acc.imap_server}:${acc.imap_port}</div>
                </div>
              </div>
              <div style="margin-top:6px;display:flex;gap:6px;font-size:0.75rem;color:var(--text-muted);">
                <span>Всього листів: <strong>${acc.messages_count || 0}</strong></span>
                <span>•</span>
                <span style="color:#ef4444;">Спам: <strong>${acc.spam_count || 0}</strong></span>
                <span>•</span>
                <span style="color:#22c55e;">Важливі: <strong>${acc.important_count || 0}</strong></span>
                <span>•</span>
                <span>Оновлено: ${lastCheck}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="action-btn-sm" style="font-weight:700;" onclick="MailboxModule.checkMailboxes(${acc.id})" title="Перевірити цю скриньку">⚡ Перевірити</button>
              <button class="action-btn-sm" style="color:var(--danger,#ff453a);" onclick="MailboxModule.deleteAccount(${acc.id})" title="Видалити скриньку">🗑️</button>
            </div>
          </div>
        `;
      }).join("")}
    `;
  },

  getCheckLimit() {
    const sel = document.getElementById("mail-check-limit-select");
    return sel ? (parseInt(sel.value, 10) || 300) : 300;
  },

  async checkMailboxes(accId = null) {
    if (this.state.isChecking) return;
    const checkBtn = document.getElementById("mail-check-all-btn");
    const limit = this.getCheckLimit();

    try {
      this.state.isChecking = true;
      if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = `⏳ Сканую (${limit})...`;
      }
      showToast(`🔍 З'єднуюсь із серверами пошти та аналізую ${limit} листів...`, 4000);

      const url = accId 
        ? `/api/v1/mailbox/check?account_id=${accId}&limit=${limit}` 
        : `/api/v1/mailbox/check?limit=${limit}`;
      const res = await apiFetch(url, { method: "POST" });

      if (res && res.summary) {
        showToast(`✅ ${res.summary}`, 5500);
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
        checkBtn.textContent = "⚡ Сканувати наступну порцію";
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

    const count = this.state.messages.filter(m => m.is_spam).length;
    if (count === 0) {
      showToast("🎉 У пошті немає спаму для видалення!");
      return;
    }

    if (!confirm(`Видалити всі ${count} спам-розсилок у ${targetName}?\nЛисти буде остаточно видалено на поштовому сервері!`)) {
      return;
    }

    const cleanBtn = document.getElementById("mail-clean-spam-btn");

    try {
      this.state.isCleaning = true;
      if (cleanBtn) {
        cleanBtn.disabled = true;
        cleanBtn.textContent = "🧹 Очищаю сервери...";
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
        cleanBtn.innerHTML = `🧹 Видалити всі <span id="mail-clean-btn-count">${this.state.messages.filter(m => m.is_spam).length}</span> спам-листів із сервера`;
      }
    }
  },

  async deleteSelected() {
    if (this.state.isCleaning) return;
    const selectedIds = Array.from(this.state.selectedMessageIds);
    if (selectedIds.length === 0) return;

    if (!confirm(`Видалити ${selectedIds.length} вибраних спам-листів із сервера?`)) return;

    try {
      this.state.isCleaning = true;
      showToast(`🧹 Видаляю ${selectedIds.length} вибраних листів...`, 3000);

      const res = await apiFetch("/api/v1/mailbox/clean-spam", {
        method: "POST",
        body: JSON.stringify({ message_ids: selectedIds })
      });

      showToast(res.message || "🧹 Вибрані листи видалено!", 4000);
      await this.loadData();
    } catch (err) {
      showToast(`❌ Помилка: ${err.message}`);
    } finally {
      this.state.isCleaning = false;
    }
  },

  async whitelistMessage(msgId) {
    try {
      const res = await apiFetch(`/api/v1/mailbox/messages/${msgId}/whitelist`, { method: "POST" });
      showToast(res.message || "⭐ Відправника збережено як важливого!", 4000);
      
      const msg = this.state.messages.find(m => m.id === msgId);
      if (msg) {
        msg.is_spam = false;
        msg.category = "important";
        msg.spam_reason = null;
      }
      this.state.selectedMessageIds.delete(msgId);
      this.renderMessagesList();
      this.updateCounts();
    } catch (err) {
      showToast(`Помилка: ${err.message}`);
    }
  },

  toggleSelectAll(checked) {
    if (checked) {
      this.state.messages.forEach(m => this.state.selectedMessageIds.add(m.id));
    } else {
      this.state.selectedMessageIds.clear();
    }
    document.querySelectorAll(".mail-msg-cb").forEach(cb => cb.checked = checked);
    this.updateBatchToolbar();
  },

  toggleMessageSelect(id, checked) {
    if (checked) {
      this.state.selectedMessageIds.add(id);
    } else {
      this.state.selectedMessageIds.delete(id);
    }
    this.updateBatchToolbar();
  },

  async deleteSingleMessage(msgId) {
    if (!confirm("Видалити цей лист із поштової скриньки назавжди?")) return;
    try {
      await apiFetch(`/api/v1/mailbox/messages/${msgId}`, { method: "DELETE" });
      showToast("🗑️ Лист видалено");
      this.state.messages = this.state.messages.filter(m => m.id !== msgId);
      this.state.selectedMessageIds.delete(msgId);
      this.renderMessagesList();
      this.loadSummary();
      this.updateCounts();
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

        if (bodyEl) bodyEl.textContent = data.body || "(Текст листа порожній або містить лише графіку)";

        if (webmailBtn) {
          if (data.webmail_url) {
            webmailBtn.href = data.webmail_url;
            webmailBtn.style.display = "inline-flex";
          } else {
            webmailBtn.style.display = "none";
          }
        }
      }
    } catch (err) {
      if (bodyEl) bodyEl.textContent = `Не вдалося завантажити повний текст: ${err.message}`;
    }
  },

  closeMessagePreview() {
    const modal = document.getElementById("mail-preview-modal");
    if (modal) modal.classList.add("hidden");
  },

  speakDigest() {
    const text = this.state.summary?.digest || document.getElementById("mail-digest-text")?.textContent;
    if (!text) {
      showToast("Немає звіту для озвучення");
      return;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "uk-UA";
      utt.rate = 1.0;
      window.speechSynthesis.speak(utt);
      showToast("🔊 AI озвучує поштовий звіт...");
    } else {
      showToast("Синтез мови не підтримується цим браузером");
    }
  },

  async deleteAccount(accId) {
    const acc = this.state.accounts.find(a => a.id === accId);
    const name = acc ? (acc.name || acc.email) : "цю скриньку";
    if (!confirm(`Відключити скриньку «${name}» від Секретаря? Самі листи на сервері залишаться.`)) {
      return;
    }

    try {
      await apiFetch(`/api/v1/mailbox/accounts/${accId}`, { method: "DELETE" });
      showToast(`Скриньку «${name}» відключено.`);
      await this.loadData();
    } catch (err) {
      showToast(`Помилка: ${err.message}`);
    }
  },

  openAddAccountModal() {
    const modal = document.getElementById("mail-add-account-modal");
    if (modal) {
      modal.classList.remove("hidden");
      document.getElementById("mail-acc-email")?.focus();
    }
  },

  closeAddAccountModal() {
    const modal = document.getElementById("mail-add-account-modal");
    if (modal) modal.classList.add("hidden");
    const fbEl = document.getElementById("mail-acc-feedback");
    if (fbEl) fbEl.textContent = "";
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
      if (fbEl) fbEl.textContent = "Вкажіть email та пароль додатку!";
      return;
    }

    let cleanPwd = pwdVal;
    if (emailVal.toLowerCase().includes("gmail.com") && cleanPwd.replace(/\s+/g, "").length === 16) {
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

      if (emailEl) emailEl.value = "";
      if (nameEl) nameEl.value = "";
      if (pwdEl) pwdEl.value = "";
      if (serverEl) serverEl.value = "";

      await this.loadData();
      this.checkMailboxes(res.id);
    } catch (err) {
      if (fbEl) fbEl.textContent = `❌ ${err.message}`;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 Підключити пошту";
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

    // Batch Toolbar Select All & Delete Selected
    document.getElementById("mail-select-all-cb")?.addEventListener("change", (e) => this.toggleSelectAll(e.target.checked));
    document.getElementById("mail-delete-selected-btn")?.addEventListener("click", () => this.deleteSelected());

    // Account Filter Select
    document.getElementById("mail-account-filter-select")?.addEventListener("change", (e) => this.selectAccount(e.target.value));

    // Subcategory Filter Pills
    document.querySelectorAll(".mail-subcat-pill").forEach(p => {
      p.addEventListener("click", () => {
        const sub = p.dataset.subcat;
        if (sub) this.setSubFilter(sub);
      });
    });

    // Category pills filter
    document.querySelectorAll(".mail-cat-pill").forEach(p => {
      p.addEventListener("click", () => {
        const cat = p.dataset.cat;
        if (cat) this.setFilter(cat);
      });
    });

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

    // Password visibility toggle
    document.getElementById("mail-acc-pwd-toggle")?.addEventListener("click", () => {
      const pwdInput = document.getElementById("mail-acc-password");
      const toggleBtn = document.getElementById("mail-acc-pwd-toggle");
      if (pwdInput) {
        if (pwdInput.type === "password") {
          pwdInput.type = "text";
          toggleBtn.textContent = "🙈";
        } else {
          pwdInput.type = "password";
          toggleBtn.textContent = "👁️";
        }
      }
    });

    // Auto-detect server helper when email is typed
    const emailInput = document.getElementById("mail-acc-email");
    const serverInput = document.getElementById("mail-acc-server");
    const helpHint = document.getElementById("mail-hint-text");

    const updateProviderHint = () => {
      const val = emailInput ? emailInput.value.toLowerCase().trim() : "";
      const actionBtnContainer = document.getElementById("mail-hint-action-btn");
      const stepsContainer = document.getElementById("mail-hint-steps");

      if (val.includes("@gmail.com") || val.includes("@googlemail.com")) {
        if (serverInput && !serverInput.value) serverInput.value = "imap.gmail.com";
        if (helpHint) {
          helpHint.innerHTML = "Для захисту Google вимагає окремий <strong>16-значний пароль додатку</strong>. Основний пароль Google не підходить.";
        }
        if (actionBtnContainer) {
          actionBtnContainer.innerHTML = `
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg, #0284c7, #2563eb);color:#ffffff;font-weight:800;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:0.88rem;box-shadow:0 4px 12px rgba(2,132,199,0.35);">
              <span>🔗 Отримати пароль у Google (16 літер) ↗</span>
            </a>
          `;
        }
        if (stepsContainer) {
          stepsContainer.innerHTML = `
            <ol style="margin:0;padding-left:18px;line-height:1.55;">
              <li style="margin-bottom:3px;">Натисніть синю кнопку вище (або відкрийте <em>myaccount.google.com/apppasswords</em>).</li>
              <li style="margin-bottom:3px;">У полі назви введіть <strong>«Секретар»</strong> та натисніть «Створити».</li>
              <li style="margin-bottom:3px;">Google видасть жовте віконце з <strong>16 буквами</strong> (наприклад: <code>abcd efgh ijkl mnop</code>).</li>
              <li>Скопіюйте ці 16 букв і вставте в поле пароля вище (пробіли прибирати не потрібно).</li>
            </ol>
          `;
        }
      } else if (val.includes("@ukr.net")) {
        if (serverInput && !serverInput.value) serverInput.value = "imap.ukr.net";
        if (helpHint) {
          helpHint.innerHTML = "Для <strong>Ukr.net</strong> потрібно дозволити IMAP та згенерувати окремий пароль для поштових програм.";
        }
        if (actionBtnContainer) {
          actionBtnContainer.innerHTML = `
            <a href="https://mail.ukr.net" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg, #f59e0b, #d97706);color:#ffffff;font-weight:800;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:0.88rem;box-shadow:0 4px 12px rgba(217,119,6,0.35);">
              <span>🌐 Відкрити налаштування Ukr.net ↗</span>
            </a>
          `;
        }
        if (stepsContainer) {
          stepsContainer.innerHTML = `
            <ol style="margin:0;padding-left:18px;line-height:1.55;">
              <li style="margin-bottom:3px;">Увійдіть у свою пошту на <strong>mail.ukr.net</strong>.</li>
              <li style="margin-bottom:3px;">Натисніть на значок шестерні <strong>«Налаштування» ⚙️</strong> (внизу або праворуч).</li>
              <li style="margin-bottom:3px;">Виберіть розділ <strong>«Поштові програми»</strong> та увімкніть перемикач <em>«Дозволити IMAP/SMTP»</em>.</li>
              <li style="margin-bottom:3px;">Нижче натисніть <strong>«Створити пароль для програм»</strong> (введіть назву «Секретар»).</li>
              <li>Скопіюйте створений пароль та вставте в поле пароля вище.</li>
            </ol>
          `;
        }
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
