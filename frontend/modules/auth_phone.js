// ===================================================
// Мой Секретарь — Окремий модуль авторизації за номером телефону
// frontend/modules/auth_phone.js
// ===================================================

const AuthPhone = {
  normalizePhone(raw) {
    if (!raw) return "";
    let digits = raw.replace(/\D/g, "");
    // Ukrainian local format: 0671234567 -> 380671234567
    if (digits.startsWith("0") && digits.length === 10) {
      digits = "38" + digits;
    }
    // If entered 8067... -> 38067...
    if (digits.startsWith("80") && digits.length === 11) {
      digits = "3" + digits;
    }
    return digits;
  },

  formatPhoneDisplay(digits) {
    if (!digits) return "";
    const clean = digits.replace(/\D/g, "");
    if (clean.startsWith("380") && clean.length === 12) {
      return `+380 (${clean.slice(3, 5)}) ${clean.slice(5, 8)}-${clean.slice(8, 10)}-${clean.slice(10, 12)}`;
    }
    return `+${clean}`;
  },

  getCurrentUser() {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get("user");
    if (fromUrl) {
      const clean = fromUrl.trim().toLowerCase();
      localStorage.setItem("secretary_user", clean);
      return clean;
    }
    return localStorage.getItem("secretary_user") || "";
  },

  isLoggedIn() {
    const user = this.getCurrentUser();
    const key = localStorage.getItem("secret_key");
    // Either a phone user or admin with key
    return Boolean(user && user !== "");
  },

  init() {
    const modal = document.getElementById("phone-auth-modal");
    const input = document.getElementById("phone-login-input");
    const submitBtn = document.getElementById("phone-login-submit-btn");
    const errorEl = document.getElementById("phone-login-error");

    // Check if admin accessed via ?key=... or previously stored key
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get("key");
    if (keyFromUrl) {
      localStorage.setItem("secret_key", keyFromUrl);
      localStorage.setItem("secretary_user", "admin");
    } else if (localStorage.getItem("secret_key")) {
      if (!localStorage.getItem("secretary_user")) {
        localStorage.setItem("secretary_user", "admin");
      }
    }

    const currentUser = this.getCurrentUser();

    // If user already logged in -> do not show modal
    if (currentUser) {
      modal?.classList.add("hidden");
      this.updateAccountBadge(currentUser);
      return;
    }


    // User is visiting for the first time without identity -> show phone login modal
    if (modal) {
      modal.classList.remove("hidden");
      setTimeout(() => input?.focus(), 300);
    }

    // Phone input auto-formatting
    input?.addEventListener("input", (e) => {
      let val = e.target.value;
      if (errorEl) errorEl.style.display = "none";

      // If user starts typing without +, prefix it
      if (val.length === 1 && val !== "+" && !isNaN(val)) {
        val = "+380 (" + val;
        e.target.value = val;
      }
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submitLogin();
      }
    });

    submitBtn?.addEventListener("click", () => {
      this.submitLogin();
    });
  },

  submitLogin() {
    const input = document.getElementById("phone-login-input");
    const errorEl = document.getElementById("phone-login-error");
    const modal = document.getElementById("phone-auth-modal");

    const raw = input?.value?.trim() || "";
    const cleanDigits = this.normalizePhone(raw);

    if (cleanDigits.length < 9 || cleanDigits.length > 15) {
      if (errorEl) {
        errorEl.textContent = "Введіть дійсний номер телефону (наприклад: 067 123 45 67)";
        errorEl.style.display = "block";
      }
      input?.focus();
      return;
    }

    // Store user session
    localStorage.setItem("secretary_user", cleanDigits);
    if (typeof state !== "undefined") {
      state.currentUser = cleanDigits;
    }

    // Hide modal
    modal?.classList.add("hidden");

    // Feedback
    const formatted = this.formatPhoneDisplay(cleanDigits);
    if (typeof showToast === "function") {
      showToast(`👋 Ласкаво просимо! Ваш кабінет створено.`);
    }

    this.updateAccountBadge(cleanDigits);

    // Apply default blocks for this user
    if (window.BlocksManager && typeof window.BlocksManager.applyEnabledBlocks === "function") {
      const userBlocks = window.BlocksManager.getLocalEnabledBlocks();
      window.BlocksManager.applyEnabledBlocks(userBlocks);
    }

    // Initialize user in background
    if (typeof apiFetch === "function") {
      apiFetch("/api/v1/users/me/profile")
        .then(() => {
          if (typeof reloadCurrentTab === "function") {
            reloadCurrentTab();
          }
        })
        .catch(err => console.warn("User profile sync:", err));
    }
  },

  updateAccountBadge(username) {
    const badge = document.getElementById("account-info-badge");
    const switchBtn = document.getElementById("switch-account-btn");
    if (badge) {
      if (username === "admin" || username === "owner" || username === "default") {
        badge.textContent = "👑 Власник (Адміністратор)";
      } else {
        badge.textContent = `📱 ${this.formatPhoneDisplay(username) || username}`;
      }
    }
    if (switchBtn) {
      switchBtn.style.display = "inline-block";
      switchBtn.onclick = () => this.switchAccount();
    }
  },

  switchAccount() {
    if (confirm("Змінити номер телефону або увійти під іншим акаунтом?")) {
      localStorage.removeItem("secretary_user");
      const modal = document.getElementById("phone-auth-modal");
      const input = document.getElementById("phone-login-input");
      if (input) input.value = "";
      modal?.classList.remove("hidden");
      input?.focus();
    }
  }
};

window.AuthPhone = AuthPhone;
