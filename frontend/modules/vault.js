// ===================================================
// Мой Секретарь — Окремий Модуль «Склерозник» (Сейф паролів)
// frontend/modules/vault.js (v3.7.8)
// ===================================================

const VaultModule = {
  state: {
    items: [],
    allItems: [],
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
    crypto: "📈",
    social: "💬",
    email: "📬",
    airlines: "✈️",
    banking: "💳",
    shopping: "🛍️",
    ai: "🤖",
    work: "💼",
    gaming: "🎮",
    wifi: "📶",
    devices: "📱",
    other: "🔒",
  },

  categoryNames: {
    all: "Всі",
    crypto: "Крипта",
    social: "Соцмережі",
    email: "Пошти",
    airlines: "Авіа & Подорожі",
    banking: "Банки & Платежі",
    shopping: "Шопінг & Аукціони",
    ai: "ШІ & Нейромережі",
    work: "Робота & IT",
    gaming: "Ігри & Медіа",
    wifi: "Wi-Fi мережі",
    devices: "Пристрої & Apple ID",
    other: "Сейф / Інше",
  },

  getBrandBadge(title = "", category = "", website_url = "") {
    const t = (title || "").toLowerCase();
    const u = (website_url || "").toLowerCase();

    const badge = (bg, color, content, isText = false) => `
      <div class="vault-brand-avatar" style="background:${bg};color:${color};">
        ${isText ? `<span style="font-weight:900;font-size:0.95rem;letter-spacing:-0.02em;">${content}</span>` : content}
      </div>
    `;

    // 1. Crypto Exchanges
    if (t.includes("binance")) {
      return badge("#F0B90B", "#000000", `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M12 2.5L7.5 7L9.6 9.1L12 6.7L14.4 9.1L16.5 7L12 2.5ZM2.5 12L7 7.5L9.1 9.6L6.7 12L9.1 14.4L7 16.5L2.5 12ZM16.5 17L14.4 14.9L12 17.3L9.6 14.9L7.5 17L12 21.5L16.5 17ZM21.5 12L17 16.5L14.9 14.4L17.3 12L14.9 9.6L17 7.5L21.5 12ZM12 9.5L9.5 12L12 14.5L14.5 12L12 9.5Z"/>
        </svg>
      `);
    }
    if (t.includes("bybit") || t.includes("pybit")) {
      return badge("#18191f", "#FF9800", "BYBIT", true);
    }
    if (t.includes("kucoin")) {
      return badge("#24AE8F", "#ffffff", "KC", true);
    }
    if (t.includes("ftx") || t.includes("blocfolio") || t.includes("blockfolio")) {
      return badge("#00d2d2", "#0f172a", "FTX", true);
    }
    if (t.includes("okx") || t.includes("okex")) {
      return badge("#000000", "#ffffff", "OKX", true);
    }
    if (t.includes("gate.io") || t.includes("gate io") || (t.includes("gate") && category === "crypto")) {
      return badge("#1B68FF", "#ffffff", "GATE", true);
    }
    if (t.includes("huobi") || t.includes("htx")) {
      return badge("#102542", "#00A3FF", "HTX", true);
    }
    if (t.includes("mexc")) {
      return badge("#1e40af", "#38bdf8", "MEXC", true);
    }
    if (t.includes("nexo")) {
      return badge("#1A3E72", "#0ABFF5", "NEXO", true);
    }
    if (t.includes("kraken")) {
      return badge("#5841D8", "#ffffff", "KRK", true);
    }
    if (t.includes("coinbase")) {
      return badge("#0052FF", "#ffffff", "CB", true);
    }
    if (t.includes("gemini") && category === "crypto") {
      return badge("#00DCFA", "#000000", "GEM", true);
    }
    if (t.includes("bitget")) {
      return badge("#1DA2B4", "#ffffff", "BG", true);
    }
    if (t.includes("bitbee") || t.includes("бітбі")) {
      return badge("#F7A900", "#000000", "🐝", true);
    }
    if (t.includes("trax") || t.includes("pro.trade")) {
      return badge("#6C3CE1", "#ffffff", "TRAX", true);
    }
    if (t.includes("whitebit") || t.includes("white bit")) {
      return badge("#1a1a1a", "#FFFFFF", "WB", true);
    }
    if (t.includes("metamask")) {
      return badge("#F6851B", "#ffffff", "🦊", true);
    }
    if (t.includes("trust wallet") || (t.includes("trust") && category === "crypto")) {
      return badge("#0500FF", "#ffffff", "🛡️", true);
    }
    if (t.includes("bitfinex")) {
      return badge("#16b157", "#ffffff", "BFX", true);
    }
    if (t.includes("poloniex")) {
      return badge("#14A0C0", "#ffffff", "PLX", true);
    }
    if (t.includes("bitmex")) {
      return badge("#FF0000", "#ffffff", "MEX", true);
    }
    if (t.includes("phemex")) {
      return badge("#1554f0", "#ffffff", "PHX", true);
    }
    if (t.includes("deribit")) {
      return badge("#02C076", "#ffffff", "DRB", true);
    }
    if (t.includes("exmo") || t.includes("эксмо")) {
      return badge("#0066FF", "#ffffff", "EXMO", true);
    }
    if (t.includes("coinmarketcap")) {
      return badge("#0854d9", "#ffffff", "CMC", true);
    }
    if (t.includes("tradingview")) {
      return badge("#131722", "#2962FF", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M4 17h3v-6H4v6zm5 0h3V7H9v10zm5 0h3v-9h-3v9zm5 0h3v-13h-3v13z"/>
        </svg>
      `);
    }
    if (t.includes("coinlist")) {
      return badge("#000000", "#ffffff", "CL", true);
    }
    if (t.includes("crypto.com")) {
      return badge("#002D74", "#ffffff", "CRO", true);
    }
    if (t.includes("whitebit")) {
      return badge("#1a1a1a", "#ffffff", "WB", true);
    }
    if (t.includes("metamask")) {
      return badge("#F6851B", "#ffffff", "🦊", true);
    }
    if (t.includes("trust")) {
      return badge("#0500FF", "#ffffff", "🛡️", true);
    }

    // 2. Social Networks
    if (t.includes("twitter") || t.includes(" x ") || t.startsWith("x ") || t === "x" || u.includes("x.com") || u.includes("twitter.com")) {
      return badge("#000000", "#ffffff", `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      `);
    }
    if (t.includes("telegram") || t.includes("телеграм")) {
      return badge("#229ED9", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
        </svg>
      `);
    }
    if (t.includes("whatsapp") || t.includes("вотсап") || t.includes("ватсап")) {
      return badge("#25D366", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12.05.5C5.495.5.5 5.495.5 12.05c0 2.023.514 3.93 1.42 5.591L.5 23.5l5.952-1.395A11.524 11.524 0 0012.05 23.6c6.555 0 11.55-4.995 11.55-11.55S18.605.5 12.05.5zm0 21.1a9.53 9.53 0 01-4.908-1.358l-.35-.208-3.633.852.895-3.528-.229-.364A9.537 9.537 0 012.5 12.05c0-5.27 4.28-9.55 9.55-9.55s9.55 4.28 9.55 9.55-4.28 9.55-9.55 9.55z"/>
        </svg>
      `);
    }
    if (t.includes("viber") || t.includes("вайбер")) {
      return badge("#7B519D", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M11.985 0C5.372 0 0 5.373 0 12c0 2.234.617 4.322 1.688 6.11L.504 23.05c-.13.504.364.99.865.852l4.87-1.346A11.985 11.985 0 0011.985 24C18.627 24 24 18.627 24 12S18.627 0 11.985 0zM17.5 16.5c-.4.45-.9.7-1.4.7-.3 0-.6-.07-.88-.2-1.42-.66-2.7-1.56-3.8-2.66-1.1-1.1-2-2.37-2.65-3.79-.15-.3-.22-.62-.2-.94.04-.5.28-1 .7-1.38l.6-.54c.38-.35.96-.35 1.34 0l1.3 1.3c.36.36.36.95 0 1.31l-.42.42c-.14.14-.16.36-.05.52.65 1.02 1.5 1.9 2.52 2.54.16.1.38.08.52-.06l.42-.42c.36-.36.95-.36 1.31 0l1.3 1.3c.37.37.37.97 0 1.34l-.37.37z"/>
        </svg>
      `);
    }
    if (t.includes("linkedin") || t.includes("линкедін")) {
      return badge("#0A66C2", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      `);
    }
    if (t.includes("snapchat") || t.includes("снепчат")) {
      return badge("#FFFC00", "#000000", "👻", true);
    }
    if (t.includes("pinterest") || t.includes("пінтерест")) {
      return badge("#E60023", "#ffffff", "P", true);
    }
    if (t.includes("twitch") || t.includes("твіч")) {
      return badge("#9147FF", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
        </svg>
      `);
    }
    if (t.includes("discord") || t.includes("дискорд")) {
      return badge("#5865F2", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      `);
    }
    if (t.includes("instagram") || t.includes("инста")) {
      return badge("linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
        </svg>
      `);
    }
    if (t.includes("facebook") || t.includes("фейсбук") || t.includes("мета") || t.includes("meta")) {
      return badge("#1877F2", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      `);
    }
    if (t.includes("tiktok") || t.includes("тикток")) {
      return badge("#000000", "#00f2fe", "♪", true);
    }
    if (t.includes("reddit") || t.includes("реддит")) {
      return badge("#FF4500", "#ffffff", "👽", true);
    }
    if (t.includes("youtube") || t.includes("ютуб")) {
      return badge("#FF0000", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      `);
    }
    if (t.includes("medium")) {
      return badge("#000000", "#ffffff", "M", true);
    }
    if (t.includes("signal") || t.includes("сигнал")) {
      return badge("#3A76F0", "#ffffff", "Sg", true);
    }

    // 3. Email
    if (t.includes("gmail") || (t.includes("google") && category === "email") || u.includes("gmail.com")) {
      return badge("#ffffff", "#EA4335", `
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="#4285F4" d="M22 6.5l-10 7.5L2 6.5V19c0 .55.45 1 1 1h18c.55 0 1-.45 1-1V6.5z"/>
          <path fill="#EA4335" d="M2 5c0-.55.45-1 1-1h1.5l7.5 5.5L19.5 4H21c.55 0 1 .45 1 1v1.5l-10 7.5-10-7.5V5z"/>
        </svg>
      `);
    }
    if (t.includes("ukr.net") || t.includes("укрнет") || u.includes("ukr.net")) {
      return badge("linear-gradient(135deg, #0057b7 50%, #ffd700 50%)", "#ffffff", "✉️", true);
    }
    if (t.includes("outlook") || t.includes("hotmail") || t.includes("live.com") || u.includes("outlook.com") || u.includes("hotmail.com")) {
      return badge("#0078D4", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.32-.58.51-.37.19-.87.19t-.85-.19q-.35-.19-.57-.51-.22-.33-.33-.74-.1-.42-.1-.87t.1-.87q.1-.42.33-.74.22-.33.57-.52.36-.19.85-.19t.87.19q.36.19.58.52.22.32.33.74.11.42.11.87zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V9h1q.41 0 .71.3.29.29.29.7zm-9-7.45v3.5l-2 1.34L11 7.6V4.55H7.88v8.01l6.72 4.56L21.1 12.5 21.1 4.55H15z"/>
        </svg>
      `);
    }
    if (t.includes("yahoo") || t.includes("яхо")) {
      return badge("#6001D2", "#ffffff", "Y!", true);
    }
    if (t.includes("proton") || t.includes("protonmail")) {
      return badge("#6D4AFF", "#ffffff", "PM", true);
    }
    if (t.includes("icloud") && category === "email") {
      return badge("#1e293b", "#ffffff", "☁️", true);
    }
    if (t.includes("zoho")) {
      return badge("#E42527", "#ffffff", "Z", true);
    }
    if (t.includes("mail.ru") || t.includes("мейл.ру")) {
      return badge("#005FF9", "#ffffff", "@", true);
    }
    if (t.includes("i.ua") || t.includes("і.ua")) {
      return badge("#00ADEF", "#ffffff", "i", true);
    }

    // 4. Airlines & Travel
    if (t.includes("ryanair") || t.includes("runair")) {
      return badge("#003580", "#F1C40F", "✈️", true);
    }
    if (t.includes("wizz") || t.includes("визэир")) {
      return badge("#C6007E", "#ffffff", "WIZZ", true);
    }
    if (t.includes("easyjet")) {
      return badge("#FF6600", "#ffffff", "eJ", true);
    }
    if (t.includes("мау") || t.includes("ukraine international") || t.includes("панорама клуб") || t.includes("uia")) {
      return badge("#002B49", "#F1C40F", "UIA", true);
    }
    if (t.includes("turkish") || t.includes("turkish airlines") || t.includes("thy")) {
      return badge("#C8102E", "#ffffff", "TK", true);
    }
    if (t.includes("qatar") || t.includes("катар")) {
      return badge("#5C0632", "#ffffff", "QR", true);
    }
    if (t.includes("emirates") || t.includes("емірейтс")) {
      return badge("#D71921", "#C6A84B", "EK", true);
    }
    if (t.includes("flydubai") || t.includes("fly dubai")) {
      return badge("#E31837", "#ffffff", "FZ", true);
    }
    if (t.includes("lot") || t.includes("лот польські")) {
      return badge("#003F8A", "#ffffff", "LOT", true);
    }
    if (t.includes("lufthansa") || t.includes("люфтганза")) {
      return badge("#05164D", "#FFD700", "LH", true);
    }
    if (t.includes("klm")) {
      return badge("#009FDF", "#ffffff", "KL", true);
    }
    if (t.includes("airfrance") || t.includes("air france")) {
      return badge("#002395", "#ffffff", "AF", true);
    }
    if (t.includes("booking") || u.includes("booking.com")) {
      return badge("#003580", "#ffffff", "B.", true);
    }
    if (t.includes("airbnb")) {
      return badge("#FF5A5F", "#ffffff", "🏡", true);
    }
    if (t.includes("hotels.com") || t.includes("Hotels.com")) {
      return badge("#CC1F1A", "#ffffff", "H.", true);
    }
    if (t.includes("trip.com") || t.includes("трип")) {
      return badge("#1977CC", "#ffffff", "✈", true);
    }

    // 5. Banking & Payments
    if (t.includes("paypal")) {
      return badge("#003087", "#0079C1", "PP", true);
    }
    if (t.includes("приват") || t.includes("privat24") || t.includes("privatbank")) {
      return badge("#70C041", "#ffffff", "P24", true);
    }
    if (t.includes("моно") || t.includes("mono")) {
      return badge("#111111", "#ffffff", "🐈", true);
    }
    if (t.includes("revolut")) {
      return badge("#000000", "#ffffff", "R", true);
    }
    if (t.includes("wise") || t.includes("transferwise")) {
      return badge("#9FE870", "#163300", "W", true);
    }
    if (t.includes("stripe")) {
      return badge("#635BFF", "#ffffff", "Str", true);
    }
    if (t.includes("paysend") || t.includes("пейсенд")) {
      return badge("#702DDE", "#ffffff", "PS", true);
    }
    if (t.includes("pumb") || t.includes("пумб")) {
      return badge("#CC0000", "#ffffff", "PUMB", true);
    }
    if (t.includes("ощадбанк") || t.includes("oschadbank") || t.includes("ощад")) {
      return badge("#008000", "#ffffff", "ОЩ", true);
    }
    if (t.includes("укрсиббанк") || t.includes("ukrsibbank")) {
      return badge("#E30613", "#ffffff", "USB", true);
    }
    if (t.includes("raiffeisen") || t.includes("райффайзен")) {
      return badge("#FFFF00", "#000000", "R", true);
    }
    if (t.includes("sepa") || t.includes("swift")) {
      return badge("#003087", "#ffffff", "€", true);
    }
    if (t.includes("western union") || t.includes("вестерн")) {
      return badge("#FFCC00", "#000000", "WU", true);
    }
    if (t.includes("cash app") || t.includes("cashapp")) {
      return badge("#00D632", "#ffffff", "$", true);
    }
    if (t.includes("apple pay")) {
      return badge("#000000", "#ffffff", "Pay", true);
    }
    if (t.includes("google pay") || t.includes("gpay")) {
      return badge("#4285F4", "#ffffff", "G\nPay", true);
    }

    // 6. Shopping & Auctions
    if (t.includes("ebay") || t.includes("ебей")) {
      return badge("#ffffff", "#e53238", "ebay", true);
    }
    if (t.includes("olx") || t.includes("олх")) {
      return badge("#002F34", "#00ffd0", "OLX", true);
    }
    if (t.includes("copart") || t.includes("копарт") || t.includes("iaa") || (t.includes("auction") && category === "shopping")) {
      return badge("#102B4E", "#ffffff", "🏎️", true);
    }
    if (t.includes("amazon") || t.includes("амазон")) {
      return badge("#131921", "#FF9900", "a", true);
    }
    if (t.includes("rozetka") || t.includes("розетка")) {
      return badge("#00a046", "#ffffff", "R", true);
    }
    if (t.includes("aliexpress") || t.includes("aлиэкспресс") || t.includes("аліекспрес")) {
      return badge("#FF6A00", "#ffffff", "Ali", true);
    }
    if (t.includes("alibaba")) {
      return badge("#FF6A00", "#ffffff", "ALI", true);
    }
    if (t.includes("prom.ua") || t.includes("prom ") || (t.includes("prom") && category === "shopping")) {
      return badge("#F15A22", "#ffffff", "Prom", true);
    }
    if (t.includes("foxtrot") || t.includes("фокстрот")) {
      return badge("#E30613", "#ffffff", "FOX", true);
    }
    if (t.includes("epicentr") || t.includes("епіцентр")) {
      return badge("#F7A600", "#000000", "EPC", true);
    }
    if (t.includes("nova poshta") || t.includes("нова пошта") || t.includes("новою поштою")) {
      return badge("#CC0000", "#ffffff", "НП", true);
    }
    if (t.includes("ukrposhta") || t.includes("укрпошта")) {
      return badge("#F7B731", "#000000", "УП", true);
    }

    // 7. Work, Cloud & IT
    if (t.includes("github")) {
      return badge("#24292e", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      `);
    }
    if (t.includes("gitlab")) {
      return badge("#FC6D26", "#ffffff", "GL", true);
    }
    if (t.includes("slack") || t.includes("слак")) {
      return badge("#4A154B", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
      `);
    }
    if (t.includes("figma")) {
      return badge("#0ACF83", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.02s1.354 3.018 3.019 3.018h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 10.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm-3.54 11.02c0 2.476 2.014 4.49 4.49 4.49s4.49-2.014 4.49-4.49v-4.49H9.1c-2.476 0-4.492 2.014-4.492 4.49zM9.1 17.981c1.665 0 3.019 1.355 3.019 3.019s-1.354 3.019-3.019 3.019-3.019-1.355-3.019-3.019 1.355-3.019 3.019-3.019z"/>
        </svg>
      `);
    }
    if (t.includes("notion")) {
      return badge("#000000", "#ffffff", "N", true);
    }
    if (t.includes("jira") || t.includes("confluence") || t.includes("atlassian")) {
      return badge("#0052CC", "#ffffff", "JR", true);
    }
    if (t.includes("zoom")) {
      return badge("#2D8CFF", "#ffffff", "Z", true);
    }
    if (t.includes("dropbox")) {
      return badge("#0061FF", "#ffffff", "📦", true);
    }
    if (t.includes("диск") || t.includes("яндекс")) {
      return badge("#fc3f1d", "#ffffff", "Я.Д", true);
    }
    if (t.includes("google drive") || t.includes("гугл диск")) {
      return badge("#ffffff", "#4285F4", "▲", true);
    }
    if (t.includes("cloudflare")) {
      return badge("#F38020", "#ffffff", "CF", true);
    }
    if (t.includes("digitalocean") || t.includes("digital ocean")) {
      return badge("#0080FF", "#ffffff", "DO", true);
    }
    if (t.includes("vercel")) {
      return badge("#000000", "#ffffff", "▲", true);
    }
    if (t.includes("heroku")) {
      return badge("#430098", "#ffffff", "H", true);
    }
    if (t.includes("canva") || t.includes("канва")) {
      return badge("#7D2AE8", "#ffffff", "C", true);
    }
    if (t.includes("microsoft") || t.includes("microsoft 365") || t.includes("ms365") || t.includes("office")) {
      return badge("#F25022", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M11.5 2.75l-9 5.25v8l9 5.25 9-5.25v-8l-9-5.25zm0 1.5l7.5 4.375v7.25L11.5 20.25 4 15.875v-7.25L11.5 4.25z"/>
        </svg>
      `);
    }
    if (t.includes("steam") || t.includes("стим")) {
      return badge("#171a21", "#66c0f4", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.56 3.08 8.41 7.28 9.57l2.84-4.14c-.2-.42-.32-.89-.32-1.39 0-1.78 1.44-3.22 3.22-3.22s3.22 1.44 3.22 3.22-1.44 3.22-3.22 3.22c-.63 0-1.22-.19-1.71-.51l-4.05 2.7c1.47.48 3.05.75 4.68.75 5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
        </svg>
      `);
    }
    if (t.includes("netflix") || t.includes("нетфлікс")) {
      return badge("#141414", "#E50914", "N", true);
    }
    if (t.includes("spotify") || t.includes("спотіфай")) {
      return badge("#191414", "#1DB954", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      `);
    }
    if (t.includes("hbo") || t.includes("hbo max") || t.includes("max")) {
      return badge("#002BE7", "#ffffff", "MAX", true);
    }
    if (t.includes("playstation") || t.includes("psn") || t.includes("пс4") || t.includes("пс5")) {
      return badge("#003791", "#ffffff", "PS", true);
    }
    if (t.includes("xbox") || t.includes("иксбокс")) {
      return badge("#107C10", "#ffffff", "X", true);
    }
    if (t.includes("epic games") || t.includes("эпик") || t.includes("епік")) {
      return badge("#000000", "#ffffff", "EG", true);
    }

    // 8. Apple & Devices
    if (t.includes("apple") || t.includes("айфон") || t.includes("iphone") || t.includes("icloud") || t.includes("apple id")) {
      return badge("#1e293b", "#ffffff", `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.67-.82 1.13-1.96.99-3.17-1.03.05-2.28.69-2.99 1.52-.62.72-1.15 1.88-1.01 3.01 1.15.09 2.34-.54 3.01-1.36z"/>
        </svg>
      `);
    }
    if (t.includes("samsung") || t.includes("самсунг")) {
      return badge("#1428A0", "#ffffff", "SAM", true);
    }
    if (t.includes("xiaomi") || t.includes("сяомі")) {
      return badge("#FF6900", "#ffffff", "Mi", true);
    }

    // 9. AI & Neural Networks
    if (t.includes("chatgpt") || t.includes("openai") || t.includes("gpt")) {
      return badge("#10A37F", "#ffffff", "GPT", true);
    }
    if (t.includes("claude") || t.includes("anthropic")) {
      return badge("#D97706", "#ffffff", "✦", true);
    }
    if (t.includes("gemini") && category === "ai") {
      return badge("linear-gradient(135deg,#4285F4,#9B59B6)", "#ffffff", "G✦", true);
    }
    if (t.includes("perplexity") || t.includes("перплексіті")) {
      return badge("#1C1C1E", "#20B2AA", "PP", true);
    }
    if (t.includes("grok") || t.includes("xai")) {
      return badge("#000000", "#ffffff", "Gr", true);
    }
    if (t.includes("midjourney")) {
      return badge("#000000", "#ffffff", "⛵", true);
    }
    if (t.includes("stability") || t.includes("stable diffusion")) {
      return badge("#7C3AED", "#ffffff", "SD", true);
    }
    if (t.includes("mistral")) {
      return badge("#FF7000", "#ffffff", "Mis", true);
    }
    if (t.includes("replit")) {
      return badge("#F26207", "#ffffff", "Rp", true);
    }

    // 10. Wi-Fi
    if (category === "wifi" || t.includes("wi-fi") || t.includes("wifi")) {
      return badge("#0284C7", "#ffffff", "📶", true);
    }

    // Fallbacks by category
    const catPalettes = {
      crypto: ["linear-gradient(135deg, #f59e0b, #d97706)", "#ffffff", "📈"],
      banking: ["linear-gradient(135deg, #10b981, #059669)", "#ffffff", "💳"],
      airlines: ["linear-gradient(135deg, #0ea5e9, #0284c7)", "#ffffff", "✈️"],
      ai: ["linear-gradient(135deg, #8b5cf6, #6d28d9)", "#ffffff", "🤖"],
      social: ["linear-gradient(135deg, #ec4899, #be185d)", "#ffffff", "💬"],
      email: ["linear-gradient(135deg, #f43f5e, #e11d48)", "#ffffff", "📬"],
      shopping: ["linear-gradient(135deg, #f97316, #ea580c)", "#ffffff", "🛍️"],
      work: ["linear-gradient(135deg, #3b82f6, #1d4ed8)", "#ffffff", "💼"],
      gaming: ["linear-gradient(135deg, #6366f1, #4338ca)", "#ffffff", "🎮"],
      wifi: ["linear-gradient(135deg, #06b6d4, #0891b2)", "#ffffff", "📶"],
      devices: ["linear-gradient(135deg, #64748b, #334155)", "#ffffff", "📱"],
      other: ["linear-gradient(135deg, #475569, #1e293b)", "#ffffff", "🔒"],
    };

    const p = catPalettes[category] || catPalettes.other;
    return badge(p[0], p[1], p[2], true);
  },

  async loadItems() {
    const listEl = document.getElementById("vault-cards-list");
    if (listEl && (!this.state.allItems || this.state.allItems.length === 0)) {
      listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">⏳</span><p>Завантажую Склерозник...</p></div>`;
    }

    try {
      const res = await apiFetch("/api/v1/vault/items");
      this.state.allItems = Array.isArray(res) ? res : [];
      this.applyFilterAndRender();
      this.updateCounts();
    } catch (err) {
      if (listEl) {
        listEl.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><p>Помилка завантаження: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  },

  applyFilterAndRender() {
    const cat = this.state.currentCategory || "all";
    const q = (this.state.searchQuery || "").trim().toLowerCase();

    let filtered = this.state.allItems || [];
    if (cat !== "all") {
      filtered = filtered.filter(it => (it.category || "other") === cat);
    }
    if (q) {
      filtered = filtered.filter(it =>
        (it.title || "").toLowerCase().includes(q) ||
        (it.login || "").toLowerCase().includes(q) ||
        (it.notes || "").toLowerCase().includes(q) ||
        (it.website_url || "").toLowerCase().includes(q)
      );
    }
    this.state.items = filtered;
    this.renderItems();
  },

  updateCounts() {
    const all = this.state.allItems || [];
    const counts = { all: all.length };
    all.forEach(it => {
      const c = it.category || "other";
      counts[c] = (counts[c] || 0) + 1;
    });

    document.querySelectorAll(".vault-cat-pill").forEach(pill => {
      const cat = pill.dataset.cat;
      const countBadge = pill.querySelector(".vault-pill-count");
      if (countBadge) {
        if (cat === "all") {
          countBadge.textContent = all.length;
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
    this.applyFilterAndRender();
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

    // Apply saved sort order
    let items = this.state.items || [];
    const savedOrder = this._getSortOrder();
    if (savedOrder.length > 0) {
      const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
      items = [...items].sort((a, b) => {
        const ai = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
        const bi = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
        return ai - bi;
      });
    }

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
      const icon = this.categoryIcons[it.category] || "🔒";
      const maskedPwd = it.password ? (isVisible ? escapeHtml(it.password) : "••••••••••••") : "";
      const brandBadgeHtml = this.getBrandBadge(it.title, it.category, it.website_url);

      let planBadge = "";
      if (it.plan_type) {
        const isPro = it.plan_type.toLowerCase().includes("pro") || it.plan_type.toLowerCase().includes("plus");
        planBadge = isPro 
          ? `<span class="item-badge" style="background:rgba(234,179,8,0.22);color:#eab308;border:1px solid rgba(234,179,8,0.4);font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:6px;">💎 ${escapeHtml(it.plan_type.toUpperCase())}</span>`
          : `<span class="item-badge" style="background:rgba(148,163,184,0.2);color:#cbd5e1;border:1px solid rgba(148,163,184,0.3);font-size:0.75rem;padding:2px 8px;border-radius:6px;">🆓 ${escapeHtml(it.plan_type.toUpperCase())}</span>`;
      }

      let twoFaBadge = "";
      if (it.two_factor_note) {
        twoFaBadge = `<span class="item-badge" style="background:rgba(14,165,233,0.18);color:#38bdf8;border:1px solid rgba(56,189,248,0.35);font-size:0.74rem;font-weight:700;padding:2px 8px;border-radius:6px;" title="${escapeHtml(it.two_factor_note)}">🛡️ 2FA</span>`;
      }

      const isWifi = it.category === "wifi";
      const loginLabel = isWifi ? "Мережа (SSID):" : (it.category === "devices" ? "Apple ID / Номер:" : "Логін / Email:");

      return `
        <div class="vault-card" data-id="${it.id}" data-cat="${it.category || 'other'}" draggable="true">
          <!-- Drag Handle -->
          <div class="vault-drag-handle" title="Перетягнути для зміни порядку">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" opacity="0.4">
              <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
            </svg>
          </div>
          <!-- Card Header: Avatar + Title & Badges + Actions -->
          <div class="vault-card-header">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
              ${brandBadgeHtml}
              
              <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <h3 class="vault-card-title">${escapeHtml(it.title)}</h3>
                  ${planBadge}
                  ${twoFaBadge}
                </div>
                <div class="vault-card-cat-label">
                  ${icon} ${this.categoryNames[it.category] || it.category}
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="vault-card-actions">
              ${it.website_url ? `
                <a href="${escapeHtml(it.website_url)}" target="_blank" rel="noopener noreferrer" class="vault-open-btn" title="Відкрити сайт">
                  🔗 Open ↗
                </a>
              ` : ''}
              <button class="action-btn-sm" style="padding:6px 9px;font-size:0.85rem;" onclick="VaultModule.openEditModal(${it.id})" title="Редагувати">✏️</button>
              <button class="action-btn-sm" style="padding:6px 9px;font-size:0.85rem;color:var(--danger,#ff453a);" onclick="VaultModule.deleteItem(${it.id})" title="Видалити">🗑️</button>
            </div>
          </div>

          <!-- Credential Rows (Login & Password) -->
          <div class="vault-cred-container">
            ${it.login ? `
              <div class="vault-cred-row">
                <div style="flex:1;min-width:0;">
                  <span class="vault-cred-label">${loginLabel}</span>
                  <div class="vault-cred-value">${escapeHtml(it.login)}</div>
                </div>
                <button type="button" class="vault-copy-btn" onclick="VaultModule.copyText('${escapeJsString(it.login)}', '${loginLabel}')" title="Скопіювати логін">
                  📋 Копіювати
                </button>
              </div>
            ` : ''}

            ${it.password ? `
              <div class="vault-cred-row" style="${it.login ? 'border-top:1px dashed rgba(255,255,255,0.12);padding-top:10px;' : ''}">
                <div style="flex:1;min-width:0;">
                  <span class="vault-cred-label">Пароль / PIN-код:</span>
                  <div class="vault-cred-value pwd">${maskedPwd}</div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <button type="button" class="action-btn-sm" style="padding:6px 9px;" onclick="VaultModule.togglePasswordVisibility(${it.id})" title="${isVisible ? 'Сховати пароль' : 'Показати пароль'}">
                    ${isVisible ? '🙈' : '👁️'}
                  </button>
                  <button type="button" class="vault-copy-btn" onclick="VaultModule.copyText('${escapeJsString(it.password)}', 'Пароль')" title="Скопіювати пароль">
                    📋 Копіювати
                  </button>
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Notes, 2FA Details, Wi-Fi QR -->
          ${(it.notes || it.two_factor_note || (isWifi && it.password)) ? `
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${it.notes ? `
                <div class="vault-notes-box">
                  <span style="font-weight:700;color:#38bdf8;margin-right:6px;">📝 Примітка:</span>
                  <span>${escapeHtml(it.notes)}</span>
                </div>
              ` : ''}
              ${(it.two_factor_note && !it.notes?.includes(it.two_factor_note)) ? `
                <div class="vault-notes-box" style="border-color:rgba(14,165,233,0.3);background:rgba(14,165,233,0.1);">
                  <span style="font-weight:700;color:#38bdf8;margin-right:6px;">🛡️ 2FA / Верифікація:</span>
                  <span>${escapeHtml(it.two_factor_note)}</span>
                </div>
              ` : ''}
              ${(isWifi && it.password) ? `
                <button type="button" class="action-btn-sm" style="background:rgba(14,165,233,0.18);color:#38bdf8;font-weight:700;padding:7px 12px;border:1px solid rgba(56,189,248,0.35);border-radius:10px;align-self:flex-start;" onclick="VaultModule.showWifiQR('${escapeJsString(it.title)}', '${escapeJsString(it.login || it.title)}', '${escapeJsString(it.password)}')">
                  📶 QR-код для гостей
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
      this.state.allItems = (this.state.allItems || []).filter(x => x.id !== id);
      this.applyFilterAndRender();
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
  async compressImageFile(file, maxDimension = 2048, quality = 0.88) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const img = new Image();
          img.onload = () => {
            try {
              let { width, height } = img;
              if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                  height = Math.round((height * maxDimension) / width);
                  width = maxDimension;
                } else {
                  width = Math.round((width * maxDimension) / height);
                  height = maxDimension;
                }
              }

              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob(
                (blob) => {
                  if (blob && blob.size > 0) {
                    resolve(new File([blob], "camera_sheet.jpg", { type: "image/jpeg" }));
                  } else {
                    resolve(file);
                  }
                },
                "image/jpeg",
                quality
              );
            } catch (err) {
              resolve(file);
            }
          };
          img.onerror = () => resolve(file);
          img.src = readerEvent.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
      } catch (e) {
        resolve(file);
      }
    });
  },

  async handleImageSelected(e) {
    const rawFile = e.target?.files?.[0];
    if (!rawFile) return;

    showToast("🔍 Зчитую та розпізнаю фото через Gemini Vision OCR...", 8000);

    try {
      const file = await this.compressImageFile(rawFile);
      const formData = new FormData();
      formData.append("image", file, file.name || "sheet.jpg");

      const res = await apiFetch("/api/v1/vault/ai-parse-image", {
        method: "POST",
        body: formData,
      });

      if (res && res.items && res.items.length > 0) {
        this.openReviewModal(res.items);
      } else {
        showToast("⚠️ Не вдалося знайти паролі на фото. Переконайтеся, що текст видно чітко.");
      }
    } catch (err) {
      console.error("Vault photo OCR error:", err);
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
    const listEl = document.getElementById("vault-review-list");
    if (listEl) listEl.scrollTop = 0;
  },

  closeReviewModal() {
    document.getElementById("vault-review-modal")?.classList.add("hidden");
    this.state.parsedQueue = [];
  },

  renderReviewItems() {
    const container = document.getElementById("vault-review-list");
    if (!container) return;

    if (this.state.parsedQueue.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;text-align:center;">
          <span style="font-size:2.4rem;">🎉</span>
          <p style="margin-top:10px;font-size:1rem;color:#cbd5e1;font-weight:600;">Усі записи збережено або видалено</p>
        </div>
      `;
      const countEl = document.getElementById("vault-review-count");
      if (countEl) countEl.textContent = "0";
      const saveBtn = document.getElementById("vault-review-save-btn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "✅ Немає записів для збереження";
      }
      return;
    }

    container.innerHTML = this.state.parsedQueue.map((it, idx) => `
      <div class="vault-review-card" style="flex-shrink:0;">
        <!-- Header row: Index badge + Title + Category + Delete -->
        <div class="vault-review-row-header">
          <span style="background:rgba(56,189,248,0.2);color:#38bdf8;font-weight:800;font-size:0.85rem;padding:6px 10px;border-radius:8px;border:1px solid rgba(56,189,248,0.35);flex-shrink:0;">
            #${idx + 1}
          </span>

          <input type="text" 
                 class="vault-review-title-input" 
                 value="${escapeHtml(it.title || '')}" 
                 placeholder="Назва біржі / сервісу" 
                 oninput="VaultModule.updateParsedItem(${it._tempId}, 'title', this.value)" />

          <select class="vault-review-cat-select" onchange="VaultModule.updateParsedItem(${it._tempId}, 'category', this.value)">
            <option value="crypto" ${it.category === 'crypto' ? 'selected' : ''}>📈 Крипта</option>
            <option value="social" ${it.category === 'social' ? 'selected' : ''}>💬 Соцмережі</option>
            <option value="email" ${it.category === 'email' ? 'selected' : ''}>📬 Пошти</option>
            <option value="airlines" ${it.category === 'airlines' ? 'selected' : ''}>✈️ Авіа</option>
            <option value="banking" ${it.category === 'banking' ? 'selected' : ''}>💳 Банки</option>
            <option value="shopping" ${it.category === 'shopping' ? 'selected' : ''}>🛍️ Шопінг</option>
            <option value="ai" ${it.category === 'ai' ? 'selected' : ''}>🤖 ШІ</option>
            <option value="work" ${it.category === 'work' ? 'selected' : ''}>💼 Робота</option>
            <option value="gaming" ${it.category === 'gaming' ? 'selected' : ''}>🎮 Ігри</option>
            <option value="wifi" ${it.category === 'wifi' ? 'selected' : ''}>📶 Wi-Fi</option>
            <option value="devices" ${it.category === 'devices' ? 'selected' : ''}>📱 Пристрої</option>
            <option value="other" ${it.category === 'other' ? 'selected' : ''}>🔒 Сейф</option>
          </select>

          <button type="button" 
                  class="vault-review-del-btn" 
                  onclick="VaultModule.removeParsedItem(${it._tempId})" 
                  title="Видалити цей пункт зі списку">
            🗑️
          </button>
        </div>

        <!-- Credential Fields: Login and Password -->
        <div class="vault-review-fields-grid">
          <div class="vault-review-field-group">
            <label class="vault-review-field-label">Логін / Email / Акаунт:</label>
            <input type="text" 
                   class="vault-review-field-input" 
                   value="${escapeHtml(it.login || '')}" 
                   placeholder="Логін відсутній" 
                   oninput="VaultModule.updateParsedItem(${it._tempId}, 'login', this.value)" />
          </div>

          <div class="vault-review-field-group">
            <label class="vault-review-field-label">Пароль / PIN / Ключ:</label>
            <input type="text" 
                   class="vault-review-field-input pwd" 
                   value="${escapeHtml(it.password || '')}" 
                   placeholder="Пароль відсутній" 
                   oninput="VaultModule.updateParsedItem(${it._tempId}, 'password', this.value)" />
          </div>
        </div>

        <!-- Optional: Notes / Website / Plan / 2FA -->
        ${(it.website_url || it.notes || it.two_factor_note || it.plan_type) ? `
          <div class="vault-review-extra">
            ${it.plan_type ? `<span>💎 Тариф: <strong>${escapeHtml(it.plan_type.toUpperCase())}</strong></span>` : ''}
            ${it.two_factor_note ? `<span>🛡️ 2FA: <strong>${escapeHtml(it.two_factor_note)}</strong></span>` : ''}
            ${it.notes ? `<span>📝 ${escapeHtml(it.notes)}</span>` : ''}
            ${it.website_url ? `<span>🌐 ${escapeHtml(it.website_url)}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `).join("");

    const countEl = document.getElementById("vault-review-count");
    if (countEl) countEl.textContent = this.state.parsedQueue.length;

    const saveBtn = document.getElementById("vault-review-save-btn");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = `✅ Зберегти всі (${this.state.parsedQueue.length}) в Склерозник`;
    }
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

  // --- Drag-to-Reorder ---
  _getSortOrder() {
    try { return JSON.parse(localStorage.getItem("vault_sort_order") || "[]"); }
    catch { return []; }
  },
  _saveSortOrder(ids) {
    try { localStorage.setItem("vault_sort_order", JSON.stringify(ids)); }
    catch {}
  },

  initDragSort() {
    const listEl = document.getElementById("vault-cards-list");
    if (!listEl) return;

    let dragSrcId = null;

    listEl.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".vault-card[draggable]");
      if (!card) return;
      dragSrcId = parseInt(card.dataset.id, 10);
      card.classList.add("vault-card-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragSrcId);
    }, true);

    listEl.addEventListener("dragend", (e) => {
      listEl.querySelectorAll(".vault-card").forEach(c => {
        c.classList.remove("vault-card-dragging", "vault-card-dragover");
      });
      dragSrcId = null;
    }, true);

    listEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const card = e.target.closest(".vault-card[draggable]");
      if (!card) return;
      listEl.querySelectorAll(".vault-card").forEach(c => c.classList.remove("vault-card-dragover"));
      if (parseInt(card.dataset.id, 10) !== dragSrcId) {
        card.classList.add("vault-card-dragover");
      }
    }, true);

    listEl.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetCard = e.target.closest(".vault-card[draggable]");
      if (!targetCard || !dragSrcId) return;
      const targetId = parseInt(targetCard.dataset.id, 10);
      if (targetId === dragSrcId) return;

      // Reorder in current items array
      const cards = [...listEl.querySelectorAll(".vault-card[data-id]")];
      const ids = cards.map(c => parseInt(c.dataset.id, 10));
      const srcIdx = ids.indexOf(dragSrcId);
      const dstIdx = ids.indexOf(targetId);
      if (srcIdx === -1 || dstIdx === -1) return;

      ids.splice(srcIdx, 1);
      ids.splice(dstIdx, 0, dragSrcId);
      this._saveSortOrder(ids);

      // Visually move the card (fast, no full re-render)
      const srcCard = listEl.querySelector(`.vault-card[data-id="${dragSrcId}"]`);
      if (srcCard && targetCard) {
        if (srcIdx < dstIdx) {
          targetCard.after(srcCard);
        } else {
          targetCard.before(srcCard);
        }
      }
      listEl.querySelectorAll(".vault-card").forEach(c => c.classList.remove("vault-card-dragover", "vault-card-dragging"));
      showToast("✅ Порядок збережено");
    }, true);

    // iOS touch drag support
    let touchStartY = 0, touchCard = null;
    listEl.addEventListener("touchstart", (e) => {
      const handle = e.target.closest(".vault-drag-handle");
      if (!handle) return;
      touchCard = handle.closest(".vault-card[draggable]");
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    listEl.addEventListener("touchmove", (e) => {
      if (!touchCard) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      const overEl = document.elementFromPoint(e.touches[0].clientX, y);
      const overCard = overEl?.closest(".vault-card[draggable]");
      listEl.querySelectorAll(".vault-card").forEach(c => c.classList.remove("vault-card-dragover"));
      if (overCard && overCard !== touchCard) overCard.classList.add("vault-card-dragover");
    }, { passive: false });

    listEl.addEventListener("touchend", (e) => {
      if (!touchCard) return;
      const touch = e.changedTouches[0];
      const overEl = document.elementFromPoint(touch.clientX, touch.clientY);
      const overCard = overEl?.closest(".vault-card[draggable]");
      if (overCard && overCard !== touchCard) {
        const srcId = parseInt(touchCard.dataset.id, 10);
        const dstId = parseInt(overCard.dataset.id, 10);
        const cards = [...listEl.querySelectorAll(".vault-card[data-id]")];
        const ids = cards.map(c => parseInt(c.dataset.id, 10));
        const srcIdx = ids.indexOf(srcId);
        const dstIdx = ids.indexOf(dstId);
        if (srcIdx !== -1 && dstIdx !== -1) {
          ids.splice(srcIdx, 1);
          ids.splice(dstIdx, 0, srcId);
          this._saveSortOrder(ids);
          if (srcIdx < dstIdx) overCard.after(touchCard);
          else overCard.before(touchCard);
          showToast("✅ Порядок збережено");
        }
      }
      listEl.querySelectorAll(".vault-card").forEach(c => c.classList.remove("vault-card-dragover", "vault-card-dragging"));
      touchCard = null;
    }, { passive: true });
  },

  init() {
    // Search input (instant client-side filter)
    const searchInput = document.getElementById("vault-search-input");
    searchInput?.addEventListener("input", (e) => {
      this.state.searchQuery = e.target.value;
      this.applyFilterAndRender();
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

    // Auto-load items on startup
    this.loadItems().then(() => this.initDragSort());
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
