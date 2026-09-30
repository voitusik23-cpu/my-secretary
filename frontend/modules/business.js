// ===================================================
// Мой Секретарь — Окремий модуль «Бизнес и касса»
// frontend/modules/business.js
// ===================================================

const BusinessModule = {
  state: {
    transactions: [],
    summary: {
      total_income: 0,
      total_expense: 0,
      balance: 0,
      transactions_count: 0,
      text_report: ""
    }
  },

  formatMoney(num) {
    if (isNaN(num)) return "0 ₴";
    return `${Number(num).toLocaleString("uk-UA")} ₴`;
  },

  async loadTab() {
    const listEl = document.getElementById("biz-transactions-list");
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">⏳</span><p>Завантажую касу...</p></div>`;
    }

    try {
      const [summaryRes, txsRes] = await Promise.all([
        apiFetch("/api/v1/business/summary"),
        apiFetch("/api/v1/business/transactions")
      ]);

      if (summaryRes) {
        this.state.summary = summaryRes;
        this.renderSummary();
      }

      if (Array.isArray(txsRes)) {
        this.state.transactions = txsRes;
        this.renderTransactions();
      }
    } catch (err) {
      console.error("Failed to load business data:", err);
      if (listEl) {
        listEl.innerHTML = `<div class="empty-state"><p>Помилка завантаження даних: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  },

  renderSummary() {
    const balanceEl = document.getElementById("biz-balance-val");
    const balanceCard = document.getElementById("biz-balance-card");
    const incomeEl = document.getElementById("biz-income-val");
    const expenseEl = document.getElementById("biz-expense-val");
    const countEl = document.getElementById("biz-count-val");

    const bal = this.state.summary.balance;
    const sign = bal > 0 ? "+" : (bal < 0 ? "-" : "");
    const formattedBal = `${sign}${this.formatMoney(Math.abs(bal))}`;

    if (balanceEl) {
      balanceEl.textContent = formattedBal;
    }

    if (balanceCard) {
      balanceCard.classList.remove("positive", "negative", "neutral");
      if (bal > 0) balanceCard.classList.add("positive");
      else if (bal < 0) balanceCard.classList.add("negative");
      else balanceCard.classList.add("neutral");
    }

    if (incomeEl) incomeEl.textContent = `+${this.formatMoney(this.state.summary.total_income)}`;
    if (expenseEl) expenseEl.textContent = `-${this.formatMoney(this.state.summary.total_expense)}`;
    if (countEl) countEl.textContent = `${this.state.summary.transactions_count} операцій`;
  },

  renderTransactions() {
    const listEl = document.getElementById("biz-transactions-list");
    if (!listEl) return;

    if (!this.state.transactions || this.state.transactions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">💼</span>
          <p>Записів у касі поки немає.<br><small>Додайте першу операцію: наприклад «Оренда офіс 100000»</small></p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.state.transactions.map(t => {
      const isInc = t.type === "income";
      const sign = isInc ? "+" : "-";
      const colorClass = isInc ? "biz-tx-income" : "biz-tx-expense";
      const icon = isInc ? "🟢" : "🔴";
      
      const d = t.created_at ? new Date(t.created_at) : new Date();
      const dateStr = d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

      return `
        <div class="biz-tx-card ${colorClass}" data-id="${t.id}">
          <div class="biz-tx-left">
            <span class="biz-tx-badge">${icon}</span>
            <div class="biz-tx-details">
              <div class="biz-tx-desc">${escapeHtml(t.description)}</div>
              <div class="biz-tx-meta">📅 ${dateStr}</div>
            </div>
          </div>
          <div class="biz-tx-right">
            <div class="biz-tx-amount ${colorClass}">${sign}${this.formatMoney(t.amount)}</div>
            <button class="biz-tx-del-btn" onclick="BusinessModule.deleteTx(${t.id})" title="Видалити">🗑️</button>
          </div>
        </div>
      `;
    }).join("");
  },

  async addTransaction(type) {
    const descInput = document.getElementById("biz-desc-input");
    const amountInput = document.getElementById("biz-amount-input");

    const desc = descInput?.value?.trim();
    const amountVal = parseFloat(amountInput?.value?.replace(/\s+/g, "").replace(",", "."));

    if (!desc) {
      if (typeof showToast === "function") showToast("⚠️ Вкажіть опис операції (наприклад: Оренда офіс)");
      descInput?.focus();
      return;
    }

    if (isNaN(amountVal) || amountVal <= 0) {
      if (typeof showToast === "function") showToast("⚠️ Вкажіть коректну суму більше 0");
      amountInput?.focus();
      return;
    }

    try {
      await apiFetch("/api/v1/business/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: type,
          amount: amountVal,
          description: desc
        })
      });

      if (descInput) descInput.value = "";
      if (amountInput) amountInput.value = "";

      const typeWord = type === "income" ? "Дохід" : "Витрату";
      if (typeof showToast === "function") {
        showToast(`✅ ${typeWord} «${desc}» (+${this.formatMoney(amountVal)}) записано!`);
      }

      this.loadTab();
    } catch (err) {
      if (typeof showToast === "function") showToast(`❌ Помилка: ${err.message}`);
    }
  },

  async quickParseText() {
    const input = document.getElementById("biz-quick-text-input");
    const text = input?.value?.trim();
    if (!text) return;

    try {
      const res = await apiFetch("/api/v1/business/quick-parse", {
        method: "POST",
        body: JSON.stringify({ text })
      });

      if (input) input.value = "";
      if (typeof showToast === "function") {
        const sign = res.type === "income" ? "+" : "-";
        showToast(`✅ Записано: ${res.description} (${sign}${this.formatMoney(res.amount)})`);
      }

      this.loadTab();
    } catch (err) {
      if (typeof showToast === "function") showToast(`❌ Не вдалося розпізнати: ${err.message}`);
    }
  },

  async deleteTx(id) {
    if (!confirm("Видалити цей запис з каси?")) return;

    try {
      await apiFetch(`/api/v1/business/transactions/${id}`, { method: "DELETE" });
      if (typeof showToast === "function") showToast("🗑️ Запис видалено");
      this.loadTab();
    } catch (err) {
      if (typeof showToast === "function") showToast(`❌ Помилка: ${err.message}`);
    }
  },

  copyReport() {
    const text = this.state.summary.text_report;
    if (!text) {
      if (typeof showToast === "function") showToast("⚠️ Звіт порожній");
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => {
        if (typeof showToast === "function") {
          showToast("📋 Звіт скопійовано! Вставте його у повідомлення партнеру чи бухгалтеру.");
        }
      })
      .catch(() => {
        // Fallback prompt
        window.prompt("Скопіюйте звіт вручну:", text);
      });
  },

  init() {
    // Quick buttons
    document.getElementById("biz-add-income-btn")?.addEventListener("click", () => this.addTransaction("income"));
    document.getElementById("biz-add-expense-btn")?.addEventListener("click", () => this.addTransaction("expense"));
    document.getElementById("biz-copy-report-btn")?.addEventListener("click", () => this.copyReport());
    document.getElementById("biz-refresh-btn")?.addEventListener("click", () => this.loadTab());

    const quickBtn = document.getElementById("biz-quick-submit-btn");
    const quickInput = document.getElementById("biz-quick-text-input");
    quickBtn?.addEventListener("click", () => this.quickParseText());
    quickInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.quickParseText();
      }
    });

    const amountInput = document.getElementById("biz-amount-input");
    amountInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.addTransaction("income");
      }
    });
  }
};

window.BusinessModule = BusinessModule;
window.loadBusinessTab = function() {
  BusinessModule.loadTab();
};
