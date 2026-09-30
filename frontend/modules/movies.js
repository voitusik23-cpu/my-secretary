// ===================================================
// Мой Секретарь — Модуль Фільмів та Серіалів
// frontend/modules/movies.js
// ===================================================

let _moviesWatchlistType = "all";

async function loadMoviesTab() {
  initMoviesSearch();
  loadMoviesWatchlist();
}

function initMoviesSearch() {
  const input = document.getElementById("movie-search-input");
  const btn = document.getElementById("movie-search-btn");
  const typeBtns = document.querySelectorAll(".movies-type-btn");

  if (btn && !btn._moviesInited) {
    btn._moviesInited = true;
    btn.addEventListener("click", () => searchMovie());
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchMovie();
    });
    typeBtns.forEach(b => {
      b.addEventListener("click", () => {
        typeBtns.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        _moviesWatchlistType = b.dataset.type;
        loadMoviesWatchlist();
      });
    });
  }
}

async function searchMovie() {
  const input = document.getElementById("movie-search-input");
  const title = input?.value?.trim();
  if (!title) return;

  const card = document.getElementById("movie-result-card");
  const inner = document.getElementById("movie-result-inner");
  card?.classList.remove("hidden");
  inner.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);">🔍 Шукаю «${escapeHtml(title)}»...</div>`;

  try {
    const res = await apiFetch("/api/movies/search", {
      method: "POST",
      body: JSON.stringify({ title })
    });

    if (!res?.data?.found) {
      inner.innerHTML = `<div class="empty-state"><span class="empty-icon">🎬</span><p>Фільм «${escapeHtml(title)}» не знайдено.<br><small>Спробуйте написати назву англійською.</small></p></div>`;
      return;
    }
    renderMovieResult(res.data);
  } catch (err) {
    inner.innerHTML = `<div class="empty-state"><p>Помилка пошуку: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderMovieResult(m) {
  const inner = document.getElementById("movie-result-inner");
  const genre = Array.isArray(m.genre) ? m.genre.join(", ") : (m.genre || "");
  const cast = Array.isArray(m.cast) ? m.cast.slice(0, 4).join(", ") : (m.cast || "");

  const netflixLinks = (m.watch_links || []).filter(w => w.platform && w.platform.includes("Netflix"));
  const otherOfficialLinks = (m.watch_links || []).filter(w => w.category === "official" && (!w.platform || !w.platform.includes("Netflix")));
  const onlineLinks = (m.watch_links || []).filter(w => w.category === "online");
  const torrentLinks = (m.watch_links || []).filter(w => w.category === "torrent");

  let watchLinksHtml = "";
  if (netflixLinks.length || otherOfficialLinks.length || onlineLinks.length || torrentLinks.length) {
    watchLinksHtml = `
      <div class="movie-links-section">
        ${(netflixLinks.length || otherOfficialLinks.length) ? `
          <div class="movie-links-group">
            <span class="movie-links-label">🔴 Стрімінг (Ваш Netflix акаунт & Megogo):</span>
            <div class="movie-links-grid">
              ${netflixLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-netflix">${escapeHtml(w.platform)}</a>`).join("")}
              ${otherOfficialLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-official">${escapeHtml(w.platform)}</a>`).join("")}
            </div>
          </div>` : ""}
        ${onlineLinks.length ? `
          <div class="movie-links-group">
            <span class="movie-links-label">🍿 Дивитись онлайн безкоштовно:</span>
            <div class="movie-links-grid">
              ${onlineLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-online">${escapeHtml(w.platform)}</a>`).join("")}
            </div>
          </div>` : ""}
        ${torrentLinks.length ? `
          <div class="movie-links-group">
            <span class="movie-links-label">🧲 Торренти (завантажити):</span>
            <div class="movie-links-grid">
              ${torrentLinks.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-torrent">${escapeHtml(w.platform)}</a>`).join("")}
            </div>
          </div>` : ""}
      </div>
    `;
  } else if (Array.isArray(m.where_to_watch)) {
    const links = m.where_to_watch.filter(w => w.available !== false).map(w =>
      `<a href="${escapeHtml(w.url || '#')}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-online">🎬 ${escapeHtml(w.platform)}</a>`
    ).join("");
    if (links) {
      watchLinksHtml = `<div class="movie-links-section"><div class="movie-links-grid">${links}</div></div>`;
    }
  }

  inner.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
        <div>
          <h3 style="margin:0;font-size:1.1rem;font-weight:700;">${escapeHtml(m.title)}</h3>
          ${m.original_title ? `<div style="color:var(--text-muted);font-size:0.84rem;">${escapeHtml(m.original_title)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;">
          ${m.rating_imdb ? `<span style="background:#f5c518;color:#000;font-weight:700;border-radius:6px;padding:3px 8px;font-size:0.88rem;">IMDb ${m.rating_imdb}</span>` : ""}
          ${m.rating_kinopoisk ? `<span style="background:#f60;color:#fff;font-weight:700;border-radius:6px;padding:3px 8px;font-size:0.88rem;">КП ${m.rating_kinopoisk}</span>` : ""}
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:0.82rem;">
        ${m.year ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">📅 ${m.year}</span>` : ""}
        ${m.duration_min ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">⏱ ${m.duration_min} хв</span>` : ""}
        ${m.country ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">🌍 ${escapeHtml(m.country)}</span>` : ""}
        ${genre ? `<span style="background:var(--bg-main);border:1px solid var(--border-color);border-radius:6px;padding:2px 8px;">🎭 ${escapeHtml(genre)}</span>` : ""}
      </div>

      ${m.director ? `<div style="font-size:0.88rem;color:var(--text-sub);"><strong>Режисер:</strong> ${escapeHtml(m.director)}</div>` : ""}
      ${cast ? `<div style="font-size:0.88rem;color:var(--text-sub);"><strong>У ролях:</strong> ${escapeHtml(cast)}</div>` : ""}

      ${m.description ? `<p style="margin:0;font-size:0.9rem;line-height:1.55;color:var(--text-main);">${escapeHtml(m.description)}</p>` : ""}

      ${m.review ? `<div style="background:rgba(6,182,212,0.08);border-left:3px solid var(--primary);border-radius:0 8px 8px 0;padding:8px 12px;font-size:0.87rem;color:var(--text-sub);font-style:italic;">${escapeHtml(m.review)}</div>` : ""}

      ${watchLinksHtml}

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
        ${m.trailer_search ? `<a href="${escapeHtml(m.trailer_search)}" target="_blank" rel="noopener noreferrer" style="background:var(--danger);color:#fff;border-radius:8px;padding:6px 14px;font-size:0.85rem;font-weight:600;text-decoration:none;">▶️ Трейлер YouTube</a>` : ""}
        <button onclick='addMovieToWatchlist(${JSON.stringify(m).replace(/'/g, "&#39;")})' style="background:var(--success);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;">📌 До списку перегляду</button>
      </div>
    </div>
  `;
}

window.quickSearchMovie = function(title) {
  const input = document.getElementById("movie-search-input");
  if (input) {
    input.value = title;
  }
  searchMovie();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.addMovieToWatchlist = async function(m) {
  try {
    await apiFetch("/api/movies/watchlist", {
      method: "POST",
      body: JSON.stringify({
        title: m.title,
        original_title: m.original_title || null,
        year: m.year || null,
        type: m.type || "movie",
        rating_imdb: m.rating_imdb || null,
        comment: m.review || null,
        url: m.trailer_search || null
      })
    });
    showToast(`✅ «${m.title}» додано до списку перегляду!`);
    loadMoviesWatchlist();
  } catch (err) {
    showToast(`Помилка: ${err.message}`);
  }
};

async function loadMoviesWatchlist() {
  const list = document.getElementById("movies-watchlist-list");
  if (!list) return;
  try {
    const typeParam = _moviesWatchlistType !== "all" ? `?type=${_moviesWatchlistType}` : "";
    const items = await apiFetch(`/api/movies/watchlist${typeParam}`);
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="empty-icon">🎬</span><p>Список перегляду порожній.<br><small>Знайдіть фільм вище та натисніть «📌 До списку перегляду».</small></p></div>`;
      return;
    }
    const statusIcon = { completed: "✅", to_watch: "👁️", in_progress: "⏳" };
    list.innerHTML = items.map(m => `
      <div class="item-card">
        <div class="item-content">
          <span class="item-title ${m.status === "completed" ? "completed" : ""}">${escapeHtml(m.title)}</span>
          ${m.comment ? `<span class="item-subtitle">${escapeHtml(m.comment)}</span>` : ""}
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;">
            <span class="item-badge badge-media">${m.type === "series" ? "📺 Серіал" : "🎬 Фільм"}</span>
            <a href="https://www.netflix.com/search?q=${encodeURIComponent(m.title)}" target="_blank" rel="noopener noreferrer" class="movie-link-btn movie-link-netflix" style="padding:2px 8px;font-size:0.78rem;border-radius:6px;text-decoration:none;">🔴 Netflix</a>
            <button onclick="quickSearchMovie('${escapeHtml(m.title).replace(/'/g, "\\'")}')" style="background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.3);color:var(--primary);border-radius:6px;padding:2px 8px;font-size:0.78rem;font-weight:600;cursor:pointer;">🔍 Де дивитись / Торренти</button>
          </div>
        </div>
        <div class="item-actions">
          <span style="font-size:1.1rem;" title="${m.status}">${statusIcon[m.status] || "👁️"}</span>
          <button class="custom-checkbox ${m.status === "completed" ? "checked" : ""}" onclick="toggleMedia(${m.id})" title="Позначити переглянутим">✓</button>
          <button class="delete-btn" onclick="deleteMovieWatchlist(${m.id})" title="Видалити">🗑️</button>
        </div>
      </div>`).join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><p>Помилка завантаження</p></div>`;
  }
}

window.deleteMovieWatchlist = async function(id) {
  try {
    await apiFetch(`/api/movies/watchlist/${id}`, { method: "DELETE" });
    loadMoviesWatchlist();
    showToast("Видалено зі списку перегляду");
  } catch (err) {
    showToast(`Помилка: ${err.message}`);
  }
};

window.loadMoviesTab = loadMoviesTab;
window.initMoviesSearch = initMoviesSearch;
window.searchMovie = searchMovie;
window.loadMoviesWatchlist = loadMoviesWatchlist;
