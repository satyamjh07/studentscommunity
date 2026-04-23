// ============================================
// STUDY AURA — CLOUDINARY IMAGE UPLOAD (v1)
// Unsigned upload — no API secret exposed.
// ============================================

// ── CONFIG — replace with your actual values ──
const CLOUDINARY_CLOUD_NAME = 'dn5uwablh';   // e.g. 'dxyz123abc'
const CLOUDINARY_UPLOAD_PRESET = 'study_aura_unsigned'; // e.g. 'study_aura_unsigned'

// ── Upload endpoint ───────────────────────────
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// ============================================================
// CORE: uploadImageToCloudinary
// Validates file, uploads to Cloudinary, returns secure_url.
// ============================================================
async function uploadImageToCloudinary(file, options = {}) {
  const {
    maxSizeMB = 1,
    folder = 'study_aura',
    onProgress = null,   // optional callback(percent)
  } = options;

  // ── 1. Validate file type ─────────────────────
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed (JPEG, PNG, WebP, etc.)');
  }

  // ── 2. Validate file size ─────────────────────
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Image must be under ${maxSizeMB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
  }

  // ── 3. Build FormData ─────────────────────────
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);

  // ── 4. Upload via XHR (supports progress) ─────
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_UPLOAD_URL);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        resolve(data.secure_url);
      } else {
        let errMsg = 'Upload failed';
        try {
          const errData = JSON.parse(xhr.responseText);
          errMsg = errData.error?.message || errMsg;
        } catch (_) {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

// ============================================================
// HELPER: getOptimizedUrl
// Adds f_auto,q_auto to any Cloudinary URL for performance.
// Example: .../upload/xyz.jpg → .../upload/f_auto,q_auto/xyz.jpg
// ============================================================
function getOptimizedUrl(cloudinaryUrl, extraTransforms = '') {
  if (!cloudinaryUrl || !cloudinaryUrl.includes('cloudinary.com')) return cloudinaryUrl;
  const transforms = ['f_auto', 'q_auto', ...(extraTransforms ? [extraTransforms] : [])].join(',');
  return cloudinaryUrl.replace('/upload/', `/upload/${transforms}/`);
}

// ============================================================
// HELPER: createImagePreview
// Reads a File and shows a preview in a given container element.
// ============================================================
function createImagePreview(file, previewElement) {
  if (!file || !previewElement) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewElement.innerHTML = `<img src="${e.target.result}" alt="Preview" style="
      width: 100%; height: 100%; object-fit: cover; border-radius: inherit;
    ">`;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// HELPER: showUploadProgress
// Shows/hides an inline upload progress bar.
// ============================================================
function showUploadProgress(containerEl, percent) {
  if (!containerEl) return;
  if (percent === null) {
    containerEl.innerHTML = '';
    return;
  }
  containerEl.innerHTML = `
    <div class="upload-progress-wrap">
      <div class="upload-progress-bar" style="width: ${percent}%"></div>
      <span class="upload-progress-label">${percent}%</span>
    </div>
  `;
}