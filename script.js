
const audio = document.getElementById('audio');
const playButton = document.getElementById('play');
const progress = document.getElementById('progress');

let tracks = [];
let currentTrack = -1;
let shuffled = false;
let repeated = false;
let loadToken = 0;

// Telegram
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  if (user) {
    document.getElementById('profile').textContent =
      user.username ? '@' + user.username : user.first_name;
  }
}

// Navigation
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

// File uploads
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
      await saveAudioFile(file, track.name, track.artist);
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


// Player
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

  if (duration > 0) {
    progress.value = (current / duration) * 100;
  } else {
    progress.value = 0;
  }
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
    audio.currentTime = (Number(progress.value) / 100) * audio.duration;
  }
});

// Next and previous
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

// Shuffle and repeat
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

// Volume
document.getElementById('volume').addEventListener('input', event => {
  audio.volume = Number(event.target.value);
});

audio.volume = 0.8;

// Library
function renderLibrary() {
  const library = document.getElementById('library-list');
  const recent = document.getElementById('recent-list');
  const query = document.getElementById('search').value.toLowerCase();

  const filtered = tracks
    .map((track, index) => ({ ...track, index }))
    .filter(track => track.name.toLowerCase().includes(query));

  if (!filtered.length) {
    library.innerHTML = '<div class="empty-state">Треки не найдены.</div>';
  } else {
    library.innerHTML = filtered.map(track => `
      <div class="track-item ${track.index === currentTrack ? 'selected' : ''}"
           data-index="${track.index}">
        <div class="track-icon">♫</div>
        <div class="track-details">
          <strong>${escapeHTML(track.name)}</strong>
          <span>${escapeHTML(track.artist)}</span>
        </div>
        <button class="track-play" data-play="${track.index}">▶</button>
      </div>
    `).join('');
  }

  const latest = tracks.slice(-4).reverse();

  if (!latest.length) {
    recent.innerHTML =
      '<div class="empty-state">Твоя музыкальная история начнётся здесь.</div>';
  } else {
    recent.innerHTML = latest.map(track => {
      const index = tracks.indexOf(track);

      return `
        <div class="track-item" data-index="${index}">
          <div class="track-icon">♫</div>
          <div class="track-details">
            <strong>${escapeHTML(track.name)}</strong>
            <span>Локальный файл</span>
          </div>
          <button class="track-play" data-play="${index}">▶</button>
        </div>
      `;
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
  const button = event.target.closest('[data-play]');
  const item = event.target.closest('[data-index]');

  const index = button
    ? Number(button.dataset.play)
    : item ? Number(item.dataset.index) : -1;

  if (index >= 0) loadTrack(index, true);
}

document.getElementById('library-list')
  .addEventListener('click', selectTrackFromList);

document.getElementById('recent-list')
  .addEventListener('click', selectTrackFromList);

document.getElementById('search').addEventListener('input', renderLibrary);

// Background presets
document.querySelectorAll('.bg-option').forEach(button => {
  button.addEventListener('click', () => {
    document.body.dataset.bg = button.dataset.bg;

    document.querySelectorAll('.bg-option').forEach(option => {
      option.classList.toggle('selected', option === button);
    });
  });
});

// Custom background
document.getElementById('background-upload')
  .addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    document.body.style.backgroundImage =
      `linear-gradient(rgba(11,11,16,.78), rgba(11,11,16,.9)), url("${URL.createObjectURL(file)}")`;

    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  });

// Custom cover
document.getElementById('cover-upload')
  .addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const cover = document.getElementById('cover');
    cover.style.backgroundImage = `url("${URL.createObjectURL(file)}")`;

    cover.querySelector('.cover-symbol').style.display = 'none';
  });

// Appearance settings
document.getElementById('glow').addEventListener('change', event => {
  document.body.classList.toggle('no-glow', !event.target.checked);
});

document.getElementById('glass').addEventListener('change', event => {
  document.body.classList.toggle('no-glass', !event.target.checked);
});

document.getElementById('captions').addEventListener('change', event => {
  document.body.classList.toggle('hide-captions', !event.target.checked);
});

// Initial state
renderLibrary();


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

// IndexedDB для изображений
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
  try {
    const db = await openSettingsDB();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(file, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    db.close();
  } catch (error) {
    console.warn('Не удалось сохранить изображение:', error);
  }
}

async function loadImage(key) {
  try {
    const db = await openSettingsDB();

    const result = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  } catch (error) {
    console.warn('Не удалось загрузить изображение:', error);
    return null;
  }
}

async function deleteImage(key) {
  try {
    const db = await openSettingsDB();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    db.close();
  } catch (error) {
    console.warn('Не удалось удалить изображение:', error);
  }
}

// Восстановление обычных настроек
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

// Сохранение выбранного пресета
document.querySelectorAll('.bg-option').forEach(button => {
  button.addEventListener('click', () => {
    settings.background = button.dataset.bg;
    saveSettings();
    deleteImage('background');
  });
});

// Сохранение загруженного фона
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
// PlaMus: постоянная музыкальная библиотека
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

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite');

    transaction.objectStore(AUDIO_STORE).add({
      name,
      artist,
      file
    });

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

async function getSavedAudio() {
  const db = await openAudioDB();

  const result = await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readonly');
    const request = transaction.objectStore(AUDIO_STORE).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return result;
}

const libraryReady = (async () => {
  try {
    const savedTracks = await getSavedAudio();

    savedTracks.forEach(saved => {
      tracks.push({
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
