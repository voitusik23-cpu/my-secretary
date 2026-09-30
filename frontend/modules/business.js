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
    const cur = (window.state && window.state.preferredCurrency) || localStorage.getItem("preferred_currency") || "₴";
    if (isNaN(num)) return `0 ${cur}`;
    return `${Number(num).toLocaleString("uk-UA")} ${cur}`;
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

  openReportModal() {
    const text = this.state.summary.text_report;
    const modal = document.getElementById("biz-report-modal");
    const textarea = document.getElementById("biz-report-textarea");
    const tgBtn = document.getElementById("biz-share-tg-btn");
    const waBtn = document.getElementById("biz-share-wa-btn");
    const emailBtn = document.getElementById("biz-share-email-btn");

    if (!text) {
      if (typeof showToast === "function") showToast("⚠️ Звіт порожній");
      return;
    }

    if (textarea) textarea.value = text;

    const enc = encodeURIComponent(text);
    if (tgBtn) tgBtn.href = `https://t.me/share/url?url=&text=${enc}`;
    if (waBtn) waBtn.href = `https://api.whatsapp.com/send?text=${enc}`;
    if (emailBtn) emailBtn.href = `mailto:?subject=${encodeURIComponent("Фінансовий звіт (Бізнес-каса)")}&body=${enc}`;

    if (modal) modal.classList.remove("hidden");
  },

  closeReportModal() {
    const modal = document.getElementById("biz-report-modal");
    if (modal) modal.classList.add("hidden");
  },

  async shareNative() {
    const text = this.state.summary.text_report || document.getElementById("biz-report-textarea")?.value;
    if (!text) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "💼 Фінансовий звіт бізнес-каси",
          text: text
        });
        if (typeof showToast === "function") showToast("✅ Звіт успішно надіслано!");
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Native share error:", err);
          this.copyReportText();
        }
      }
    } else {
      this.copyReportText();
    }
  },

  copyReportText() {
    const text = this.state.summary.text_report || document.getElementById("biz-report-textarea")?.value;
    if (!text) return;

    navigator.clipboard.writeText(text)
      .then(() => {
        if (typeof showToast === "function") {
          showToast("✅ Звіт скопійовано! Вставте його у Telegram, WhatsApp чи Email.");
        }
      })
      .catch(() => {
        window.prompt("Скопіюйте звіт вручну:", text);
      });
  },

  copyReport() {
    this.openReportModal();
  },

  // Voice dictation state
  recognition: null,
  isVoiceActive: false,
  currentVoiceType: null, // "expense" | "income" | null
  mediaRecorder: null,
  audioChunks: [],

  updateVoiceUI(isListening, statusText, voiceType = null) {
    const expenseBtn = document.getElementById("biz-voice-expense-btn");
    const incomeBtn = document.getElementById("biz-voice-income-btn");
    const legacyBtn = document.getElementById("biz-voice-dictate-btn");
    const statusBox = document.getElementById("biz-voice-status");
    const statusLabel = document.getElementById("biz-voice-status-text");

    const activeType = voiceType || this.currentVoiceType;

    if (expenseBtn) {
      if (isListening && activeType === "expense") expenseBtn.classList.add("listening");
      else expenseBtn.classList.remove("listening");
    }

    if (incomeBtn) {
      if (isListening && activeType === "income") incomeBtn.classList.add("listening");
      else incomeBtn.classList.remove("listening");
    }

    if (legacyBtn) {
      if (isListening) legacyBtn.classList.add("listening");
      else legacyBtn.classList.remove("listening");
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

  async submitVoiceText(text, forceType = null) {
    if (!text || !text.trim()) return;
    const typeToUse = forceType || this.currentVoiceType;
    try {
      const res = await apiFetch("/api/v1/business/quick-parse", {
        method: "POST",
        body: JSON.stringify({ 
          text: text.trim(),
          force_type: typeToUse
        })
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

  toggleVoiceDictation(forceType = null) {
    if (this.isVoiceActive) {
      if (this.currentVoiceType === forceType) {
        this.stopVoice();
        return;
      }
      this.stopVoice();
    }
    this.startVoice(forceType);
  },

  startVoice(forceType = null) {
    this.currentVoiceType = forceType;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    const hintText = forceType === "expense"
      ? "🔴 Слухаю витрату... Наприклад: «шайбочки на базарі 250»"
      : (forceType === "income"
          ? "🟢 Слухаю прихід... Наприклад: «оренда офіс 100 тисяч»"
          : "🎙️ Слухаю... Наприклад: «шайбочки 250» або «оренда 100 тисяч»");

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
          this.updateVoiceUI(true, hintText, forceType);
        };

        rec.onresult = async (event) => {
          this.isVoiceActive = false;
          if (event.results && event.results[0] && event.results[0][0]) {
            const transcript = event.results[0][0].transcript;
            this.updateVoiceUI(false, `⚡ Почуто: «${transcript}». Записую в касу...`);
            await this.submitVoiceText(transcript, forceType);
          }
        };

        rec.onerror = (e) => {
          this.isVoiceActive = false;
          console.warn("Speech recognition error:", e);
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            this.updateVoiceUI(false, "⚠️ Мікрофон заблоковано в налаштуваннях браузера");
          } else if (e.error === "no-speech") {
            this.updateVoiceUI(false, "Голос не почуто. Натисніть кнопку та спробуйте ще раз");
          } else {
            this.updateVoiceUI(false, `Помилка: ${e.error}`);
          }
        };

        rec.onend = () => {
          this.isVoiceActive = false;
          this.updateVoiceUI(false, null);
        };

        this.recognition = rec;
        rec.start();
        return;
      } catch (recErr) {
        console.warn("Web Speech API start failed, falling back to MediaRecorder:", recErr);
      }
    }

    // Fallback: Audio recording via MediaRecorder
    this.startAudioRecordingFallback(forceType);
  },

  stopVoice() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }
    this.isVoiceActive = false;
    this.currentVoiceType = null;
    this.updateVoiceUI(false, null);
  },

  async startAudioRecordingFallback(forceType = null) {
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
          const hint = forceType === "expense" ? "бізнес витрата" : (forceType === "income" ? "бізнес дохід" : "бізнес операція");
          formData.append("text", hint);

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
      const recMsg = forceType === "expense"
        ? "🔴 Запис витрати... Натисніть кнопку ще раз для збереження"
        : "🟢 Запис доходу... Натисніть кнопку ще раз для збереження";
      this.updateVoiceUI(true, recMsg, forceType);
    } catch (micErr) {
      console.error("Microphone error:", micErr);
      this.isVoiceActive = false;
      this.updateVoiceUI(false, "⚠️ Помилка доступу до мікрофона");
    }
  },

  init() {
    // Dual voice dictation buttons
    document.getElementById("biz-voice-expense-btn")?.addEventListener("click", () => this.toggleVoiceDictation("expense"));
    document.getElementById("biz-voice-income-btn")?.addEventListener("click", () => this.toggleVoiceDictation("income"));
    document.getElementById("biz-voice-dictate-btn")?.addEventListener("click", () => this.toggleVoiceDictation(null));

    // Quick buttons
    document.getElementById("biz-add-income-btn")?.addEventListener("click", () => this.addTransaction("income"));
    document.getElementById("biz-add-expense-btn")?.addEventListener("click", () => this.addTransaction("expense"));
    document.getElementById("biz-open-report-btn")?.addEventListener("click", () => this.openReportModal());
    document.getElementById("biz-copy-report-btn")?.addEventListener("click", () => this.openReportModal());
    document.getElementById("biz-refresh-btn")?.addEventListener("click", () => this.loadTab());

    // Report modal controls
    document.getElementById("biz-report-modal-close")?.addEventListener("click", () => this.closeReportModal());
    document.getElementById("biz-share-native-btn")?.addEventListener("click", () => this.shareNative());
    document.getElementById("biz-share-copy-btn")?.addEventListener("click", () => this.copyReportText());
    document.getElementById("biz-report-modal")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "biz-report-modal") this.closeReportModal();
    });

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
