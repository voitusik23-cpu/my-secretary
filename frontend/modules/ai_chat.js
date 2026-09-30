// ===================================================
// Мой Секретарь — Окремий модуль «AI-Чат і Співрозмовник»
// frontend/modules/ai_chat.js
// ===================================================

const AIChatModule = {
  state: {
    messages: [],
    isLoading: false,
    isSpeaking: false,
    recognition: null,
    isListening: false
  },

  formatMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Italic *text*
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Line breaks and list bullet points
    const lines = html.split("\n");
    let inList = false;
    let result = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (!inList) {
          result.push("<ul class='ai-chat-list'>");
          inList = true;
        }
        result.push(`<li>${trimmed.substring(2)}</li>`);
      } else {
        if (inList) {
          result.push("</ul>");
          inList = false;
        }
        result.push(line ? `<p style="margin: 4px 0;">${line}</p>` : "<div style='height:6px;'></div>");
      }
    }
    if (inList) result.push("</ul>");

    return result.join("");
  },

  async loadChat() {
    const listEl = document.getElementById("ai-chat-messages-container");
    if (!listEl) return;

    try {
      const res = await apiFetch("/api/v1/ai-chat/history");
      if (res && Array.isArray(res.messages)) {
        this.state.messages = res.messages;
      } else {
        this.state.messages = [];
      }
      this.renderMessages();
    } catch (err) {
      console.warn("Failed to load chat history:", err);
      this.renderMessages();
    }
  },

  renderMessages() {
    const container = document.getElementById("ai-chat-messages-container");
    if (!container) return;

    if (!this.state.messages || this.state.messages.length === 0) {
      container.innerHTML = `
        <div class="ai-chat-welcome">
          <div style="font-size: 2.6rem; margin-bottom: 8px;">🤖</div>
          <h3 style="margin:0 0 6px 0; font-size:1.15rem; font-weight:800;">Привіт! Я твій AI-співрозмовник</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.45; margin:0 0 16px 0; max-width:440px; margin-inline:auto;">
            Запитуйте будь-що: порівняти речі чи інструменти, дізнатися де вигідніше купити, отримати пораду щодо ремонту чи просто поспілкуватися.
          </p>
          <div class="ai-chat-quick-chips">
            <button type="button" class="ai-chat-chip" onclick="AIChatModule.sendPreset('Сравни перфораторы Makita и Bosch для дома, что надежнее?')">
              ⚖️ Makita чи Bosch?
            </button>
            <button type="button" class="ai-chat-chip" onclick="AIChatModule.sendPreset('Где в Украине или Одессе выгоднее покупать стройматериалы и инструмент?')">
              🛒 Де дешевше купувати?
            </button>
            <button type="button" class="ai-chat-chip" onclick="AIChatModule.sendPreset('Сравни инверторную и полуавтоматическую сварку: что проще для начинающего?')">
              ⚡ Зварювальний апарат
            </button>
            <button type="button" class="ai-chat-chip" onclick="AIChatModule.sendPreset('Посоветуй, как лучше утеплить стены: пенопласт или минеральная вата?')">
              🧱 Чим краще утеплити?
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.messages.map(m => {
      const isUser = m.role === "user";
      const senderClass = isUser ? "user" : "assistant";
      const avatar = isUser ? "👤" : "🤖";
      const d = m.created_at ? new Date(m.created_at) : new Date();
      const timeStr = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

      const contentHtml = isUser 
        ? escapeHtml(m.content).replace(/\n/g, "<br>") 
        : this.formatMarkdown(m.content);

      const actionButtons = !isUser ? `
        <div class="ai-msg-actions">
          <button type="button" class="ai-msg-btn" onclick="AIChatModule.copyText(${m.id})" title="Скопіювати текст">📋</button>
          <button type="button" class="ai-msg-btn" onclick="AIChatModule.speakText(${m.id})" title="Озвучити голосом">🔊</button>
        </div>
      ` : "";

      return `
        <div class="ai-chat-bubble-wrap ${senderClass}" data-msg-id="${m.id}">
          <div class="ai-chat-avatar">${avatar}</div>
          <div class="ai-chat-bubble ${senderClass}">
            <div class="ai-chat-bubble-content">${contentHtml}</div>
            <div class="ai-chat-bubble-footer">
              <span class="ai-chat-time">${timeStr}</span>
              ${actionButtons}
            </div>
          </div>
        </div>
      `;
    }).join("");

    this.scrollToBottom();
  },

  scrollToBottom() {
    const container = document.getElementById("ai-chat-messages-container");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  },

  sendPreset(text) {
    const input = document.getElementById("ai-chat-input");
    if (input) input.value = text;
    this.submitMessage();
  },

  async submitMessage() {
    const input = document.getElementById("ai-chat-input");
    const text = input?.value?.trim();
    if (!text || this.state.isLoading) return;

    if (input) input.value = "";

    // 1. Add user message locally
    const tempUserMsg = {
      id: Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString()
    };
    this.state.messages.push(tempUserMsg);
    this.renderMessages();

    // 2. Add typing indicator bubble
    const container = document.getElementById("ai-chat-messages-container");
    const typingEl = document.createElement("div");
    typingEl.id = "ai-chat-typing-indicator";
    typingEl.className = "ai-chat-bubble-wrap assistant";
    typingEl.innerHTML = `
      <div class="ai-chat-avatar">🤖</div>
      <div class="ai-chat-bubble assistant typing">
        <div class="ai-typing-dots"><span></span><span></span><span></span></div>
      </div>
    `;
    container?.appendChild(typingEl);
    this.scrollToBottom();

    this.state.isLoading = true;

    try {
      const resp = await apiFetch("/api/v1/ai-chat/message", {
        method: "POST",
        body: JSON.stringify({ message: text })
      });

      // Remove typing bubble
      typingEl.remove();

      if (resp && resp.content) {
        this.state.messages.push(resp);
      } else {
        this.state.messages.push({
          id: Date.now() + 1,
          role: "assistant",
          content: "Не вдалося отримати відповідь від ШІ.",
          created_at: new Date().toISOString()
        });
      }
      this.renderMessages();
    } catch (err) {
      typingEl.remove();
      this.state.messages.push({
        id: Date.now() + 1,
        role: "assistant",
        content: `❌ Помилка: ${err.message}`,
        created_at: new Date().toISOString()
      });
      this.renderMessages();
    } finally {
      this.state.isLoading = false;
    }
  },

  async clearChat() {
    if (!confirm("Очистити історію діалогу та почати новий чат?")) return;

    try {
      await apiFetch("/api/v1/ai-chat/history", { method: "DELETE" });
      this.state.messages = [];
      this.renderMessages();
      if (typeof showToast === "function") showToast("🧹 Діалог очищено. Можна починати нову тему!");
    } catch (err) {
      if (typeof showToast === "function") showToast(`❌ Помилка: ${err.message}`);
    }
  },

  copyText(id) {
    const msg = this.state.messages.find(m => m.id === id);
    if (!msg || !msg.content) return;

    navigator.clipboard.writeText(msg.content)
      .then(() => {
        if (typeof showToast === "function") showToast("📋 Текст скопійовано!");
      })
      .catch(() => {
        window.prompt("Скопіюйте текст вручну:", msg.content);
      });
  },

  speakText(id) {
    const msg = this.state.messages.find(m => m.id === id);
    if (!msg || !msg.content) return;

    if (!window.speechSynthesis) {
      if (typeof showToast === "function") showToast("⚠️ Синтез мови не підтримується у цьому браузері");
      return;
    }

    if (this.state.isSpeaking) {
      window.speechSynthesis.cancel();
      this.state.isSpeaking = false;
      return;
    }

    // Clean markdown symbols for natural speech
    const cleanSpeech = msg.content
      .replace(/[*#_~`>]/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = "uk-UA";
    utterance.rate = 1.0;

    utterance.onend = () => { this.state.isSpeaking = false; };
    utterance.onerror = () => { this.state.isSpeaking = false; };

    this.state.isSpeaking = true;
    window.speechSynthesis.speak(utterance);
    if (typeof showToast === "function") showToast("🔊 Читаю відповідь голосом...");
  },

  toggleVoiceInput() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById("ai-chat-mic-btn");

    if (this.state.isListening) {
      if (this.state.recognition) {
        try { this.state.recognition.stop(); } catch (e) {}
      }
      this.state.isListening = false;
      micBtn?.classList.remove("listening");
      return;
    }

    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = (navigator.language && navigator.language.startsWith("ru")) ? "ru-RU" : "uk-UA";
        rec.continuous = false;
        rec.interimResults = false;

        rec.onstart = () => {
          this.state.isListening = true;
          micBtn?.classList.add("listening");
          if (typeof showToast === "function") showToast("🎙️ Слухаю... Говоріть запитання");
        };

        rec.onresult = (e) => {
          this.state.isListening = false;
          micBtn?.classList.remove("listening");
          if (e.results && e.results[0] && e.results[0][0]) {
            const transcript = e.results[0][0].transcript;
            const input = document.getElementById("ai-chat-input");
            if (input) input.value = transcript;
            this.submitMessage();
          }
        };

        rec.onerror = (e) => {
          this.state.isListening = false;
          micBtn?.classList.remove("listening");
          if (e.error !== "no-speech") {
            if (typeof showToast === "function") showToast(`⚠️ Помилка розпізнавання: ${e.error}`);
          }
        };

        rec.onend = () => {
          this.state.isListening = false;
          micBtn?.classList.remove("listening");
        };

        this.state.recognition = rec;
        rec.start();
        return;
      } catch (err) {
        console.warn("SpeechRec error, falling back:", err);
      }
    }

    if (typeof showToast === "function") showToast("⚠️ Голосовий ввід не підтримується цим браузером");
  },

  init() {
    document.getElementById("ai-chat-send-btn")?.addEventListener("click", () => this.submitMessage());
    document.getElementById("ai-chat-clear-btn")?.addEventListener("click", () => this.clearChat());
    document.getElementById("ai-chat-mic-btn")?.addEventListener("click", () => this.toggleVoiceInput());

    const input = document.getElementById("ai-chat-input");
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submitMessage();
      }
    });
  }
};

window.AIChatModule = AIChatModule;
window.loadAgentTab = function() {
  AIChatModule.loadChat();
};
