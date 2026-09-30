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

  // Voice dictation state
  recognition: null,
  isVoiceActive: false,
  mediaRecorder: null,
  audioChunks: [],

  updateVoiceUI(isListening, statusText) {
    const btn = document.getElementById("biz-voice-dictate-btn");
    const statusBox = document.getElementById("biz-voice-status");
    const statusLabel = document.getElementById("biz-voice-status-text");

    if (btn) {
      if (isListening) btn.classList.add("listening");
      else btn.classList.remove("listening");
    }

    if (statusBox && statusLabel) {
      if (statusText) {
        statusBox.style.display = "flex";
        statusLabel.textContent = statusText;
      } else {
        statusBox.style.display = "none";
      }
    }
  },

  async submitVoiceText(text) {
    if (!text || !text.trim()) return;
    try {
      const res = await apiFetch("/api/v1/business/quick-parse", {
        method: "POST",
        body: JSON.stringify({ text: text.trim() })
      });

      const sign = res.type === "income" ? "+" : "-";
      const formatted = `${res.description} (${sign}${this.formatMoney(res.amount)})`;
      
      this.updateVoiceUI(false, `✅ Успішно: ${formatted}`);
      if (typeof showToast === "function") {
        showToast(`✅ Записано в касу: ${formatted}`);
      }

      await this.loadTab();

      setTimeout(() => {
        const statusBox = document.getElementById("biz-voice-status");
        if (statusBox) statusBox.style.display = "none";
      }, 4000);
    } catch (err) {
      this.updateVoiceUI(false, `❌ Помилка запису: ${err.message}`);
      if (typeof showToast === "function") {
        showToast(`❌ Не вдалося розпізнати: ${err.message}`);
      }
    }
  },

  toggleVoiceDictation() {
    if (this.isVoiceActive) {
      this.stopVoice();
    } else {
      this.startVoice();
    }
  },

  startVoice() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        if (this.recognition) {
          try { this.recognition.abort(); } catch (e) {}
        }

        const rec = new SpeechRec();
        rec.lang = (navigator.language && navigator.language.startsWith("ru")) ? "ru-RU" : "uk-UA";
        rec.continuous = false;
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
          this.isVoiceActive = true;
          this.updateVoiceUI(true, "🎙️ Слухаю... Скажіть витрату чи дохід (напр. «шайбочки на базарі 250 гривень»)");
        };

        rec.onresult = async (event) => {
          this.isVoiceActive = false;
          if (event.results && event.results[0] && event.results[0][0]) {
            const transcript = event.results[0][0].transcript;
            this.updateVoiceUI(false, `⚡ Почуто: «${transcript}». Записую в касу...`);
            await this.submitVoiceText(transcript);
          }
        };

        rec.onerror = (e) => {
          this.isVoiceActive = false;
          console.warn("Speech recognition error:", e);
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            this.updateVoiceUI(false, "⚠️ Мікрофон заблоковано в налаштуваннях браузера");
          } else if (e.error === "no-speech") {
            this.updateVoiceUI(false, "Голос не почуто. Натисніть ще раз щоб повторити");
          } else {
            this.updateVoiceUI(false, `Помилка: ${e.error}`);
          }
        };

        rec.onend = () => {
          this.isVoiceActive = false;
          const btn = document.getElementById("biz-voice-dictate-btn");
          if (btn) btn.classList.remove("listening");
        };

        this.recognition = rec;
        rec.start();
        return;
      } catch (recErr) {
        console.warn("Web Speech API start failed, falling back to MediaRecorder:", recErr);
      }
    }

    // Fallback: Audio recording via MediaRecorder
    this.startAudioRecordingFallback();
  },

  stopVoice() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }
    this.isVoiceActive = false;
    this.updateVoiceUI(false, null);
  },

  async startAudioRecordingFallback() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (typeof showToast === "function") showToast("⚠️ Браузер не підтримує запис голосу");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      const mr = new MediaRecorder(stream);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(this.audioChunks, { type: mr.mimeType || "audio/webm" });
        this.updateVoiceUI(false, "⚡ Розпізнаю аудіо через AI...");

        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "business_voice.webm");
          formData.append("text", "бізнес операція");

          const token = localStorage.getItem("SECRET_KEY") || "";
          const resp = await fetch("/api/v1/process/audio", {
            method: "POST",
            headers: {
              ...(token ? { "x-secret-key": token } : {})
            },
            body: formData
          });

          const data = await resp.json();
          if (resp.ok) {
            this.updateVoiceUI(false, `✅ ${data.summary || "Запис додано в касу"}`);
            if (typeof showToast === "function") showToast(`✅ ${data.summary || "Запис додано в касу"}`);
            await this.loadTab();
          } else {
            throw new Error(data.detail || "Помилка сервера");
          }
        } catch (postErr) {
          this.updateVoiceUI(false, `❌ Помилка: ${postErr.message}`);
          if (typeof showToast === "function") showToast(`❌ Помилка: ${postErr.message}`);
        }
      };

      mr.start();
      this.mediaRecorder = mr;
      this.isVoiceActive = true;
      this.updateVoiceUI(true, "🎙️ Запис аудіо... Натисніть кнопку ще раз для збереження");
    } catch (micErr) {
      console.error("Microphone error:", micErr);
      this.isVoiceActive = false;
      this.updateVoiceUI(false, "⚠️ Помилка доступу до мікрофона");
    }
  },

  init() {
    // Voice dictation button
    document.getElementById("biz-voice-dictate-btn")?.addEventListener("click", () => this.toggleVoiceDictation());

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
