// ════════════════════════════════════
// 자동저장 / 복원 (localStorage)
// ════════════════════════════════════
const STORAGE_KEY = 'voiceMemo_data';

function saveToStorage() {
  const title = document.getElementById('docName').textContent.trim() || '문서 제목';
  const rows = [];
  document.querySelectorAll('#tableBody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => {
      const img = td.querySelector('img.cell-photo');
      if (img) return '__IMG__' + img.dataset.imgId;
      return td.textContent;
    });
    rows.push(cells);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, rows }));
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.title) document.getElementById('docName').textContent = data.title;
    if (data.rows && data.rows.length) {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';
      data.rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = row.map(cell => {
          if (cell.startsWith('__IMG__')) {
            const id = cell.replace('__IMG__', '');
            const src = localStorage.getItem('img_' + id) || '';
            return `<td contenteditable="false" style="text-align:center">${makeCellImg(id, src)}</td>`;
          }
          return `<td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true">${cell}</td>`;
        }).join('');
        tbody.appendChild(tr);
      });
      bindImgClick();
    }
  } catch {}
}

// 페이지 로드 시 복원 (IndexedDB 우선, 없으면 localStorage)
async function restoreOnLoad() {
  try {
    const saved = await idbGet('data', 'autosave');
    if (saved && saved.rows && saved.rows.length) {
      document.getElementById('docName').textContent = saved.title || '문서 제목';
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';
      for (const row of saved.rows) {
        const tr = document.createElement('tr');
        const cells = [];
        for (const cell of row) {
          if (cell.startsWith('__IMG__')) {
            const id = cell.replace('__IMG__', '');
            const imgData = await idbGet('images', id);
            const src = imgData?.src || '';
            const name = imgData?.name || '사진';
            cells.push(`<td contenteditable="false" style="text-align:center">${makeCellImg(id, src, name)}</td>`);
          } else {
            cells.push(`<td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true">${cell}</td>`);
          }
        }
        tr.innerHTML = cells.join('');
        tbody.appendChild(tr);
      }
      bindImgClick();
      return;
    }
  } catch {}
  loadFromStorage(); // fallback
}
restoreOnLoad();

// ── 자동저장 표시 ──
function showAutoSaveIndicator() {
  const el = document.getElementById('autoSaveIndicator');
  if (!el) return;
  el.textContent = '자동저장중';
  el.classList.add('saving');
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.textContent = '저장됨';
    el.classList.remove('saving');
  }, 800);
}

// ── IndexedDB 자동저장 ──
const DB_NAME = 'voiceMemoDb';
const DB_VER = 1;
let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('data')) d.createObjectStore('data');
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = reject;
  });
}

async function idbSet(store, key, value) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function idbGet(store, key) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

async function autoSaveToDevice() {
  try {
    const title = document.getElementById('docName').textContent.trim() || '자동저장중';
    const rows = [];
    document.querySelectorAll('#tableBody tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => {
        const img = td.querySelector('.cell-photo-icon');
        if (img) return '__IMG__' + img.dataset.imgId;
        return td.textContent;
      });
      rows.push(cells);
    });
    await idbSet('data', 'autosave', { title, rows, savedAt: Date.now() });

    // 이미지도 IndexedDB에 저장
    document.querySelectorAll('.cell-photo-icon').forEach(async el => {
      const id = el.dataset.imgId;
      if (!id) return;
      const src = el.dataset.imgSrc || localStorage.getItem('img_' + id);
      const name = el.dataset.imgName || localStorage.getItem('img_name_' + id);
      if (src) await idbSet('images', id, { src, name });
    });
  } catch (e) {
    console.error('IndexedDB 저장 실패:', e);
  }
}

// 변경 시 자동저장 (debounce 500ms)
let saveTimer = null;
function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveToStorage();
    showAutoSaveIndicator();
    autoSaveToDevice();
  }, 500);
}

document.getElementById('tableBody').addEventListener('input', scheduleAutoSave);
document.getElementById('docName').addEventListener('input', scheduleAutoSave);

// ════════════════════════════════════
// 토스트 알림 (alert 대체)
// ════════════════════════════════════
function showToast(msg, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.querySelector('.phone-frame').appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ════════════════════════════════════
// 불러오기
// ════════════════════════════════════
// ── 새로 시작 ──
document.getElementById('newBtn').addEventListener('click', () => {
  if (!confirm('현재 내용을 지우고 새로 시작할까요?')) return;
  document.getElementById('docName').textContent = '문서 제목';
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
      <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
      <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
      <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
    `;
    tbody.appendChild(tr);
  }
  localStorage.removeItem(STORAGE_KEY);
  showToast('✅ 새 문서가 시작됐습니다.');
});

// ── 불러오기 ──
document.getElementById('loadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  try {
    if (file.name.endsWith('.zip')) {
      // ── ZIP 불러오기 ──
      showToast('📂 불러오는 중...');
      const zip = await JSZip.loadAsync(file);

      // 사진 먼저 복원
      const photoMap = {};
      for (const [path, zipFile] of Object.entries(zip.files)) {
        if (path.startsWith('photos/') && !zipFile.dir) {
          const base64 = await zipFile.async('base64');
          const src = 'data:image/jpeg;base64,' + base64;
          // 파일명에서 id 추출 (photo_1_1234567890.jpg)
          const match = path.match(/_(\d{13})\.jpg$/);
          if (match) {
            const id = match[1];
            localStorage.setItem('img_' + id, src);
            photoMap[id] = src;
          }
        }
      }

      // txt 파일 찾아 복원
      let txtContent = null;
      for (const [path, zipFile] of Object.entries(zip.files)) {
        if (path.endsWith('.txt') && !zipFile.dir) {
          txtContent = await zipFile.async('string');
          break;
        }
      }
      if (txtContent) loadTxtContent(txtContent);
      showToast(`✅ 불러오기 완료 (사진 ${Object.keys(photoMap).length}장)`);

    } else {
      // ── TXT 불러오기 ──
      const reader = new FileReader();
      reader.onload = (ev) => {
        loadTxtContent(ev.target.result);
        showToast('✅ 불러오기 완료');
      };
      reader.readAsText(file);
    }
  } catch {
    showToast('❌ 파일을 읽을 수 없습니다.', 'error');
  }
});

function loadTxtContent(text) {
  const lines = text.split('\n');
  const title = lines[0].replace('제목:', '').trim();
  if (title) document.getElementById('docName').textContent = title;
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  lines.slice(2).forEach(line => {
    if (!line.trim()) return;
    const cells = line.split('\t');
    const tr = document.createElement('tr');
    tr.innerHTML = cells.map(cell => {
      if (cell.startsWith('__IMG__')) {
        const id = cell.replace('__IMG__', '');
        const src = localStorage.getItem('img_' + id) || '';
        return `<td contenteditable="false" style="text-align:center">${makeCellImg(id, src)}</td>`;
      }
      return `<td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true">${cell}</td>`;
    }).join('');
    tbody.appendChild(tr);
  });
  bindImgClick();
  saveToStorage();
}

// ════════════════════════════════════
// 저장 공통: txt 파일 생성
// ════════════════════════════════════
function buildTxtContent() {
  const title = document.getElementById('docName').textContent.trim() || '문서 제목';
  const rows = [];
  document.querySelectorAll('#tableBody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent);
    rows.push(cells);
  });
  const lines = [`제목:${title}`, ''];
  rows.forEach(row => lines.push(row.join('\t')));
  return { title, text: lines.join('\n') };
}

function buildTxtBlob() {
  const { title, text } = buildTxtContent();
  return { title, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };
}

// ════════════════════════════════════
// 저장 모달
// ════════════════════════════════════
document.getElementById('saveBtn').addEventListener('click', () => {
  document.getElementById('saveModal').classList.add('open');
});
document.getElementById('saveModalClose').addEventListener('click', () => {
  document.getElementById('saveModal').classList.remove('open');
});
document.getElementById('saveModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('saveModal'))
    document.getElementById('saveModal').classList.remove('open');
});

// ── 기기에 저장 (ZIP: 문서 + 사진폴더) ──
document.getElementById('saveDeviceBtn').addEventListener('click', async () => {
  document.getElementById('saveModal').classList.remove('open');
  showToast('📦 저장 파일 만드는 중...');

  const biz = document.getElementById('bizName').value.trim() || document.getElementById('docName').textContent.trim() || '문서';
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  const zipName = `${biz}-${dateStr}`;

  const zip = new JSZip();

  // ① 메인 문서 txt
  const { title, text } = buildTxtContent();
  zip.file(`${biz}.txt`, text);

  // ② 사진 폴더
  const photoIds = [];
  document.querySelectorAll('.cell-photo-icon').forEach(el => {
    const id = el.dataset.imgId;
    if (id && !photoIds.includes(id)) photoIds.push(id);
  });
  if (photoIds.length > 0) {
    const folder = zip.folder('사진');
    photoIds.forEach((id, idx) => {
      const src = localStorage.getItem('img_' + id) || '';
      if (!src) return;
      const base64 = src.replace(/^data:image\/\w+;base64,/, '');
      const name = localStorage.getItem('img_name_' + id) || `photo_${idx + 1}`;
      folder.file(`${name}_${id}.jpg`, base64, { base64: true });
    });
  }

  // ③ 산출 데이터 (입력된 경우만)
  const sanBody = document.querySelectorAll('#sanChulBody tr');
  const hasSanData = [...sanBody].some(tr =>
    [...tr.querySelectorAll('td')].some(td => td.textContent.trim())
  );
  const sanBiz = document.getElementById('sanChulBizName').value.trim() || biz;
  if (hasSanData) {
    const headers = [...document.querySelectorAll('#sanChulHeadRow th')].map(th => th.textContent);
    const rows = [...sanBody].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    const sanLines = [`사업장명:${sanBiz}`, `날짜:${dateStr}`, '', headers.join('\t')];
    rows.forEach(row => sanLines.push(row.join('\t')));
    zip.file(`산출-${sanBiz}-${dateStr}.txt`, sanLines.join('\n'));
  } else {
    zip.file(`산출-${sanBiz}-${dateStr}.txt`, '데이터 없음');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`✅ ${zipName}.zip 저장 완료`);
});

// ── 카카오톡 공유 ──
document.getElementById('saveKakaoBtn').addEventListener('click', async () => {
  const { title, blob } = buildTxtBlob();
  document.getElementById('saveModal').classList.remove('open');
  try {
    const file = new File([blob], `${title}.txt`, { type: 'text/plain' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
    } else if (navigator.share) {
      const text = await blob.text();
      await navigator.share({ title, text });
    } else {
      showToast('❌ 공유 기능을 지원하지 않는 브라우저입니다.', 'error');
    }
  } catch (err) {
    if (err.name !== 'AbortError') showToast('❌ 공유 실패: ' + err.message, 'error');
  }
});

// ════════════════════════════════════
// 구글 드라이브 (백엔드 API 사용)
// ════════════════════════════════════
let gFolderId   = localStorage.getItem('gdrive_folder_id')   || null;
let gFolderName = localStorage.getItem('gdrive_folder_name') || null;

// 로그인 상태 확인 및 헤더 표시
async function checkLoginStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateLoginUI(data);
  } catch {}
}

function updateLoginUI(data) {
  let loginBtn = document.getElementById('loginBtn');
  if (!loginBtn) {
    loginBtn = document.createElement('button');
    loginBtn.id = 'loginBtn';
    loginBtn.className = 'login-btn';
    document.querySelector('.app-header').appendChild(loginBtn);
  }
  if (data.loggedIn) {
    loginBtn.textContent = data.email.split('@')[0];
    loginBtn.onclick = async () => {
      await fetch('/auth/logout');
      updateLoginUI({ loggedIn: false });
      showToast('로그아웃됐습니다.');
    };
  } else {
    loginBtn.textContent = '구글 로그인';
    loginBtn.onclick = () => { window.location.href = '/auth/login'; };
  }
}

// checkLoginStatus();

// 폴더 선택 UI
let folderStack = [{ id: 'root', name: '내 드라이브' }];

async function openFolderPicker() {
  const res = await fetch('/api/status');
  const status = await res.json();
  if (!status.loggedIn) {
    window.location.href = '/auth/login';
    return;
  }
  folderStack = [{ id: 'root', name: '내 드라이브' }];
  await renderFolderList('root');
  document.getElementById('folderModal').classList.add('open');
}

async function renderFolderList(parentId) {
  const listEl = document.getElementById('folderList');
  const confirmBtn = document.getElementById('folderConfirmBtn');
  listEl.innerHTML = '<div class="folder-loading">불러오는 중...</div>';
  confirmBtn.style.display = 'none';

  // 브레드크럼
  const bc = document.getElementById('folderBreadcrumb');
  bc.innerHTML = folderStack.map((f, i) =>
    `<span class="bc-item" data-idx="${i}">${f.name}</span>`
  ).join(' › ');
  bc.querySelectorAll('.bc-item').forEach(el => {
    el.addEventListener('click', async () => {
      const idx = parseInt(el.dataset.idx);
      folderStack = folderStack.slice(0, idx + 1);
      await renderFolderList(folderStack[idx].id);
    });
  });

  try {
    const url = parentId === 'root'
      ? '/api/drive/folders'
      : `/api/drive/folders/${parentId}`;
    const res = await fetch(url);
    const folders = await res.json();

    listEl.innerHTML = '';

    // 현재 폴더 선택 버튼
    const current = folderStack[folderStack.length - 1];
    confirmBtn.style.display = 'flex';
    confirmBtn.querySelector('span').nextSibling.textContent = ` "${current.name}" 에 저장`;

    if (folders.length === 0) {
      listEl.innerHTML = '<div class="folder-empty">하위 폴더 없음</div>';
      return;
    }

    folders.forEach(f => {
      const item = document.createElement('button');
      item.className = 'folder-item';
      item.innerHTML = `<span>📁</span><span>${f.name}</span><span class="folder-arrow">›</span>`;
      item.addEventListener('click', async () => {
        folderStack.push({ id: f.id, name: f.name });
        await renderFolderList(f.id);
      });
      listEl.appendChild(item);
    });
  } catch (e) {
    listEl.innerHTML = '<div class="folder-empty">폴더를 불러올 수 없습니다.</div>';
  }
}

document.getElementById('folderConfirmBtn').addEventListener('click', () => {
  const selected = folderStack[folderStack.length - 1];
  gFolderId   = selected.id;
  gFolderName = selected.name;
  localStorage.setItem('gdrive_folder_id',   gFolderId);
  localStorage.setItem('gdrive_folder_name', gFolderName);
  document.getElementById('folderModal').classList.remove('open');
  showToast(`✅ 폴더 설정: ${gFolderName}`);
  driveUpload();
});

document.getElementById('folderModalClose').addEventListener('click', () => {
  document.getElementById('folderModal').classList.remove('open');
});

// Drive 업로드
async function driveUpload() {
  const { title, text } = buildTxtContent();
  showToast('📤 드라이브에 저장 중...');
  try {
    const res = await fetch('/api/drive/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content: text, folderId: gFolderId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`✅ 드라이브 저장 완료 (${gFolderName})`);
  } catch (e) {
    showToast('❌ 저장 실패: ' + e.message, 'error');
  }
}


// ════════════════════════════════════
// 행 추가
// ════════════════════════════════════
document.getElementById('addRowBtn').addEventListener('click', () => {
  const tbody = document.getElementById('tableBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
    <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
    <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
    <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
  `;
  tbody.appendChild(tr);
  scheduleAutoSave();
});

// ════════════════════════════════════
// 페이지 탭
// ════════════════════════════════════
document.querySelectorAll('.tab:not(.add-tab)').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

document.getElementById('addPageBtn').addEventListener('click', () => {
  const tabs = document.querySelector('.tabs-scroll');
  const addBtn = document.getElementById('addPageBtn');
  const count = document.querySelectorAll('.tab:not(.add-tab)').length + 1;
  const newTab = document.createElement('button');
  newTab.className = 'tab';
  newTab.dataset.page = count;
  newTab.textContent = count;
  newTab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    newTab.classList.add('active');
  });
  tabs.insertBefore(newTab, addBtn);
  newTab.click();
});

// ════════════════════════════════════
// 음성인식
// ════════════════════════════════════
const recordBtn = document.getElementById('recordBtn');
let isRecording = false;
let recognition = null;
let lastFocusedCell = null;

document.addEventListener('focusin', (e) => {
  if (e.target.closest('td[contenteditable]')) {
    lastFocusedCell = e.target.closest('td[contenteditable]');
  }
});

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('❌ 크롬 브라우저에서만 음성인식이 가능합니다.', 'error');
    return null;
  }
  const r = new SR();
  r.lang = 'ko-KR';
  r.continuous = true;
  r.interimResults = false;
  r.onresult = (e) => {
    const text = e.results[e.results.length - 1][0].transcript.trim();
    insertTextToCell(text);
    scheduleAutoSave();
  };
  r.onerror = (e) => {
    if (e.error !== 'aborted') showToast('음성인식 오류: ' + e.error, 'error');
  };
  r.onend = () => { if (isRecording) r.start(); };
  return r;
}

function insertTextToCell(text) {
  const cell = lastFocusedCell || document.querySelector('td[contenteditable]');
  if (!cell) return;
  const current = cell.textContent;
  cell.textContent = current ? current + ' ' + text : text;
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(cell);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

recordBtn.addEventListener('click', toggleRecording);
recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); toggleRecording(); });

function toggleRecording() {
  isRecording = !isRecording;
  if (isRecording) {
    recognition = initRecognition();
    if (!recognition) { isRecording = false; return; }
    recognition.start();
    recordBtn.classList.add('recording');
    recordBtn.textContent = '⏹';
    showRecordingIndicator(true);
  } else {
    if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '🎤';
    showRecordingIndicator(false);
  }
}

function showRecordingIndicator(on) {
  let indicator = document.getElementById('recIndicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.id = 'recIndicator';
    indicator.textContent = '● REC';
    document.querySelector('.app-header').prepend(indicator);
  }
  indicator.style.display = on ? 'flex' : 'none';
}

// ════════════════════════════════════
// 사진 삽입
// ════════════════════════════════════
function makeCellImg(id, src, name) {
  const label = name || localStorage.getItem('img_name_' + id) || '사진';
  return `<span class="cell-photo-icon" data-img-id="${id}" data-img-src="${src}" data-img-name="${label}" title="${label}">📷 <span class="photo-name">${label}</span></span>`;
}

function bindImgClick() {
  document.querySelectorAll('.cell-photo-icon').forEach(el => {
    el.onclick = () => {
      document.getElementById('imgModalSrc').src = el.dataset.imgSrc;
      document.getElementById('imgModalName').textContent = el.dataset.imgName || '사진';
      document.getElementById('imgModal').classList.add('open');
    };
  });
}

document.getElementById('imgModalClose').addEventListener('click', () => {
  document.getElementById('imgModal').classList.remove('open');
});
document.getElementById('imgModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('imgModal'))
    document.getElementById('imgModal').classList.remove('open');
});

function compressImage(file, maxPx, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        let w = image.width, h = image.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else       { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(image, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById('photoBtn').addEventListener('click', () => {
  document.getElementById('photoInput').click();
});

document.getElementById('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // 용량 체크 (원본 10MB 초과 시 경고)
  if (file.size > 10 * 1024 * 1024) {
    showToast('❌ 10MB 이하 사진만 가능합니다.', 'error');
    e.target.value = '';
    return;
  }

  showToast('📷 사진 처리 중...');
  const compressed = await compressImage(file, 600, 0.7);

  // localStorage 여유 공간 체크 (~5MB 한도)
  const usedKB = Math.round(JSON.stringify(localStorage).length / 1024);
  if (usedKB > 4500) {
    showToast('❌ 저장 공간 부족. 기기 저장 후 일부 사진을 삭제해주세요.', 'error');
    e.target.value = '';
    return;
  }

  const id = Date.now().toString();
  const imgName = file.name.replace(/\.[^/.]+$/, ''); // 확장자 제거
  localStorage.setItem('img_' + id, compressed);
  localStorage.setItem('img_name_' + id, imgName);

  const cell = lastFocusedCell || document.querySelector('td[contenteditable]');
  if (!cell) { showToast('❌ 먼저 셀을 선택해주세요.', 'error'); return; }

  cell.contentEditable = 'false';
  cell.innerHTML = makeCellImg(id, compressed, imgName);
  bindImgClick();
  scheduleAutoSave();
  showToast('✅ 사진 삽입 완료');
  e.target.value = '';
});

// ── Service Worker 등록 ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── 홈 화면 설치 안내 (최초 1회) ──
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (!localStorage.getItem('pwa_prompted')) {
    showToast('📲 홈 화면에 추가하면 데이터가 안전하게 보관됩니다.');
    localStorage.setItem('pwa_prompted', '1');
  }
});

// ════════════════════════════════════
// 문서 이름 편집
// ════════════════════════════════════
const docName = document.getElementById('docName');
docName.contentEditable = 'true';
docName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); docName.blur(); }
});

// ════════════════════════════════════
// 산출하기
// ════════════════════════════════════
let isSanChulMode = false;
let lastFocusedSanCell = null;

// 산출 모드 전환
document.getElementById('sanChulBtn').addEventListener('click', () => {
  isSanChulMode = !isSanChulMode;
  const memoArea   = document.querySelector('.memo-area');
  const sanArea    = document.getElementById('sanChulArea');
  const sanToolbar = document.getElementById('sanChulToolbar');
  const btn        = document.getElementById('sanChulBtn');

  if (isSanChulMode) {
    memoArea.style.display   = 'none';
    sanArea.style.display    = 'flex';
    sanToolbar.style.display = 'flex';
    btn.textContent = '메모';
    btn.style.background = '#007aff';
    btn.style.borderColor = '#007aff';
    // 사업장명 자동 입력
    const biz = document.getElementById('bizName').value.trim();
    if (biz) document.getElementById('sanChulBizName') && null; // 별도 입력 없음, bizName 공유
  } else {
    memoArea.style.display   = 'flex';
    sanArea.style.display    = 'none';
    sanToolbar.style.display = 'none';
    btn.textContent = '산출';
    btn.style.background = '#ff3b30';
    btn.style.borderColor = '#ff3b30';
  }
});

// 산출 셀 포커스 기억
document.getElementById('sanChulArea').addEventListener('focusin', (e) => {
  if (e.target.tagName === 'TD') lastFocusedSanCell = e.target;
});

// + 셀 숫자 증가
document.getElementById('scPlus').addEventListener('click', () => {
  if (!lastFocusedSanCell) return;
  const val = parseFloat(lastFocusedSanCell.textContent) || 0;
  lastFocusedSanCell.textContent = val + 1;
});

// - 셀 숫자 감소
document.getElementById('scMinus').addEventListener('click', () => {
  if (!lastFocusedSanCell) return;
  const val = parseFloat(lastFocusedSanCell.textContent) || 0;
  lastFocusedSanCell.textContent = val - 1;
});

// 행 추가
document.getElementById('scAddRow').addEventListener('click', () => {
  const tbody = document.getElementById('sanChulBody');
  const colCount = document.querySelectorAll('#sanChulHeadRow th').length;
  const tr = document.createElement('tr');
  for (let i = 0; i < colCount; i++) tr.innerHTML += `<td contenteditable="true"></td>`;
  tbody.appendChild(tr);
});

// 열 추가
document.getElementById('scAddCol').addEventListener('click', () => {
  const head = document.getElementById('sanChulHeadRow');
  const th = document.createElement('th');
  th.contentEditable = 'true';
  head.appendChild(th);
  document.querySelectorAll('#sanChulBody tr').forEach(tr => {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    tr.appendChild(td);
  });
});
