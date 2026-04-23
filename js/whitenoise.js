// ============================================
// STUDY AURA — WHITE NOISE (v2)
// Audio sources:
//   1. Admin sounds  → uploaded to Supabase Storage → streamed for all users
//   2. User sounds   → stored as base64 in localStorage → local only
// ============================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const audioEls = {};   // id → <audio> element

function _setCardState(cardId, playing) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.toggle('playing', playing);
  const btn = card.querySelector('.noise-btn');
  if (btn) btn.innerHTML = playing
    ? `<svg width="13" height="13"><use href="#ic-stop"/></svg> Stop`
    : `<svg width="13" height="13"><use href="#ic-play"/></svg> Play`;
}

// ============================================================
// FILE-BASED AUDIO HELPERS
// ============================================================
function toggleAudioSound(id) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const el = audioEls[id];
  if (!el) return;
  if (!el.paused) {
    el.pause(); el.currentTime=0;
    _setCardState('custom-card-' + id, false);
  } else {
    el.loop=true; el.volume=0.6;
    el.play().catch(() => showToast('Could not play audio'));
    _setCardState('custom-card-' + id, true);
  }
}

function setCustomVolume(id, val) {
  if (audioEls[id]) audioEls[id].volume = parseFloat(val);
}

function _buildAudioEl(src) {
  const el = new Audio(src); el.loop=true; return el;
}

// ============================================================
// ADMIN: LOAD SOUNDS FROM SUPABASE STORAGE
// ============================================================
async function loadAdminSounds() {
  const grid = document.getElementById('admin-sounds-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-text">Loading sounds...</div>';

  try {
    const { data: files, error } = await db.storage.from('whitenoise').list('admin', { limit: 50 });
    if (error || !files || files.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="padding:1rem;font-size:.85rem">No ambient sounds uploaded yet.</div>';
      return;
    }
    grid.innerHTML = '';
    files.forEach(file => {
      const id = 'admin_' + file.name.replace(/\W/g,'_');
      const { data: urlData } = db.storage.from('whitenoise').getPublicUrl('admin/' + file.name);
      const url = urlData?.publicUrl;
      if (!url) return;
      if (!audioEls[id]) audioEls[id] = _buildAudioEl(url);
      const label = file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
      const card = document.createElement('div');
      card.className='noise-card custom-noise-card';
      card.id='custom-card-' + id;
      card.innerHTML=`
        <div class="noise-visual custom-visual"></div>
        <div class="noise-info">
          <h3>${escHtml(label)}</h3>
          <p>Ambient · by admin</p>
        </div>
        <button class="noise-btn" onclick="toggleAudioSound('${id}')">
          <svg width="13" height="13"><use href="#ic-play"/></svg> Play
        </button>
        <div class="volume-wrap">
          <svg width="12" height="12" style="color:var(--text3)"><use href="#ic-volume"/></svg>
          <input type="range" class="volume-slider" min="0" max="1" step="0.05" value="0.6"
                 oninput="setCustomVolume('${id}', this.value)">
        </div>
        ${isAdmin() ? `<button class="noise-delete-btn" onclick="deleteAdminSound('${file.name}')" title="Delete">✕</button>` : ''}
      `;
      grid.appendChild(card);
    });
  } catch(e) {
    grid.innerHTML='<div class="empty-state">Failed to load sounds</div>';
  }
}

async function deleteAdminSound(filename) {
  if (!confirm('Delete "' + filename + '"?')) return;
  const { error } = await db.storage.from('whitenoise').remove(['admin/' + filename]);
  if (error) return showToast('Delete failed: ' + error.message);
  showToast('✅ Deleted');
  loadAdminSounds();
}

// ============================================================
// ADMIN: UPLOAD TO SUPABASE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const uploadInput = document.getElementById('admin-noise-input');
  const uploadBtn   = document.getElementById('admin-noise-upload-btn');

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener('click', async () => {
      const file = uploadInput.files[0];
      if (!file) return showToast('Select an audio file first');
      if (!file.type.startsWith('audio/')) return showToast('Only audio files are allowed');
      if (file.size > 20*1024*1024) return showToast('File must be under 20 MB');

      uploadBtn.textContent='Uploading...'; uploadBtn.disabled=true;
      const path='admin/' + file.name;
      const { error } = await db.storage.from('whitenoise').upload(path, file, { upsert: true });
      uploadBtn.textContent='Upload Sound'; uploadBtn.disabled=false;

      if (error) return showToast('Upload failed: ' + error.message);
      uploadInput.value='';
      showToast('✅ Sound uploaded for all users!');
      loadAdminSounds();
    });
  }
});

// ============================================================
// USER LOCAL UPLOADS (base64 in localStorage)
// ============================================================
const LS_USER_NOISES = 'sa_user_noises';

function getUserNoises() {
  try { return JSON.parse(localStorage.getItem(LS_USER_NOISES) || '[]'); }
  catch { return []; }
}
function saveUserNoises(arr) {
  localStorage.setItem(LS_USER_NOISES, JSON.stringify(arr));
}

function renderUserSounds() {
  const grid = document.getElementById('user-sounds-grid');
  if (!grid) return;
  const noises = getUserNoises();
  if (noises.length === 0) {
    grid.innerHTML='<div class="empty-state" style="padding:1rem;font-size:.85rem;color:var(--text3)">No personal sounds yet. Add one below!</div>';
    return;
  }
  grid.innerHTML='';
  noises.forEach(n => {
    if (!audioEls[n.id]) audioEls[n.id]=_buildAudioEl(n.data);
    const card=document.createElement('div');
    card.className='noise-card custom-noise-card user-sound-card';
    card.id='custom-card-' + n.id;
    card.innerHTML=`
      <div class="noise-visual user-visual"></div>
      <div class="noise-info">
        <h3>${escHtml(n.name)}</h3>
        <p>Your sound · local only</p>
      </div>
      <button class="noise-btn" onclick="toggleAudioSound('${n.id}')">
        <svg width="13" height="13"><use href="#ic-play"/></svg> Play
      </button>
      <div class="volume-wrap">
        <svg width="12" height="12" style="color:var(--text3)"><use href="#ic-volume"/></svg>
        <input type="range" class="volume-slider" min="0" max="1" step="0.05" value="0.6"
               oninput="setCustomVolume('${n.id}', this.value)">
      </div>
      <button class="noise-delete-btn" onclick="deleteUserSound('${n.id}')" title="Remove">✕</button>
    `;
    grid.appendChild(card);
  });
}

function deleteUserSound(id) {
  const el = audioEls[id];
  if (el && !el.paused) { el.pause(); el.currentTime=0; }
  delete audioEls[id];
  saveUserNoises(getUserNoises().filter(n => n.id !== id));
  renderUserSounds();
}

// Disclaimer modal + file read
document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('user-noise-input');
  const userBtn   = document.getElementById('user-noise-add-btn');
  const disclaimerModal  = document.getElementById('user-noise-disclaimer-modal');
  const disclaimerOk     = document.getElementById('disclaimer-ok-btn');
  const disclaimerCancel = document.getElementById('disclaimer-cancel-btn');
  let pendingFile = null;

  if (userBtn && userInput) {
    userBtn.addEventListener('click', () => userInput.click());
    userInput.addEventListener('change', () => {
      const file = userInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('audio/')) return showToast('Only audio files are allowed');
      if (file.size > 30*1024*1024) return showToast('File must be under 30 MB');
      pendingFile=file;
      if (disclaimerModal) disclaimerModal.style.display='flex';
    });
  }

  if (disclaimerOk) {
    disclaimerOk.addEventListener('click', () => {
      if (disclaimerModal) disclaimerModal.style.display='none';
      if (!pendingFile) return;
      const reader=new FileReader();
      reader.onload=e=>{
        const base64=e.target.result;
        const id='user_' + Date.now();
        const name=pendingFile.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
        const noises=getUserNoises();
        noises.push({ id, name, data: base64 });
        saveUserNoises(noises);
        audioEls[id]=_buildAudioEl(base64);
        renderUserSounds();
        showToast('✅ Sound saved locally!');
        pendingFile=null;
        if (userInput) userInput.value='';
      };
      reader.readAsDataURL(pendingFile);
    });
  }

  if (disclaimerCancel) {
    disclaimerCancel.addEventListener('click', () => {
      if (disclaimerModal) disclaimerModal.style.display='none';
      pendingFile=null;
      if (userInput) userInput.value='';
    });
  }
});

// ============================================================
// PAGE INIT
// ============================================================
function onWhitenoisePageOpen() {
  loadAdminSounds();
  renderUserSounds();
}

function isAdmin() {
  return currentUser && currentUser.email === ADMIN_EMAIL;
}

// Show selected filename in admin upload panel
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('admin-noise-input');
  const label = document.getElementById('admin-noise-filename');
  if (input && label) {
    input.addEventListener('change', () => {
      label.textContent = input.files[0]?.name || 'No file selected';
    });
  }
});