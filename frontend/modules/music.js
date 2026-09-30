// ===================================================
// Мой Секретарь — Оновлений Модуль Музики та Плеєра
// frontend/modules/music.js (v3.7.1)
// ===================================================

const musicState = {
  tracks: [],
  allTracks: [],
  queue: [],
  deletedTrackIds: new Set(),
  currentIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isShuffle: false,
  isRepeat: false,
  volume: 1.0,
  isMuted: false,
  playbackRate: 1.0,
  activePlaylist: "Всі треки",
  searchQuery: "",
  audio: null,
  consecutiveErrors: 0,
};

function formatTrackTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function updatePlayState(playing) {
  musicState.isPlaying = playing;
  const miniToggle = document.getElementById("mini-player-toggle-btn");
  const fsPlayBtn = document.getElementById("fs-play-btn");
  const miniBadge = document.getElementById("mini-player-play-badge");
  const fsArt = document.getElementById("fs-album-art");

  const icon = playing ? "⏸" : "▶";
  if (miniToggle) miniToggle.textContent = icon;
  if (fsPlayBtn) fsPlayBtn.textContent = icon;
  if (miniBadge) miniBadge.textContent = icon;

  if (fsArt) {
    if (playing) fsArt.classList.add("spinning");
    else fsArt.classList.remove("spinning");
  }

  // Highlight currently playing card in track list with live equalizer
  document.querySelectorAll(".music-track-card").forEach(c => {
    if (musicState.currentTrack && String(c.dataset.id) === String(musicState.currentTrack.id)) {
      if (playing) {
        c.classList.add("is-playing");
      } else {
        c.classList.remove("is-playing");
      }
    } else {
      c.classList.remove("is-playing");
    }
  });

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch (e) {}
  }
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator) || !track) return;
  try {
    const artwork = [
      { src: track.cover_url || "/static/icons/icon.svg", sizes: "96x96", type: "image/jpeg" },
      { src: track.cover_url || "/static/icons/icon.svg", sizes: "128x128", type: "image/jpeg" },
      { src: track.cover_url || "/static/icons/icon.svg", sizes: "256x256", type: "image/jpeg" },
      { src: track.cover_url || "/static/icons/icon.svg", sizes: "512x512", type: "image/jpeg" },
    ];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || "Мой Секретарь",
      album: track.album || track.playlist || "В авто 🚗",
      artwork: artwork,
    });
  } catch (err) {
    console.warn("MediaSession metadata error:", err);
  }
}

function stopPlayback() {
  const audio = musicState.audio || document.getElementById("global-music-audio");
  if (audio) {
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch (e) {}
  }
  musicState.isPlaying = false;
  musicState.currentTrack = null;
  musicState.currentIndex = -1;
  updatePlayState(false);
  const fsArt = document.getElementById("fs-album-art");
  if (fsArt) fsArt.classList.remove("spinning");
}

function resetPlayerUI() {
  stopPlayback();
  document.getElementById("music-floating-player")?.classList.add("hidden");
  document.getElementById("music-fullscreen-modal")?.classList.add("hidden");
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = "none"; } catch (e) {}
  }
}

function playTrack(track, queue = null) {
  if (!track) return;
  const strId = String(track.id);

  // If track was deleted, never play it!
  if (musicState.deletedTrackIds.has(strId)) {
    console.warn(`[Music] Refusing to play deleted track ${strId}`);
    playNextTrack();
    return;
  }

  if (!musicState.audio) {
    musicState.audio = document.getElementById("global-music-audio");
  }
  const audio = musicState.audio;
  if (!audio) return;

  // Filter queue against deleted tracks
  let baseQueue = queue && queue.length > 0 ? queue : (musicState.queue.length > 0 ? musicState.queue : musicState.allTracks);
  musicState.queue = (baseQueue || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));

  musicState.currentTrack = track;
  musicState.currentIndex = musicState.queue.findIndex(t => String(t.id) === strId);
  if (musicState.currentIndex === -1) {
    musicState.queue.push(track);
    musicState.currentIndex = musicState.queue.length - 1;
  }

  // Construct authenticated stream url with ?key= and timestamp cache buster
  const keyParam = state.secretKey ? `key=${encodeURIComponent(state.secretKey)}` : "";
  const tParam = `_t=${Date.now()}`;
  const queryStr = [keyParam, tParam].filter(Boolean).join("&");
  const streamUrl = `${state.serverUrl}/api/v1/music/stream/${track.id}?${queryStr}`;

  try {
    audio.pause();
  } catch (e) {}

  audio.src = streamUrl;
  audio.volume = musicState.volume;
  audio.muted = musicState.isMuted;
  audio.playbackRate = musicState.playbackRate;
  audio.load();

  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      musicState.consecutiveErrors = 0;
      updatePlayState(true);
    }).catch(err => {
      console.warn("Audio play promise catch:", err);
      updatePlayState(false);
    });
  }

  // Update Mini-Player UI
  const miniPlayer = document.getElementById("music-floating-player");
  if (miniPlayer) miniPlayer.classList.remove("hidden");

  const miniImg = document.getElementById("mini-player-img");
  const miniTitle = document.getElementById("mini-player-title");
  const miniArtist = document.getElementById("mini-player-artist");
  const miniFav = document.getElementById("mini-player-fav-btn");

  if (miniImg) miniImg.src = track.cover_url || "/static/icons/icon.svg";
  if (miniTitle) miniTitle.textContent = track.title;
  if (miniArtist) miniArtist.textContent = track.artist || "";
  if (miniFav) miniFav.textContent = track.is_favorite ? "❤️" : "🤍";

  // Update Fullscreen UI
  const fsImg = document.getElementById("fs-album-art");
  const fsTitle = document.getElementById("fs-track-title");
  const fsArtist = document.getElementById("fs-track-artist");
  const fsFav = document.getElementById("fs-fav-btn");
  const fsPl = document.getElementById("fs-player-playlist-name");

  if (fsImg) {
    fsImg.src = track.cover_url || "/static/icons/icon.svg";
    fsImg.classList.add("spinning");
  }
  if (fsTitle) fsTitle.textContent = track.title;
  if (fsArtist) fsArtist.textContent = track.artist || "";
  if (fsFav) {
    fsFav.textContent = track.is_favorite ? "❤️ В улюблених" : "🤍 В улюблені";
    fsFav.classList.toggle("active", !!track.is_favorite);
  }
  if (fsPl) fsPl.textContent = `🎵 Плейліст: ${track.playlist || musicState.activePlaylist}`;

  updateMediaSession(track);
  renderQueueDrawer();
  updatePlayState(true);
}

function playTrackById(trackId) {
  const strId = String(trackId);
  if (musicState.deletedTrackIds.has(strId)) return;

  const t = (musicState.tracks.find(x => String(x.id) === strId)) ||
            (musicState.allTracks.find(x => String(x.id) === strId));
  if (t) {
    const q = (musicState.tracks && musicState.tracks.length > 1) ? musicState.tracks : musicState.allTracks;
    playTrack(t, q);
  }
}

function playNextTrack() {
  // Purge any deleted tracks from queue
  musicState.queue = (musicState.queue || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));

  if (musicState.queue.length <= 1) {
    const freshAll = (musicState.allTracks || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));
    if (freshAll.length > 1) {
      musicState.queue = [...freshAll];
    }
  }

  if (!musicState.queue || musicState.queue.length === 0) {
    resetPlayerUI();
    return;
  }

  if (musicState.isRepeat && musicState.currentTrack) {
    if (musicState.audio) {
      musicState.audio.currentTime = 0;
      musicState.audio.play().then(() => updatePlayState(true)).catch(console.warn);
      return;
    }
  }

  let nextIdx;
  if (musicState.isShuffle && musicState.queue.length > 1) {
    do {
      nextIdx = Math.floor(Math.random() * musicState.queue.length);
    } while (nextIdx === musicState.currentIndex && musicState.queue.length > 1);
  } else {
    nextIdx = (musicState.currentIndex + 1) % musicState.queue.length;
  }

  const nextTrack = musicState.queue[nextIdx];
  if (nextTrack) {
    showToast(`▶ «${nextTrack.title}» - ${nextTrack.artist}`);
    playTrack(nextTrack, musicState.queue);
  }
}

function playPrevTrack() {
  musicState.queue = (musicState.queue || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));

  if (musicState.queue.length <= 1) {
    const freshAll = (musicState.allTracks || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));
    if (freshAll.length > 1) {
      musicState.queue = [...freshAll];
    }
  }

  if (!musicState.queue || musicState.queue.length === 0) {
    resetPlayerUI();
    return;
  }

  if (musicState.audio && musicState.audio.currentTime > 4) {
    musicState.audio.currentTime = 0;
    return;
  }

  const prevIdx = (musicState.currentIndex - 1 + musicState.queue.length) % musicState.queue.length;
  const prevTrack = musicState.queue[prevIdx];
  if (prevTrack) {
    playTrack(prevTrack, musicState.queue);
  }
}

function togglePlayPause() {
  const audio = musicState.audio || document.getElementById("global-music-audio");
  if (!audio) return;

  if (!audio.src || audio.src === window.location.href || !audio.getAttribute("src")) {
    const q = (musicState.queue.length > 0) ? musicState.queue : ((musicState.tracks.length > 0) ? musicState.tracks : musicState.allTracks);
    const valid = q.filter(t => !musicState.deletedTrackIds.has(String(t.id)));
    if (valid.length > 0) {
      playTrack(valid[0], valid);
    }
    return;
  }

  if (audio.paused) {
    audio.play().then(() => updatePlayState(true)).catch(console.warn);
  } else {
    audio.pause();
    updatePlayState(false);
  }
}

async function updatePlaylistCounts() {
  try {
    const playlists = await apiFetch("/api/v1/music/playlists");
    if (!playlists || !Array.isArray(playlists)) return;
    const countMap = {};
    playlists.forEach(p => { countMap[p.name] = p.tracks_count; });

    const pills = document.querySelectorAll("#music-playlists-bar .music-pl-pill");
    pills.forEach(pill => {
      const pl = pill.dataset.playlist;
      const cnt = countMap[pl] ?? (pl === "Всі треки" ? musicState.allTracks.length : 0);
      let icon = "🎵";
      if (pl === "Shazam") icon = "⚡";
      else if (pl === "Улюблені") icon = "❤️";
      else if (pl.includes("авто")) icon = "🚗";
      else if (pl.includes("Релакс")) icon = "🌙";

      pill.textContent = `${icon} ${pl} (${cnt})`;
    });
  } catch (e) {}
}

async function loadMusicTab(playlist = null) {
  if (playlist) {
    musicState.activePlaylist = playlist;
  }
  const targetPlaylist = musicState.activePlaylist;
  const listEl = document.getElementById("music-tracks-list");
  if (!listEl) return;

  try {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" style="animation:pulse-mic 1s infinite;">🎵</span>
        <p>Завантажую медіатеку...</p>
      </div>
    `;

    const allPromise = apiFetch("/api/v1/music/tracks");
    let url = "/api/v1/music/tracks";
    const params = new URLSearchParams();
    if (targetPlaylist === "Улюблені") {
      params.append("favorite_only", "true");
    } else if (targetPlaylist && targetPlaylist !== "Всі треки") {
      params.append("playlist", targetPlaylist);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const [filteredTracks, allTracks] = await Promise.all([
      apiFetch(url),
      allPromise
    ]);

    // Filter out any locally deleted IDs
    const cleanAll = (allTracks || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));
    const cleanFiltered = (filteredTracks || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));

    musicState.allTracks = cleanAll;
    musicState.tracks = cleanFiltered;

    // Synchronize queue with actual tracks from DB
    const validIds = new Set(cleanAll.map(t => String(t.id)));
    musicState.queue = (musicState.queue || []).filter(t => validIds.has(String(t.id)));
    if (musicState.queue.length === 0 && cleanAll.length > 0) {
      musicState.queue = [...cleanAll];
    }

    // If current track is no longer in valid tracks, stop audio immediately
    if (musicState.currentTrack && !validIds.has(String(musicState.currentTrack.id))) {
      console.warn("[Music] Current track is no longer valid, stopping playback");
      stopPlayback();
    }

    renderMusicTracks(musicState.tracks);
    renderQueueDrawer();
    updatePlaylistCounts();
  } catch (err) {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <p>Помилка завантаження треків: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderMusicTracks(tracks) {
  const listEl = document.getElementById("music-tracks-list");
  if (!listEl) return;

  const validTracks = (tracks || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));

  if (validTracks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎵</span>
        <p>У цій категорії немає треків.</p>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
          Скористайтесь кнопкою <strong>«📋 Вставити трек»</strong> або пошуком вище!
        </p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = validTracks.map(t => {
    const isCurrent = musicState.currentTrack && String(musicState.currentTrack.id) === String(t.id);
    const isPlaying = isCurrent && musicState.isPlaying;
    const durStr = t.duration ? formatTrackTime(t.duration) : "3:00";
    const coverUrl = t.cover_url || "/static/icons/icon.svg";

    const eqHtml = isPlaying ? `
      <span class="music-live-equalizer">
        <span></span><span></span><span></span>
      </span>
    ` : "";

    const cachedBadge = t.is_cached ? `<span class="music-pill-tag tag-cached" title="Збережено на сервері">💾 Офлайн</span>` : "";

    return `
      <div class="music-track-card ${isPlaying ? 'is-playing' : ''}" data-id="${t.id}">
        <div class="music-track-left" onclick="playTrackById(${t.id})">
          <div class="music-thumb-wrap">
            <img class="music-thumb-img" src="${coverUrl}" alt="${escapeHtml(t.title)}" loading="lazy" />
            <div class="music-thumb-play-overlay">${isPlaying ? '⏸' : '▶'}</div>
          </div>
          <div class="music-track-meta">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
              <span class="music-track-title">${escapeHtml(t.title)}</span>
              ${eqHtml}
            </div>
            <span class="music-track-artist">${escapeHtml(t.artist || "Невідомий виконавець")}</span>
            <div class="music-track-badges">
              <span class="music-pill-tag">⏱ ${durStr}</span>
              <span class="music-pill-tag">📂 ${escapeHtml(t.playlist || "Всі треки")}</span>
              ${cachedBadge}
            </div>
          </div>
        </div>
        <div class="music-track-right">
          <button class="music-icon-action" onclick="assignTrackToCar(${t.id}, event)" title="Додати в плейліст В авто">
            🚗
          </button>
          <button class="music-icon-action ${t.is_favorite ? 'fav-active' : ''}" onclick="toggleFavTrack(${t.id}, event)" title="${t.is_favorite ? 'Видалити з улюблених' : 'В улюблені'}">
            ${t.is_favorite ? '❤️' : '🤍'}
          </button>
          <button class="music-icon-action" onclick="deleteTrackItem(${t.id}, event)" title="Видалити трек із медіатеки">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderQueueDrawer() {
  const countEl = document.getElementById("fs-queue-count");
  const listEl = document.getElementById("fs-queue-list");
  if (!listEl) return;

  const q = (musicState.queue || []).filter(t => !musicState.deletedTrackIds.has(String(t.id)));
  if (countEl) countEl.textContent = q.length;

  if (q.length === 0) {
    listEl.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:20px;">Черга порожня</p>`;
    return;
  }

  listEl.innerHTML = q.map((t, idx) => {
    const isCurrent = musicState.currentTrack && String(musicState.currentTrack.id) === String(t.id);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${isCurrent ? 'rgba(6,182,212,0.22)' : 'rgba(255,255,255,0.06)'};border-radius:10px;margin-bottom:6px;cursor:pointer;border:1px solid ${isCurrent ? '#06b6d4' : 'transparent'};" onclick="playTrackById(${t.id});document.getElementById('fs-queue-drawer').classList.add('hidden');">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="font-size:0.8rem;color:${isCurrent ? '#06b6d4' : 'rgba(255,255,255,0.5)'};">${idx + 1}</span>
          <img src="${t.cover_url || '/static/icons/icon.svg'}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" />
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <div style="font-weight:${isCurrent ? '700' : '500'};color:#fff;font-size:0.85rem;">${escapeHtml(t.title)}</div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.6);">${escapeHtml(t.artist || '')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${t.duration ? formatTrackTime(t.duration) : ''}</span>
          <button type="button" class="music-icon-action" style="font-size:0.85rem;padding:2px 6px;" onclick="deleteTrackItem(${t.id}, event)" title="Видалити">🗑️</button>
        </div>
      </div>
    `;
  }).join("");
}

async function toggleFavTrack(trackId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  try {
    const res = await apiFetch(`/api/v1/music/tracks/${trackId}/favorite`, { method: "POST" });
    if (res) {
      const isFav = res.is_favorite;
      const t = musicState.tracks.find(x => x.id === trackId) || musicState.allTracks.find(x => x.id === trackId);
      if (t) t.is_favorite = isFav;
      if (musicState.currentTrack && musicState.currentTrack.id === trackId) {
        musicState.currentTrack.is_favorite = isFav;
        const miniFav = document.getElementById("mini-player-fav-btn");
        const fsFav = document.getElementById("fs-fav-btn");
        if (miniFav) miniFav.textContent = isFav ? "❤️" : "🤍";
        if (fsFav) {
          fsFav.textContent = isFav ? "❤️ В улюблених" : "🤍 В улюблені";
          fsFav.classList.toggle("active", isFav);
        }
      }
      renderMusicTracks(musicState.tracks);
      updatePlaylistCounts();
      showToast(isFav ? "❤️ Додано в улюблені!" : "🤍 Видалено з улюблених");
    }
  } catch (err) {
    showToast(`Помилка: ${err.message}`);
  }
}

async function assignTrackToCar(trackId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  try {
    await apiFetch(`/api/v1/music/tracks/${trackId}/playlist`, {
      method: "POST",
      body: JSON.stringify({ playlist: "В авто 🚗" })
    });
    showToast("🚗 Трек додано у плейліст 'В авто'!");
    loadMusicTab();
  } catch (err) {
    showToast(`Помилка: ${err.message}`);
  }
}

// -------------------------------------------------------------
// НАДІЙНЕ ВИДАЛЕННЯ ТРЕКУ З МИТТЄВОЮ ЗУПИНКОЮ ТА ОЧИЩЕННЯМ ЧЕРГИ
// -------------------------------------------------------------
async function deleteTrackItem(trackId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const strId = String(trackId);
  const track = (musicState.tracks || []).find(t => String(t.id) === strId) ||
                (musicState.allTracks || []).find(t => String(t.id) === strId) ||
                (musicState.currentTrack && String(musicState.currentTrack.id) === strId ? musicState.currentTrack : null);
  const trackTitle = track ? `«${track.title}»` : "цей трек";

  if (!confirm(`Видалити ${trackTitle} із медіатеки?`)) return;

  // 1. Позначаємо трек видаленим у поточній сесії (блокує будь-які повторні виклики)
  musicState.deletedTrackIds.add(strId);

  // 2. Перевіряємо, чи цей трек зараз грає або завантажений
  const isCurrent = musicState.currentTrack && String(musicState.currentTrack.id) === strId;

  // 3. Миттєво видаляємо трек з усіх масивів у пам'яті
  musicState.tracks = (musicState.tracks || []).filter(t => String(t.id) !== strId);
  musicState.allTracks = (musicState.allTracks || []).filter(t => String(t.id) !== strId);
  musicState.queue = (musicState.queue || []).filter(t => String(t.id) !== strId);

  // 4. Якщо грає видалений трек — миттєво глушимо аудіо та перемикаємо на наступний
  if (isCurrent) {
    stopPlayback();
    if (musicState.queue.length > 0) {
      const nextTrack = musicState.queue[0];
      showToast(`🗑️ ${trackTitle} видалено. Грає: «${nextTrack.title}»`);
      playTrack(nextTrack, musicState.queue);
    } else {
      showToast(`🗑️ ${trackTitle} видалено. Медіатека порожня.`);
      resetPlayerUI();
    }
  } else {
    showToast(`🗑️ ${trackTitle} видалено`);
  }

  // 5. Миттєво оновлюємо список та чергу без затримок
  renderMusicTracks(musicState.tracks);
  renderQueueDrawer();
  updatePlaylistCounts();

  // 6. Надсилаємо запит на сервер для видалення з БД та видалення аудіофайлу з диска
  try {
    await apiFetch(`/api/v1/music/tracks/${trackId}`, { method: "DELETE" });
  } catch (err) {
    console.error("Failed to delete track from server:", err);
    showToast(`Помилка видалення на сервері: ${err.message}`);
  }
}

async function searchMusicOnline(query) {
  const resBox = document.getElementById("music-search-results");
  const resList = document.getElementById("music-search-results-list");
  if (!resBox || !resList) return;

  resBox.classList.remove("hidden");
  resList.innerHTML = `
    <div style="text-align:center;padding:14px;color:var(--text-muted);font-size:0.85rem;">
      🔍 Пошук в Apple Music та YouTube...
    </div>
  `;

  try {
    const data = await apiFetch("/api/v1/music/search", {
      method: "POST",
      body: JSON.stringify({ query: query.trim(), limit: 6 })
    });

    const results = data?.results || [];
    if (results.length === 0) {
      resList.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.85rem;">Нічого не знайдено за запитом «${escapeHtml(query)}»</div>`;
      return;
    }

    resList.innerHTML = results.map(item => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg-input);border-radius:10px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
          <img src="${item.cover_url || '/static/icons/icon.svg'}" style="width:42px;height:42px;border-radius:8px;object-fit:cover;" />
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <div style="font-weight:700;font-size:0.88rem;color:var(--text-main);">${escapeHtml(item.title)}</div>
            <div style="font-size:0.76rem;color:var(--text-muted);">${escapeHtml(item.artist)}</div>
          </div>
        </div>
        <button class="action-btn-sm" style="margin-left:8px;white-space:nowrap;" onclick="addSearchedTrack(${JSON.stringify(item).replace(/"/g, '&quot;')})">
          + Додати
        </button>
      </div>
    `).join("");
  } catch (err) {
    resList.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;padding:8px;">Помилка пошуку: ${escapeHtml(err.message)}</div>`;
  }
}

async function addSearchedTrack(item) {
  try {
    const payload = {
      title: item.title,
      artist: item.artist,
      album: item.album || "",
      duration: item.duration || 0,
      cover_url: item.cover_url,
      source: item.source || "search",
      playlist: musicState.activePlaylist === "Всі треки" ? "В авто 🚗" : musicState.activePlaylist
    };

    const saved = await apiFetch("/api/v1/music/tracks", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    showToast(`✅ Додано трек: «${item.title}»`);
    document.getElementById("music-search-results")?.classList.add("hidden");
    const input = document.getElementById("music-search-input");
    if (input) input.value = "";

    await loadMusicTab();
    if (saved && saved.id) {
      playTrackById(saved.id);
    }
  } catch (err) {
    showToast(`Помилка додавання: ${err.message}`);
  }
}

async function quickPasteShazamTrack(targetPlaylist = "В авто 🚗") {
  let clipboardText = "";
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      clipboardText = await navigator.clipboard.readText();
    }
  } catch (clipErr) {
    console.warn("Clipboard access:", clipErr);
  }

  clipboardText = (clipboardText || "").trim();

  if (clipboardText && (clipboardText.includes("shazam") || clipboardText.includes("http") || clipboardText.length > 3)) {
    showToast("⚡ Розпізнаю посилання із буфера обміну...");
    try {
      const resp = await apiFetch("/api/v1/music/shazam", {
        method: "POST",
        body: JSON.stringify({
          url_or_text: clipboardText,
          playlist: targetPlaylist
        })
      });

      if (resp?.track) {
        showToast(`⚡ Додано з Shazam: «${resp.track.title}» - ${resp.track.artist}!`);
        await loadMusicTab();
        if (resp.track.id) {
          playTrackById(resp.track.id);
        }
        return;
      }
    } catch (err) {
      showToast(`Помилка імпорту: ${err.message}`);
    }
  }

  importFromShazamModal(clipboardText);
}

function initMusicPlayer() {
  const audio = document.getElementById("global-music-audio");
  musicState.audio = audio;

  // Audio Event Listeners
  if (audio) {
    audio.addEventListener("timeupdate", () => {
      const cur = audio.currentTime || 0;
      const dur = audio.duration || 0;
      const pct = dur > 0 ? (cur / dur) * 100 : 0;

      // Mini-Player progress
      const miniFill = document.getElementById("mini-player-progress-fill");
      if (miniFill) miniFill.style.width = `${pct}%`;

      // Fullscreen scrubber
      const slider = document.getElementById("fs-time-slider");
      const curLabel = document.getElementById("fs-time-current");
      const durLabel = document.getElementById("fs-time-duration");

      if (slider && !slider.matches(":active")) slider.value = pct;
      if (curLabel) curLabel.textContent = formatTrackTime(cur);
      if (durLabel) durLabel.textContent = formatTrackTime(dur);
    });

    audio.addEventListener("ended", () => {
      console.log("[Music] Track ended naturally, continuous auto-next...");
      playNextTrack();
    });

    audio.addEventListener("error", (e) => {
      if (!audio.src || audio.src === window.location.href || !audio.getAttribute("src")) return;
      console.warn("[Music] Stream error:", e);
      musicState.consecutiveErrors = (musicState.consecutiveErrors || 0) + 1;
      if (musicState.consecutiveErrors > 4) {
        showToast("⚠️ Помилка завантаження кількох треків. Плеєр зупинено.");
        stopPlayback();
        musicState.consecutiveErrors = 0;
        return;
      }

      // If current track failed, drop it from queue to prevent loop
      if (musicState.currentTrack) {
        const badId = String(musicState.currentTrack.id);
        musicState.queue = musicState.queue.filter(t => String(t.id) !== badId);
      }

      showToast("⚠️ Помилка аудіопотоку, перемикаю на наступний трек...");
      setTimeout(() => {
        playNextTrack();
      }, 800);
    });

    audio.addEventListener("play", () => updatePlayState(true));
    audio.addEventListener("pause", () => updatePlayState(false));
  }

  // MediaSession Action Handlers for CarPlay & iOS Lock Screen
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", () => togglePlayPause());
      navigator.mediaSession.setActionHandler("pause", () => togglePlayPause());
      navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
      navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null && audio) {
          audio.currentTime = details.seekTime;
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
      });
    } catch (err) {
      console.warn("MediaSession action handler registration:", err);
    }
  }

  // Mini-Player controls
  document.getElementById("mini-player-toggle-btn")?.addEventListener("click", togglePlayPause);
  document.getElementById("mini-player-prev-btn")?.addEventListener("click", playPrevTrack);
  document.getElementById("mini-player-next-btn")?.addEventListener("click", playNextTrack);
  document.getElementById("mini-player-fav-btn")?.addEventListener("click", () => {
    if (musicState.currentTrack) toggleFavTrack(musicState.currentTrack.id);
  });

  const expandToFs = () => {
    document.getElementById("music-fullscreen-modal")?.classList.remove("hidden");
  };
  document.getElementById("mini-player-expand-btn")?.addEventListener("click", expandToFs);
  document.getElementById("mini-player-info-area")?.addEventListener("click", expandToFs);
  document.getElementById("mini-player-cover-btn")?.addEventListener("click", expandToFs);

  // Fullscreen controls
  document.getElementById("fs-player-collapse-btn")?.addEventListener("click", () => {
    document.getElementById("music-fullscreen-modal")?.classList.add("hidden");
  });
  document.getElementById("fs-play-btn")?.addEventListener("click", togglePlayPause);
  document.getElementById("fs-prev-btn")?.addEventListener("click", playPrevTrack);
  document.getElementById("fs-next-btn")?.addEventListener("click", playNextTrack);

  const shuffleBtn = document.getElementById("fs-shuffle-btn");
  shuffleBtn?.addEventListener("click", () => {
    musicState.isShuffle = !musicState.isShuffle;
    shuffleBtn.classList.toggle("active", musicState.isShuffle);
    showToast(musicState.isShuffle ? "🔀 Випадковий порядок: УВІМК" : "🔀 Випадковий порядок: ВИМК");
  });

  const repeatBtn = document.getElementById("fs-repeat-btn");
  repeatBtn?.addEventListener("click", () => {
    musicState.isRepeat = !musicState.isRepeat;
    repeatBtn.classList.toggle("active", musicState.isRepeat);
    showToast(musicState.isRepeat ? "🔁 Повтор треку: УВІМК" : "🔁 Повтор треку: ВИМК");
  });

  document.getElementById("fs-fav-btn")?.addEventListener("click", () => {
    if (musicState.currentTrack) toggleFavTrack(musicState.currentTrack.id);
  });

  document.getElementById("fs-car-btn")?.addEventListener("click", async () => {
    if (!musicState.currentTrack) return;
    await assignTrackToCar(musicState.currentTrack.id);
  });

  // Direct Delete from Fullscreen / Car Mode
  document.getElementById("fs-delete-btn")?.addEventListener("click", () => {
    if (musicState.currentTrack) {
      deleteTrackItem(musicState.currentTrack.id);
    }
  });

  // Volume & Mute in Fullscreen
  const volSlider = document.getElementById("fs-volume-slider");
  const muteBtn = document.getElementById("fs-mute-btn");
  volSlider?.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    musicState.volume = v;
    if (audio) {
      audio.volume = v;
      audio.muted = (v === 0);
    }
    if (muteBtn) muteBtn.textContent = v === 0 ? "🔇" : (v < 0.5 ? "🔉" : "🔊");
  });

  muteBtn?.addEventListener("click", () => {
    if (!audio) return;
    musicState.isMuted = !musicState.isMuted;
    audio.muted = musicState.isMuted;
    muteBtn.textContent = musicState.isMuted ? "🔇" : (musicState.volume < 0.5 ? "🔉" : "🔊");
  });

  // Speed changer in Fullscreen
  const speedBtn = document.getElementById("fs-speed-btn");
  speedBtn?.addEventListener("click", () => {
    const speeds = [1.0, 1.25, 1.5];
    const curIdx = speeds.indexOf(musicState.playbackRate);
    const nextSpeed = speeds[(curIdx + 1) % speeds.length];
    musicState.playbackRate = nextSpeed;
    if (audio) audio.playbackRate = nextSpeed;
    if (speedBtn) speedBtn.textContent = `${nextSpeed}x`;
    showToast(`⚡ Швидкість відтворення: ${nextSpeed}x`);
  });

  // Scrubber dragging
  const timeSlider = document.getElementById("fs-time-slider");
  timeSlider?.addEventListener("input", (e) => {
    if (audio && audio.duration) {
      const pct = parseFloat(e.target.value);
      audio.currentTime = (pct / 100) * audio.duration;
    }
  });

  // Queue drawer
  const queueDrawer = document.getElementById("fs-queue-drawer");
  document.getElementById("fs-player-queue-btn")?.addEventListener("click", () => {
    queueDrawer?.classList.toggle("hidden");
    renderQueueDrawer();
  });
  document.getElementById("fs-queue-close-btn")?.addEventListener("click", () => {
    queueDrawer?.classList.add("hidden");
  });

  // Continuous Car Banner Buttons
  document.getElementById("music-play-all-btn")?.addEventListener("click", () => {
    const q = (musicState.tracks && musicState.tracks.length > 0) ? musicState.tracks : musicState.allTracks;
    const cleanQ = q.filter(t => !musicState.deletedTrackIds.has(String(t.id)));
    if (cleanQ.length > 0) {
      musicState.queue = [...cleanQ];
      playTrack(musicState.queue[0], musicState.queue);
      showToast("▶ Запущено відтворення всіх треків підряд!");
    } else {
      showToast("Немає треків у списку");
    }
  });

  document.getElementById("music-shuffle-all-btn")?.addEventListener("click", () => {
    const q = (musicState.tracks && musicState.tracks.length > 0) ? musicState.tracks : musicState.allTracks;
    const cleanQ = q.filter(t => !musicState.deletedTrackIds.has(String(t.id)));
    if (cleanQ.length > 0) {
      musicState.queue = [...cleanQ].sort(() => Math.random() - 0.5);
      musicState.isShuffle = true;
      document.getElementById("fs-shuffle-btn")?.classList.add("active");
      playTrack(musicState.queue[0], musicState.queue);
      showToast("🔀 Плейліст перемішано та запущено!");
    }
  });

  // Playlists Pills Bar
  const pills = document.querySelectorAll("#music-playlists-bar .music-pl-pill");
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const pl = pill.dataset.playlist;
      loadMusicTab(pl);
    });
  });

  // Instant local filtering + online search on Enter
  const searchInput = document.getElementById("music-search-input");
  const searchBtn = document.getElementById("music-search-btn");

  searchInput?.addEventListener("input", (e) => {
    const val = (e.target.value || "").toLowerCase().trim();
    if (!val) {
      renderMusicTracks(musicState.tracks);
      return;
    }
    const filtered = (musicState.tracks || []).filter(t =>
      (t.title && t.title.toLowerCase().includes(val)) ||
      (t.artist && t.artist.toLowerCase().includes(val))
    );
    renderMusicTracks(filtered);
  });

  const runSearch = () => {
    const val = searchInput?.value?.trim();
    if (!val) return;
    if (val.includes("shazam.com") || val.toLowerCase().includes("shazam")) {
      importFromShazamModal(val);
    } else {
      searchMusicOnline(val);
    }
  };

  searchBtn?.addEventListener("click", runSearch);
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });

  document.getElementById("music-search-close-btn")?.addEventListener("click", () => {
    document.getElementById("music-search-results")?.classList.add("hidden");
  });

  // Quick 1-tap clipboard paste button from header
  document.getElementById("quick-paste-shazam-btn")?.addEventListener("click", () => {
    quickPasteShazamTrack(musicState.activePlaylist === "Всі треки" ? "В авто 🚗" : musicState.activePlaylist);
  });

  // Shazam Import Modal
  const shazamModal = document.getElementById("shazam-modal");
  const shazamInput = document.getElementById("shazam-input-text");
  const shazamTargetPl = document.getElementById("shazam-target-playlist");
  const shazamSubmitBtn = document.getElementById("shazam-submit-btn");
  const shazamFeedback = document.getElementById("shazam-status-feedback");
  const pasteClipBtn = document.getElementById("shazam-paste-clipboard-btn");

  pasteClipBtn?.addEventListener("click", async () => {
    let txt = "";
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        txt = await navigator.clipboard.readText();
      }
    } catch (e) {}
    if (txt && shazamInput) {
      shazamInput.value = txt.trim();
      shazamSubmitBtn?.click();
    } else {
      shazamInput?.focus();
      showToast("Вставте посилання у поле вводу");
    }
  });

  const openShazamModal = (initialText = "") => {
    if (shazamInput) shazamInput.value = initialText;
    if (shazamFeedback) shazamFeedback.textContent = "";
    shazamModal?.classList.remove("hidden");
    shazamInput?.focus();
  };

  document.getElementById("shazam-import-btn")?.addEventListener("click", () => openShazamModal());
  document.getElementById("shazam-modal-close-btn")?.addEventListener("click", () => {
    shazamModal?.classList.add("hidden");
  });

  shazamSubmitBtn?.addEventListener("click", async () => {
    const txt = shazamInput?.value?.trim();
    if (!txt) {
      if (shazamFeedback) shazamFeedback.textContent = "Введіть або вставте посилання з Shazam!";
      return;
    }

    try {
      shazamSubmitBtn.disabled = true;
      shazamSubmitBtn.textContent = "⚡ Розпізнаю та додаю...";

      const targetPl = shazamTargetPl?.value || "В авто 🚗";
      const resp = await apiFetch("/api/v1/music/shazam", {
        method: "POST",
        body: JSON.stringify({
          url_or_text: txt,
          playlist: targetPl
        })
      });

      if (resp?.track) {
        showToast(`⚡ Трек «${resp.track.title}» додано з Shazam!`);
        shazamModal?.classList.add("hidden");
        await loadMusicTab();
        if (resp.track.id) {
          playTrackById(resp.track.id);
        }
      }
    } catch (err) {
      if (shazamFeedback) shazamFeedback.textContent = `Помилка: ${err.message}`;
    } finally {
      shazamSubmitBtn.disabled = false;
      shazamSubmitBtn.textContent = "⚡ Імпортувати та додати в плеєр";
    }
  });

  // + Add Track Button
  document.getElementById("add-music-track-btn")?.addEventListener("click", () => {
    openShazamModal();
  });
}

function importFromShazamModal(initialText) {
  const shazamModal = document.getElementById("shazam-modal");
  const shazamInput = document.getElementById("shazam-input-text");
  if (shazamInput) shazamInput.value = initialText;
  shazamModal?.classList.remove("hidden");
  shazamInput?.focus();
}

window.playTrackById = playTrackById;
window.toggleFavTrack = toggleFavTrack;
window.assignTrackToCar = assignTrackToCar;
window.deleteTrackItem = deleteTrackItem;
window.addSearchedTrack = addSearchedTrack;
window.quickPasteShazamTrack = quickPasteShazamTrack;
window.loadMusicTab = loadMusicTab;
window.initMusicPlayer = initMusicPlayer;
window.musicState = musicState;
