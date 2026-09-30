// ===================================================
// Мой Секретарь — Модуль Музики та Плеєра
// frontend/modules/music.js
// ===================================================
const musicState = {
  tracks: [],
  allTracks: [],
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isShuffle: false,
  isRepeat: false,
  activePlaylist: "Всі треки",
  audio: null,
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

  const icon = playing ? "⏸" : "▶";
  if (miniToggle) miniToggle.textContent = icon;
  if (fsPlayBtn) fsPlayBtn.textContent = icon;
  if (miniBadge) miniBadge.textContent = icon;

  // Highlight currently playing card in list
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
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || "Невідомий виконавець",
      album: track.album || track.playlist || "Мой Секретарь",
      artwork: [
        { src: track.cover_url || "/static/icons/icon.svg", sizes: "96x96", type: "image/jpeg" },
        { src: track.cover_url || "/static/icons/icon.svg", sizes: "128x128", type: "image/jpeg" },
        { src: track.cover_url || "/static/icons/icon.svg", sizes: "192x192", type: "image/jpeg" },
        { src: track.cover_url || "/static/icons/icon.svg", sizes: "256x256", type: "image/jpeg" },
        { src: track.cover_url || "/static/icons/icon.svg", sizes: "512x512", type: "image/jpeg" },
      ],
    });
  } catch (err) {
    console.warn("MediaSession metadata error:", err);
  }
}

function playTrack(track, queue = null) {
  if (!track) return;
  if (!musicState.audio) {
    musicState.audio = document.getElementById("global-music-audio");
  }
  const audio = musicState.audio;
  if (!audio) return;

  if (queue && queue.length > 0) {
    musicState.queue = queue;
  } else if (musicState.allTracks && musicState.allTracks.length > 0) {
    musicState.queue = musicState.allTracks;
  } else {
    musicState.queue = musicState.tracks;
  }

  musicState.currentTrack = track;
  musicState.currentIndex = musicState.queue.findIndex(t => String(t.id) === String(track.id));
  if (musicState.currentIndex === -1) {
    musicState.queue.push(track);
    musicState.currentIndex = musicState.queue.length - 1;
  }

  // Construct authenticated stream url with ?key=
  const keyParam = state.secretKey ? `?key=${encodeURIComponent(state.secretKey)}` : "";
  const streamUrl = `${state.serverUrl}/api/v1/music/stream/${track.id}${keyParam}`;

  try {
    audio.pause();
  } catch (e) {}

  audio.src = streamUrl;
  audio.load();

  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      updatePlayState(true);
    }).catch(err => {
      console.warn("Audio autoplay blocked or failed:", err);
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

  if (fsImg) fsImg.src = track.cover_url || "/static/icons/icon.svg";
  if (fsTitle) fsTitle.textContent = track.title;
  if (fsArtist) fsArtist.textContent = track.artist || "";
  if (fsFav) {
    fsFav.textContent = track.is_favorite ? "❤️ В улюблених" : "🤍 В улюблені";
    fsFav.classList.toggle("active", !!track.is_favorite);
  }
  if (fsPl) fsPl.textContent = `🎵 Плейліст: ${track.playlist || musicState.activePlaylist}`;

  updateMediaSession(track);
  renderQueueDrawer();
}

function playTrackById(trackId) {
  const t = (musicState.tracks.find(x => String(x.id) === String(trackId))) ||
            (musicState.allTracks.find(x => String(x.id) === String(trackId)));
  if (t) {
    const q = (musicState.tracks && musicState.tracks.length > 1) ? musicState.tracks : musicState.allTracks;
    playTrack(t, q);
  }
}

function playNextTrack() {
  // If current queue has only 1 track, expand to allTracks so we NEVER get stuck on 1 song!
  if (!musicState.queue || musicState.queue.length <= 1) {
    if (musicState.allTracks && musicState.allTracks.length > 1) {
      musicState.queue = [...musicState.allTracks];
      if (musicState.currentTrack) {
        musicState.currentIndex = musicState.queue.findIndex(t => String(t.id) === String(musicState.currentTrack.id));
      }
    }
  }

  if (!musicState.queue || musicState.queue.length === 0) return;

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
    } while (nextIdx === musicState.currentIndex);
  } else {
    nextIdx = (musicState.currentIndex + 1) % musicState.queue.length;
  }

  const nextTrack = musicState.queue[nextIdx];
  if (nextTrack) {
    showToast(`▶ Грає: «${nextTrack.title}» - ${nextTrack.artist}`);
    playTrack(nextTrack, musicState.queue);
  }
}

function playPrevTrack() {
  if (!musicState.queue || musicState.queue.length <= 1) {
    if (musicState.allTracks && musicState.allTracks.length > 1) {
      musicState.queue = [...musicState.allTracks];
      if (musicState.currentTrack) {
        musicState.currentIndex = musicState.queue.findIndex(t => String(t.id) === String(musicState.currentTrack.id));
      }
    }
  }

  if (!musicState.queue || musicState.queue.length === 0) return;

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
  const audio = musicState.audio;
  if (!audio) return;

  if (!audio.src || audio.src === window.location.href) {
    if (musicState.queue.length > 0) {
      playTrack(musicState.queue[0]);
    } else if (musicState.allTracks.length > 0) {
      playTrack(musicState.allTracks[0]);
    } else if (musicState.tracks.length > 0) {
      playTrack(musicState.tracks[0]);
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
        <p>Завантажую треки...</p>
      </div>
    `;

    // 1. Fetch filtered tracks and all tracks concurrently
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

    musicState.allTracks = allTracks || [];
    musicState.tracks = filteredTracks || [];

    // Continuous queue: if filtered has few tracks, keep allTracks in queue
    if (!musicState.queue || musicState.queue.length <= 1) {
      musicState.queue = [...musicState.allTracks];
    }

    renderMusicTracks(musicState.tracks);
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

  if (!tracks || tracks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎵</span>
        <p>У цій категорії ще немає треків.</p>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
          Скористайтесь кнопкою <strong>«📋 Вставити трек»</strong> або рядком пошуку вище!
        </p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = tracks.map(t => {
    const isCurrent = musicState.currentTrack && String(musicState.currentTrack.id) === String(t.id);
    const isPlaying = isCurrent && musicState.isPlaying;
    const durStr = t.duration ? formatTrackTime(t.duration) : "3:00";
    const coverUrl = t.cover_url || "/static/icons/icon.svg";

    return `
      <div class="music-track-card ${isPlaying ? 'is-playing' : ''}" data-id="${t.id}">
        <div class="music-track-left" onclick="playTrackById(${t.id})">
          <div class="music-thumb-wrap">
            <img class="music-thumb-img" src="${coverUrl}" alt="${escapeHtml(t.title)}" loading="lazy" />
            <div class="music-thumb-play-overlay">${isPlaying ? '⏸' : '▶'}</div>
          </div>
          <div class="music-track-meta">
            <span class="music-track-title">${escapeHtml(t.title)}</span>
            <span class="music-track-artist">${escapeHtml(t.artist || "Невідомий виконавець")}</span>
            <div class="music-track-badges">
              <span class="music-pill-tag">⏱ ${durStr}</span>
              <span class="music-pill-tag">📂 ${escapeHtml(t.playlist || "Всі треки")}</span>
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
          <button class="music-icon-action" onclick="deleteTrackItem(${t.id}, event)" title="Видалити трек">
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

  const q = musicState.queue || [];
  if (countEl) countEl.textContent = q.length;

  if (q.length === 0) {
    listEl.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:20px;">Черга порожня</p>`;
    return;
  }

  listEl.innerHTML = q.map((t, idx) => {
    const isCurrent = musicState.currentTrack && String(musicState.currentTrack.id) === String(t.id);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${isCurrent ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:10px;margin-bottom:6px;cursor:pointer;" onclick="playTrackById(${t.id});document.getElementById('fs-queue-drawer').classList.add('hidden');">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="font-size:0.8rem;color:${isCurrent ? '#06b6d4' : 'rgba(255,255,255,0.5)'};">${idx + 1}</span>
          <img src="${t.cover_url || '/static/icons/icon.svg'}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" />
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <div style="font-weight:${isCurrent ? '700' : '500'};color:#fff;font-size:0.85rem;">${escapeHtml(t.title)}</div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.6);">${escapeHtml(t.artist || '')}</div>
          </div>
        </div>
        <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">${t.duration ? formatTrackTime(t.duration) : ''}</span>
      </div>
    `;
  }).join("");
}

async function toggleFavTrack(trackId, event) {
  if (event) event.stopPropagation();
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
  if (event) event.stopPropagation();
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

async function deleteTrackItem(trackId, event) {
  if (event) event.stopPropagation();
  if (!confirm("Видалити цей трек із медіатеки?")) return;
  try {
    await apiFetch(`/api/v1/music/tracks/${trackId}`, { method: "DELETE" });
    showToast("🗑️ Трек видалено");
    loadMusicTab();
  } catch (err) {
    showToast(`Помилка видалення: ${err.message}`);
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
      console.warn("[Music] Stream error, auto-skipping to next track in 1.2s...", e);
      setTimeout(() => {
        playNextTrack();
      }, 1200);
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
    if (q.length > 0) {
      musicState.queue = [...q];
      playTrack(musicState.queue[0], musicState.queue);
      showToast("▶ Запущено відтворення всіх треків підряд!");
    } else {
      showToast("Немає треків у списку");
    }
  });

  document.getElementById("music-shuffle-all-btn")?.addEventListener("click", () => {
    const q = (musicState.tracks && musicState.tracks.length > 0) ? musicState.tracks : musicState.allTracks;
    if (q.length > 0) {
      musicState.queue = [...q].sort(() => Math.random() - 0.5);
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

  // Search input & button
  const searchInput = document.getElementById("music-search-input");
  const searchBtn = document.getElementById("music-search-btn");
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
