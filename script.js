
const audio = document.getElementById('audio');
const playButton = document.getElementById('play');
const progress = document.getElementById('progress');

let tracks = [];
let currentTrack = -1;
let shuffled = false;
let repeated = false;

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
  tab.addEventListener('click', () => {
    openPage(tab.dataset.page);
  });
});

document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => {
    openPage(button.dataset.open);
  });
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

musicUpload.addEventListener('change', event => {
  const files = Array.from(event.target.files || []);

  files.forEach(file => {
    if (!file.type.startsWith('audio/')) return;

    tracks.push({
      name: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Локальный файл',
      url: URL.createObjectURL(file),
      file
    });
  });

  renderLibrary();

  if (currentTrack === -1 && tracks.length) {
    loadTrack(0);
  }

  event.target.value = '';
});

// Player
function loadTrack(index) {
  if (!tracks.length) return;

  currentTrack = (index + tracks.length) % tracks.length;

  const track = tracks[currentTrack];

  audio.src = track.url;
  document.getElementById('track-title').textContent = track.name;
  document.getElementById('track-artist').textContent = track.artist;

  audio.load();
  playButton.textContent = '▶';

  renderLibrary();
}

function togglePlay() {
  if (currentTrack === -1) {
    if (!tracks.length) {
      musicUpload.click();
      return;
    }

    loadTrack(0);
  }

  if (audio.paused) {
    audio.play().catch(() => {});
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

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;

  progress.value = (audio.currentTime / audio.duration) * 100;

  document.getElementById('current-time').textContent =
    formatTime(audio.currentTime);

  document.getElementById('duration').textContent =
    formatTime(audio.duration);
});

progress.addEventListener('input', () => {
  if (audio.duration) {
    audio.currentTime = (progress.value / 100) * audio.duration;
  }
});

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';

  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return `${min}:${String(sec).padStart(2, '0')}`;
}

// Next and previous
document.getElementById('next').addEventListener('click', nextTrack);

document.getElementById('prev').addEventListener('click', () => {
  if (currentTrack > 0) {
    loadTrack(currentTrack - 1);
    audio.play().catch(() => {});
  } else if (tracks.length) {
    loadTrack(tracks.length - 1);
    audio.play().catch(() => {});
  }
});

function nextTrack() {
  if (!tracks.length) return;

  let next = currentTrack + 1;

  if (shuffled && tracks.length > 1) {
    do {
      next = Math.floor(Math.random() * tracks.length);
    } while (next === currentTrack);
  }

  if (next >= tracks.length) {
    next = 0;
  }

  loadTrack(next);
  audio.play().catch(() => {});
}

audio.addEventListener('ended', () => {
  if (repeated) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
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

document.getElementById('library-list').addEventListener('click', event => {
  const button = event.target.closest('[data-play]');
  const item = event.target.closest('[data-index]');

  const index = button
    ? Number(button.dataset.play)
    : item ? Number(item.dataset.index) : -1;

  if (index >= 0) {
    loadTrack(index);
    audio.play().catch(() => {});
  }
});

document.getElementById('recent-list').addEventListener('click', event => {
  const button = event.target.closest('[data-play]');
  const item = event.target.closest('[data-index]');

  const index = button
    ? Number(button.dataset.play)
    : item ? Number(item.dataset.index) : -1;

  if (index >= 0) {
    loadTrack(index);
    audio.play().catch(() => {});
  }
});

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
 