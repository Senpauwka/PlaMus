
const audio = document.getElementById('audio');
const playButton = document.getElementById('play');
const progress = document.getElementById('progress');

let tracks = [];
let currentTrack = -1;
let shuffled = false;
let repeated = false;
let loadToken = 0;

// =====================================
// Telegram Mini App
// =====================================

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  const profile = document.getElementById('profile');

  if (user && profile) {
    profile.textContent = user.username
      ? '@' + user.username
      : user.first_name || 'YOUR SPACE';
  }

  // Поддержка цветовой темы Telegram
  function applyTelegramTheme() {
    const theme = tg.themeParams || {};
    const root = document.documentElement;

    if (theme.bg_color) {
      root.style.setProperty('--tg-bg-color', theme.bg_color);
    }

    if (theme.text_color) {
      root.style.setProperty('--tg-text-color', theme.text_color);
    }

    if (theme.hint_color) {
      root.style.setProperty('--tg-hint-color', theme.hint_color);
    }

    if (theme.button_color) {
      root.style.setProperty('--tg-button-color', theme.button_color);
    }

    if (theme.button_text_color) {
      root.style.setProperty('--tg-button-text-color', theme.button_text_color);
    }
  }

  applyTelegramTheme();
  tg.onEvent('themeChanged', applyTelegramTheme);

  // Системные цвета Telegram
  try {
    tg.setHeaderColor('#0b0b10');
    tg.setBackgroundColor('#0b0b10');
  } catch (error) {
    console.warn('Ошибка настройки Telegram:', error);
  }
}

// =====================================
// Навигация
// =====================================

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => openPage(tab.dataset.page));
});

document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => openPage(button.dataset.open));
});

function openPage(page) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === page);
  });

  document.querySelectorAll('.page').forEach(section => {
    section.classList.toggle('active', section.id === page);
  });
}

// =====================================
// PlaMus: музыкальная база данных
// =====================================

const AUDIO_DB_NAME = 'plamus-audio-library';
const AUDIO_STORE = 'tracks';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAudioFile(file, name, artist) {
  const db = await openAudioDB();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, 'readwrite');
      const request = transaction.objectStore(AUDIO_STORE).add({
        name,
        artist,
        file
      });

      let savedId;

      request.onsuccess = () => {
        savedId = request.result;
      };

      transaction.oncomplete = () => resolve(savedId);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function getSavedAudio() {
  const db = await openAudioDB();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, 'readonly');
      const request = transaction.objectStore(AUDIO_STORE).getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function deleteAudioFile(id) {
  if (id === undefined || id === null) return;

  const db = await openAudioDB();

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(AUDIO_STORE, 'readwrite');

      transaction.objectStore(AUDIO_STORE).delete(id);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

// Восстановление библиотеки
const libraryReady = (async () => {
  try {
    const savedTracks = await getSavedAudio();

    savedTracks.forEach(saved => {
      tracks.push({
        id: saved.id,
        name: saved.name,
        artist: saved.artist,
        url: URL.createObjectURL(saved.file),
        file: saved.file
      });
    });

    renderLibrary();
  } catch (error) {
    console.error('Не удалось восстановить библиотеку:', error);
  }
})();

// =====================================
// Загрузка музыки
// =====================================

const musicUpload = document.getElementById('music-upload');

document.getElementById('pick-track').addEventListener('click', () => {
  musicUpload.click();
});

document.getElementById('add-music').addEventListener('click', () => {
  musicUpload.click();
});

musicUpload.addEventListener('change', async event => {
  const files = Array.from(event.target.files || []);

  await libraryReady;

  for (const file of files) {
    if (!file.type.startsWith('audio/')) continue;

    const track = {
      name: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Локальный файл',
      url: URL.createObjectURL(file),
      file
    };

    tracks.push(track);

    try {
      track.id = await saveAudioFile(
        file,
        track.name,
        track.artist
      );
    } catch (error) {
      console.warn('Не удалось сохранить аудиофайл:', error);
    }
  }

  renderLibrary();

  if (currentTrack === -1 && tracks.length) {
    loadTrack(0);
  }

  event.target.value = '';
});

// =====================================
// Player
// =====================================

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return `${min}:${String(sec).padStart(2, '0')}`;
}

function updateTime() {
  const current = Number.isFinite(audio.currentTime)
    ? audio.currentTime
    : 0;

  const duration = Number.isFinite(audio.duration)
    ? audio.duration
    : 0;

  document.getElementById('current-time').textContent =
    formatTime(current);

  document.getElementById('duration').textContent =
    formatTime(duration);

  progress.value = duration > 0
    ? (current / duration) * 100
    : 0;
}

function loadTrack(index, autoplay = false) {
  if (!tracks.length) return;

  currentTrack = (index + tracks.length) % tracks.length;

  const track = tracks[currentTrack];
  const token = ++loadToken;

  audio.pause();
  audio.removeAttribute('src');

  document.getElementById('track-title').textContent = track.name;
  document.getElementById('track-artist').textContent = track.artist;

  progress.value = 0;
  document.getElementById('current-time').textContent = '0:00';
  document.getElementById('duration').textContent = '0:00';

  playButton.textContent = '▶';

  audio.src = track.url;
  audio.load();

  renderLibrary();

  if (autoplay) {
    playWhenReady(token);
  }
}

async function playWhenReady(token) {
  try {
    if (token !== loadToken) return;

    await audio.play();

    if (token !== loadToken) {
      audio.pause();
    }
  } catch (error) {
    if (token === loadToken) {
      console.warn('Не удалось воспроизвести трек:', error);
      playButton.textContent = '▶';
    }
  }
}

function togglePlay() {
  if (currentTrack === -1) {
    if (!tracks.length) {
      musicUpload.click();
      return;
    }

    loadTrack(0, true);
    return;
  }

  if (audio.paused) {
    playWhenReady(loadToken);
  } else {
    audio.pause();
  }
}

playButton.addEventListener('click', togglePlay);

audio.addEventListener('play', () => {
  playButton.textContent = 'Ⅱ';
});

audio.addEventListener('pause', () => {
  playButton.textContent = '▶';
});

audio.addEventListener('loadedmetadata', updateTime);
audio.addEventListener('durationchange', updateTime);
audio.addEventListener('timeupdate', updateTime);
audio.addEventListener('seeked', updateTime);

audio.addEventListener('emptied', () => {
  progress.value = 0;
  document.getElementById('current-time').textContent = '0:00';
  document.getElementById('duration').textContent = '0:00';
});

audio.addEventListener('error', () => {
  console.error('Ошибка загрузки аудио:', audio.error);
  playButton.textContent = '▶';
});

progress.addEventListener('input', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime =
      (Number(progress.value) / 100) * audio.duration;
  }
});

// Следующий и предыдущий трек

document.getElementById('next').addEventListener('click', nextTrack);

document.getElementById('prev').addEventListener('click', () => {
  if (!tracks.length) return;

  const previous = currentTrack > 0
    ? currentTrack - 1
    : tracks.length - 1;

  loadTrack(previous, true);
});

function nextTrack() {
  if (!tracks.length) return;

  let next = currentTrack + 1;

  if (shuffled && tracks.length > 1) {
    do {
      next = Math.floor(Math.random() * tracks.length);
    } while (next === currentTrack);
  }

  if (next >= tracks.length) next = 0;

  loadTrack(next, true);
}

audio.addEventListener('ended', () => {
  if (repeated) {
    audio.currentTime = 0;
    playWhenReady(loadToken);
  } else if (currentTrack < tracks.length - 1 || shuffled) {
    nextTrack();
  } else {
    playButton.textContent = '▶';
  }
});

// Перемешивание и повтор

const shuffleButton = document.getElementById('shuffle');
const repeatButton = document.getElementById('repeat');

shuffleButton.addEventListener('click', () => {
  shuffled = !shuffled;
  shuffleButton.classList.toggle('active', shuffled);
});

repeatButton.addEventListener('click', () => {
  repeated = !repeated;
  repeatButton.classList.toggle('active', repeated);
});

// Громкость

document.getElementById('volume').addEventListener('input', event => {
  audio.volume = Number(event.target.value);
});

audio.volume = 0.8;

// =====================================
// SVG-иконки треков
// =====================================

const PLAY_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.5L19 12L8 18.5V5.5Z"
          fill="currentColor"/>
  </svg>
`;

const DELETE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7H20M10 11V17M14 11V17M6 7L7 20H17L18 7M9 7V4H15V7"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"/>
  </svg>
`;

// =====================================
// Library
// =====================================

function renderLibrary() {
  const library = document.getElementById('library-list');
  const recent = document.getElementById('recent-list');
  const query = document.getElementById('search').value.toLowerCase();

  const filtered = tracks
    .map((track, index) => ({ ...track, index }))
    .filter(track => track.name.toLowerCase().includes(query));

  function createTrackItem(track) {
    return `
      <div class="track-item ${track.index === currentTrack ? 'selected' : ''}"
           data-index="${track.index}">

        <div class="track-icon">♫</div>

        <div class="track-details">
          <strong>${escapeHTML(track.name)}</strong>
          <span>${escapeHTML(track.artist)}</span>
        </div>

        <button class="track-play"
                data-play="${track.index}"
                title="Воспроизвести"
                aria-label="Воспроизвести ${escapeHTML(track.name)}">
          ${PLAY_ICON}
        </button>

        <button class="track-delete"
                data-delete="${track.index}"
                title="Удалить"
                aria-label="Удалить ${escapeHTML(track.name)}">
          ${DELETE_ICON}
        </button>
      </div>
    `;
  }

  if (!filtered.length) {
    library.innerHTML = '<div class="empty-state">Треки не найдены.</div>';
  } else {
    library.innerHTML = filtered.map(createTrackItem).join('');
  }

  const latest = tracks.slice(-4).reverse();

  if (!latest.length) {
    recent.innerHTML =
      '<div class="empty-state">Твоя музыкальная история начнётся здесь.</div>';
  } else {
    recent.innerHTML = latest.map(track => {
      const index = tracks.indexOf(track);

      return createTrackItem({ ...track, index });
    }).join('');
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function selectTrackFromList(event) {
  const deleteButton = event.target.closest('[data-delete]');

  if (deleteButton) {
    event.stopPropagation();
    deleteTrack(Number(deleteButton.dataset.delete));
    return;
  }

  const button = event.target.closest('[data-play]');
  const item = event.target.closest('[data-index]');

  const index = button
    ? Number(button.dataset.play)
    : item ? Number(item.dataset.index) : -1;

  if (index >= 0) {
    loadTrack(index, true);
  }
}

document.getElementById('library-list')
  .addEventListener('click', selectTrackFromList);

document.getElementById('recent-list')
  .addEventListener('click', selectTrackFromList);

document.getElementById('search').addEventListener('input', renderLibrary);

// =====================================
// PlaMus: удаление треков
// =====================================

async function deleteTrack(index) {
  const track = tracks[index];
  if (!track) return;

  const confirmed = confirm(
    `Удалить «${track.name}» из медиатеки?`
  );

  if (!confirmed) return;

  try {
    await deleteAudioFile(track.id);

    const wasCurrent = index === currentTrack;
    const wasPlaying = wasCurrent && !audio.paused;

    if (wasCurrent) {
      audio.pause();
      ++loadToken;
      audio.removeAttribute('src');
      audio.load();
    }

    URL.revokeObjectURL(track.url);
    tracks.splice(index, 1);

    if (!tracks.length) {
      currentTrack = -1;

      document.getElementById('track-title').textContent = 'Нет трека';
      document.getElementById('track-artist').textContent = 'Добавь музыку';

      playButton.textContent = '▶';
      updateTime();
    } else if (wasCurrent) {
      loadTrack(
        Math.min(index, tracks.length - 1),
        wasPlaying
      );
    } else {
      if (index < currentTrack) {
        currentTrack--;
      }

      renderLibrary();
    }
  } catch (error) {
    console.error('Не удалось удалить трек:', error);
    alert('Не удалось удалить композицию.');
  }
}

// =====================================
// Внешний вид: фон
// =====================================

document.querySelectorAll('.bg-option').forEach(button => {
  button.addEventListener('click', () => {
    document.body.dataset.bg = button.dataset.bg;

    document.querySelectorAll('.bg-option').forEach(option => {
      option.classList.toggle('selected', option === button);
    });
  });
});

// Загрузка собственного фона

document.getElementById('background-upload')
  .addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    document.body.style.backgroundImage =
      `linear-gradient(rgba(11,11,16,.78), rgba(11,11,16,.9)), url("${URL.createObjectURL(file)}")`;

    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  });

// Загрузка обложки

document.getElementById('cover-upload')
  .addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const cover = document.getElementById('cover');

    cover.style.backgroundImage =
      `url("${URL.createObjectURL(file)}")`;

    cover.querySelector('.cover-symbol').style.display = 'none';
  });

// Переключатели внешнего вида

document.getElementById('glow').addEventListener('change', event => {
  document.body.classList.toggle('no-glow', !event.target.checked);
});

document.getElementById('glass').addEventListener('change', event => {
  document.body.classList.toggle('no-glass', !event.target.checked);
});

document.getElementById('captions').addEventListener('change', event => {
  document.body.classList.toggle('hide-captions', !event.target.checked);
});

// =====================================
// PlaMus: сохранение настроек
// =====================================

const SETTINGS_KEY = 'plamus-settings-v1';
const DB_NAME = 'plamus-storage';
const STORE_NAME = 'images';

let settings = {};

try {
  settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
} catch (error) {
  settings = {};
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Не удалось сохранить настройки:', error);
  }
}

function openSettingsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveImage(key, file) {
  let db;

  try {
    db = await openSettingsDB();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');

      transaction.objectStore(STORE_NAME).put(file, key);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn('Не удалось сохранить изображение:', error);
  } finally {
    if (db) db.close();
  }
}

async function loadImage(key) {
  let db;

  try {
    db = await openSettingsDB();

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Не удалось загрузить изображение:', error);
    return null;
  } finally {
    if (db) db.close();
  }
}

async function deleteImage(key) {
  let db;

  try {
    db = await openSettingsDB();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');

      transaction.objectStore(STORE_NAME).delete(key);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn('Не удалось удалить изображение:', error);
  } finally {
    if (db) db.close();
  }
}

// Восстановление настроек

if (['dark', 'purple', 'blue'].includes(settings.background)) {
  document.body.dataset.bg = settings.background;

  document.querySelectorAll('.bg-option').forEach(button => {
    button.classList.toggle(
      'selected',
      button.dataset.bg === settings.background
    );
  });
}

if (typeof settings.glow === 'boolean') {
  document.getElementById('glow').checked = settings.glow;
  document.body.classList.toggle('no-glow', !settings.glow);
}

if (typeof settings.glass === 'boolean') {
  document.getElementById('glass').checked = settings.glass;
  document.body.classList.toggle('no-glass', !settings.glass);
}

if (typeof settings.captions === 'boolean') {
  document.getElementById('captions').checked = settings.captions;
  document.body.classList.toggle('hide-captions', !settings.captions);
}

if (typeof settings.volume === 'number') {
  const volume = Math.max(0, Math.min(1, settings.volume));

  audio.volume = volume;
  document.getElementById('volume').value = volume;
}

// Сохранение переключателей

document.getElementById('glow').addEventListener('change', event => {
  settings.glow = event.target.checked;
  saveSettings();
});

document.getElementById('glass').addEventListener('change', event => {
  settings.glass = event.target.checked;
  saveSettings();
});

document.getElementById('captions').addEventListener('change', event => {
  settings.captions = event.target.checked;
  saveSettings();
});

document.getElementById('volume').addEventListener('input', event => {
  settings.volume = Number(event.target.value);
  saveSettings();
});

// Сохранение фоновых пресетов

document.querySelectorAll('.bg-option').forEach(button => {
  button.addEventListener('click', () => {
    settings.background = button.dataset.bg;
    saveSettings();
    deleteImage('background');
  });
});

// Сохранение собственного фона

document.getElementById('background-upload')
  .addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    settings.background = 'custom';
    saveSettings();
    saveImage('background', file);
  });

// Сохранение обложки

document.getElementById('cover-upload')
  .addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    saveImage('cover', file);
  });

// Восстановление пользовательских изображений

(async function restoreImages() {
  const background = await loadImage('background');

  if (background) {
    const url = URL.createObjectURL(background);

    document.body.style.backgroundImage =
      `linear-gradient(rgba(11,11,16,.78), rgba(11,11,16,.9)), url("${url}")`;

    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';

    document.querySelectorAll('.bg-option').forEach(button => {
      button.classList.remove('selected');
    });
  }

  const coverImage = await loadImage('cover');

  if (coverImage) {
    const url = URL.createObjectURL(coverImage);
    const cover = document.getElementById('cover');

    cover.style.backgroundImage = `url("${url}")`;
    cover.querySelector('.cover-symbol').style.display = 'none';
  }
})();

// =====================================
// Обновлённые кнопки треков
// =====================================

const trackButtonStyles = document.createElement('style');

trackButtonStyles.textContent = `
  .track-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .track-details {
    flex: 1;
    min-width: 0;
  }

  .track-play,
  .track-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 38px;
    width: 38px;
    height: 38px;
    padding: 9px;
    margin: 0;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 12px;
    cursor: pointer;
    transition: .2s ease;
  }

  .track-play {
    color: #b9a2ff;
    background: rgba(151,113,255,.12);
  }

  .track-delete {
    color: #ff8585;
    background: rgba(255,90,90,.08);
  }

  .track-play svg,
  .track-delete svg {
    width: 100%;
    height: 100%;
  }

  .track-play:active,
  .track-delete:active {
    transform: scale(.9);
  }
`;

document.head.appendChild(trackButtonStyles);

// Начальное отображение

renderLibrary();



// =============================================
// PlaMus — USER PROFILE & LISTENING STATISTICS
// =============================================

(function initPlaMusProfile() {
  const profileButton = document.getElementById('profile');

  if (!profileButton) {
    console.warn('PlaMus: элемент профиля не найден.');
    return;
  }

  const STATS_KEY = 'plamus-listening-stats-v1';

  // ---------------------------------------------
  // Хранилище статистики
  // ---------------------------------------------

  function readStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');

      return {
        totalPlays: Number(saved.totalPlays) || 0,
        totalSeconds: Number(saved.totalSeconds) || 0,
        tracks: saved.tracks && typeof saved.tracks === 'object'
          ? saved.tracks
          : {}
      };
    } catch (error) {
      return {
        totalPlays: 0,
        totalSeconds: 0,
        tracks: {}
      };
    }
  }

  const stats = readStats();

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (error) {
      console.warn('PlaMus: ошибка сохранения статистики', error);
    }
  }

  function getTrackKey(track) {
    if (!track) return null;

    return track.id != null
      ? 'id:' + track.id
      : 'file:' + track.name + '::' + track.artist;
  }

  function formatListeningTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return hours + ' ч ' + (minutes % 60) + ' мин';
    }

    return minutes + ' мин';
  }

  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
  }

  // ---------------------------------------------
  // Информация Telegram
  // ---------------------------------------------

  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  const username = telegramUser?.username
    ? '@' + telegramUser.username
    : 'Пользователь PlaMus';

  const fullName = telegramUser
    ? [telegramUser.first_name, telegramUser.last_name]
        .filter(Boolean).join(' ')
    : 'Твой музыкальный профиль';

  const avatar = telegramUser?.photo_url || '';

  // ---------------------------------------------
  // Создание интерфейса профиля
  // ---------------------------------------------

  const profileStyle = document.createElement('style');

  profileStyle.textContent = `
    #profile {
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    #plamus-profile-overlay {
      position: fixed;
      inset: 0;
      z-index: 99990;
      display: flex;
      justify-content: flex-end;
      background: rgba(0,0,0,.65);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
      opacity: 0;
      visibility: hidden;
      transition: opacity .3s ease, visibility .3s ease;
    }

    #plamus-profile-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    #plamus-profile-panel {
      width: min(100%, 480px);
      height: 100%;
      height: 100dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: max(28px, env(safe-area-inset-top)) 24px
        max(30px, env(safe-area-inset-bottom));
      box-sizing: border-box;
      color: #f5f2ff;
      background:
        radial-gradient(ellipse at 90% 0%, rgba(139,101,255,.22), transparent 45%),
        #111018;
      border-left: 1px solid rgba(255,255,255,.1);
      transform: translateX(100%);
      transition: transform .35s cubic-bezier(.2,.8,.2,1);
    }

    #plamus-profile-overlay.open #plamus-profile-panel {
      transform: translateX(0);
    }

    .pl-profile-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 38px;
    }

    .pl-profile-heading {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #b69aff;
    }

    .pl-profile-close {
      width: 42px;
      height: 42px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 14px;
      color: white;
      background: rgba(255,255,255,.06);
      font-size: 25px;
      cursor: pointer;
    }

    .pl-profile-user {
      text-align: center;
      padding: 12px 0 30px;
    }

    .pl-profile-avatar {
      width: 94px;
      height: 94px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 50%;
      border: 2px solid rgba(182,154,255,.7);
      background: linear-gradient(135deg,#7551c9,#241c39);
      color: white;
      font-size: 34px;
      font-weight: 800;
      box-shadow: 0 0 35px rgba(151,113,255,.2);
    }

    .pl-profile-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .pl-profile-name {
      font-size: 25px;
      font-weight: 800;
      margin-bottom: 7px;
      overflow-wrap: anywhere;
    }

    .pl-profile-username {
      color: #ad9acb;
      font-size: 14px;
    }

    .pl-profile-section-title {
      margin: 28px 0 15px;
      color: #b69aff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2.5px;
    }

    .pl-profile-stats {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 11px;
    }

    .pl-profile-stat {
      min-width: 0;
      padding: 18px 15px;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 19px;
      background: rgba(255,255,255,.045);
    }

    .pl-profile-stat-label {
      display: block;
      color: #9b96a8;
      font-size: 11px;
      margin-bottom: 12px;
    }

    .pl-profile-stat-value {
      display: block;
      color: #c1a6ff;
      font-size: 25px;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .pl-profile-top {
      display: grid;
      gap: 10px;
    }

    .pl-profile-track {
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 13px;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 15px;
      background: rgba(255,255,255,.035);
    }

    .pl-profile-rank {
      width: 31px;
      height: 31px;
      display: grid;
      place-items: center;
      flex: 0 0 31px;
      border-radius: 10px;
      color: #c1a6ff;
      background: rgba(151,113,255,.14);
      font-size: 13px;
      font-weight: 800;
    }

    .pl-profile-track-info {
      flex: 1;
      min-width: 0;
    }

    .pl-profile-track-info strong,
    .pl-profile-track-info span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pl-profile-track-info strong {
      font-size: 13px;
    }

    .pl-profile-track-info span {
      color: #9690a2;
      font-size: 11px;
      margin-top: 5px;
    }

    .pl-profile-track-plays {
      color: #b69aff;
      font-size: 11px;
      white-space: nowrap;
    }

    .pl-profile-empty {
      padding: 22px 15px;
      text-align: center;
      color: #9992a7;
      border: 1px dashed rgba(255,255,255,.12);
      border-radius: 15px;
      font-size: 13px;
      line-height: 1.6;
    }

    .pl-profile-footer {
      margin-top: 35px;
      padding-top: 18px;
      border-top: 1px solid rgba(255,255,255,.08);
      color: #777181;
      font-size: 11px;
      line-height: 1.6;
      text-align: center;
    }

    @media (min-width: 700px) {
      #plamus-profile-panel {
        border-radius: 25px 0 0 25px;
      }
    }
  `;

  document.head.appendChild(profileStyle);

  const overlay = document.createElement('div');
  overlay.id = 'plamus-profile-overlay';

  overlay.innerHTML = `
    <div id="plamus-profile-panel" role="dialog"
         aria-modal="true" aria-label="Профиль PlaMus">

      <div class="pl-profile-header">
        <span class="pl-profile-heading">YOUR SPACE</span>
        <button class="pl-profile-close"
                id="pl-profile-close"
                aria-label="Закрыть профиль">×</button>
      </div>

      <div class="pl-profile-user">
        <div class="pl-profile-avatar" id="pl-profile-avatar">
          ${safeText((fullName[0] || 'P').toUpperCase())}
        </div>

        <div class="pl-profile-name" id="pl-profile-name">
          ${safeText(fullName)}
        </div>

        <div class="pl-profile-username">
          ${safeText(username)}
        </div>
      </div>

      <div class="pl-profile-section-title">
        LISTENING STATISTICS
      </div>

      <div class="pl-profile-stats">
        <div class="pl-profile-stat">
          <span class="pl-profile-stat-label">Прослушивания</span>
          <strong class="pl-profile-stat-value" id="pl-stat-plays">0</strong>
        </div>

        <div class="pl-profile-stat">
          <span class="pl-profile-stat-label">Время прослушивания</span>
          <strong class="pl-profile-stat-value" id="pl-stat-time">0 мин</strong>
        </div>

        <div class="pl-profile-stat">
          <span class="pl-profile-stat-label">Треков в медиатеке</span>
          <strong class="pl-profile-stat-value" id="pl-stat-library">0</strong>
        </div>

        <div class="pl-profile-stat">
          <span class="pl-profile-stat-label">Разных треков слушал</span>
          <strong class="pl-profile-stat-value" id="pl-stat-unique">0</strong>
        </div>
      </div>

      <div class="pl-profile-section-title">
        YOUR TOP TRACKS
      </div>

      <div class="pl-profile-top" id="pl-profile-top">
        <div class="pl-profile-empty">
          Здесь пока пусто.<br>
          Включи музыку — и твой топ начнёт формироваться.
        </div>
      </div>

      <div class="pl-profile-footer">
        PlaMus · Your personal music space<br>
        Статистика хранится на этом устройстве.
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Аватар Telegram
  if (avatar) {
    const avatarBox = document.getElementById('pl-profile-avatar');
    const avatarImage = document.createElement('img');

    avatarImage.src = avatar;
    avatarImage.alt = 'Аватар';

    avatarBox.replaceChildren(avatarImage);
  }

  // ---------------------------------------------
  // Открытие и закрытие панели
  // ---------------------------------------------

  function openProfile() {
    renderProfile();

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (window.Telegram?.WebApp?.BackButton) {
      window.Telegram.WebApp.BackButton.show();
      window.Telegram.WebApp.BackButton.onClick(closeProfile);
    }
  }

  function closeProfile() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';

    if (window.Telegram?.WebApp?.BackButton) {
      window.Telegram.WebApp.BackButton.hide();
      window.Telegram.WebApp.BackButton.offClick(closeProfile);
    }
  }

  profileButton.setAttribute('role', 'button');
  profileButton.setAttribute('tabindex', '0');
  profileButton.setAttribute('aria-label', 'Открыть профиль');

  profileButton.addEventListener('click', openProfile);

  profileButton.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProfile();
    }
  });

  document.getElementById('pl-profile-close')
    .addEventListener('click', closeProfile);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeProfile();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay.classList.contains('open')) {
      closeProfile();
    }
  });

  // ---------------------------------------------
  // Отображение статистики
  // ---------------------------------------------

  function renderProfile() {
    document.getElementById('pl-stat-plays').textContent =
      stats.totalPlays;

    document.getElementById('pl-stat-time').textContent =
      formatListeningTime(stats.totalSeconds);

    document.getElementById('pl-stat-library').textContent =
      tracks.length;

    const uniqueTracks = Object.values(stats.tracks)
      .filter(track => track.plays > 0).length;

    document.getElementById('pl-stat-unique').textContent =
      uniqueTracks;

    const top = Object.values(stats.tracks)
      .filter(track => track.plays > 0)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5);

    const topContainer = document.getElementById('pl-profile-top');

    if (!top.length) {
      topContainer.innerHTML = `
        <div class="pl-profile-empty">
          Здесь пока пусто.<br>
          Включи музыку — и твой топ начнёт формироваться.
        </div>
      `;
      return;
    }

    topContainer.innerHTML = top.map((track, index) => `
      <div class="pl-profile-track">
        <div class="pl-profile-rank">${index + 1}</div>

        <div class="pl-profile-track-info">
          <strong>${safeText(track.name)}</strong>
          <span>${safeText(track.artist)} ·
            ${formatListeningTime(track.seconds || 0)}
          </span>
        </div>

        <span class="pl-profile-track-plays">
          ${track.plays} раз
        </span>
      </div>
    `).join('');
  }

  // ---------------------------------------------
  // Учёт воспроизведений
  // ---------------------------------------------

  let activeStatsTrack = null;
  let lastAudioTime = null;

  audio.addEventListener('play', () => {
    const track = tracks[currentTrack];
    if (!track) return;

    const key = getTrackKey(track);

    if (activeStatsTrack !== key) {
      activeStatsTrack = key;

      if (!stats.tracks[key]) {
        stats.tracks[key] = {
          name: track.name,
          artist: track.artist,
          plays: 0,
          seconds: 0
        };
      }

      stats.tracks[key].name = track.name;
      stats.tracks[key].artist = track.artist;
      stats.tracks[key].plays++;

      stats.totalPlays++;

      saveStats();
    }

    lastAudioTime = audio.currentTime;
    renderProfile();
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.paused || !activeStatsTrack) return;

    const currentTime = audio.currentTime;

    if (lastAudioTime !== null) {
      const elapsed = currentTime - lastAudioTime;

      // Не считаем перемотку и большие скачки времени.
      if (elapsed > 0 && elapsed <= 5) {
        stats.totalSeconds += elapsed;

        const trackStats = stats.tracks[activeStatsTrack];

        if (trackStats) {
          trackStats.seconds += elapsed;
        }

        saveStats();
      }
    }

    lastAudioTime = currentTime;
  });

  audio.addEventListener('seeking', () => {
    lastAudioTime = null;
  });

  audio.addEventListener('seeked', () => {
    lastAudioTime = audio.currentTime;
  });

  audio.addEventListener('pause', () => {
    lastAudioTime = null;
  });

  audio.addEventListener('ended', () => {
    lastAudioTime = null;
    activeStatsTrack = null;
  });

  // Обновление количества треков при открытии профиля.
  renderProfile();

  console.log('PlaMus: профиль успешно подключён.');
})();
