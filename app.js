// ════════════════════════════════════
// 자동저장 / 복원 (localStorage)
// ════════════════════════════════════
const STORAGE_KEY = 'voiceMemo_data';

function saveToStorage() {
  const title = document.getElementById('docName').textContent.trim() || '문서 제목';
  // 현재 페이지 데이터를 pageData에 반영
  pageData[currentPage] = getTableRows();

  sanPageData[currentSanPage] = getSanTableData();
  const data = { title, pageData, currentPage, sanPageData: { ...sanPageData }, currentSanPage };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.title) document.getElementById('docName').textContent = data.title;

    // 멀티페이지 복원
    if (data.pageData) {
      Object.assign(pageData, data.pageData);
      currentPage = data.currentPage || 1;
      restoreTabs(pageData, currentPage);
      loadPageRows(pageData[currentPage] || []);
    } else if (data.rows && data.rows.length) {
      // 구버전 단일페이지 호환
      pageData[1] = data.rows;
      loadPageRows(pageData[1]);
    }

    // 산출 멀티페이지 복원
    if (data.sanPageData) {
      Object.assign(sanPageData, data.sanPageData);
      currentSanPage = data.currentSanPage || 1;
      restoreSanTabs(sanPageData, currentSanPage);
      loadSanPageData(sanPageData[currentSanPage]);
    } else if (data.sanRows) {
      sanPageData[1] = { headers: data.sanHeaders || DEFAULT_SAN_HEADERS, rows: data.sanRows };
      loadSanPageData(sanPageData[1]);
    }
  } catch {}
}

// 탭 복원 헬퍼: pageData의 키 수만큼 탭 생성
function restoreTabs(savedPageData, savedCurrentPage) {
  const tabs = document.querySelector('.tabs-scroll');
  const addBtn = document.getElementById('addPageBtn');
  const keys = Object.keys(savedPageData).map(Number).sort((a, b) => a - b);
  // HTML에 이미 탭 1,2가 있으므로 3 이상부터 생성
  keys.forEach(k => {
    if (k <= 2) return;
    const newTab = document.createElement('button');
    newTab.className = 'tab';
    newTab.dataset.page = k;
    newTab.textContent = k;
    bindTabClick(newTab);
    tabs.insertBefore(newTab, addBtn);
  });
  // 활성 탭 표시
  document.querySelectorAll('#memoTabsScroll .tab:not(.add-tab)').forEach(t => {
    t.classList.toggle('active', parseInt(t.dataset.page) === savedCurrentPage);
  });
}

function restoreSanTabs(savedSanPageData, savedCurrentSanPage) {
  const scroll = document.getElementById('sanTabsScroll');
  const addBtn = document.getElementById('addSanPageBtn');
  const keys = Object.keys(savedSanPageData).map(Number).sort((a, b) => a - b);
  keys.forEach(k => {
    if (k <= 1) return; // HTML에 이미 1탭 있음
    const newTab = document.createElement('button');
    newTab.className = 'tab sc-tab';
    newTab.dataset.scPage = k;
    newTab.textContent = k;
    bindSanTabClick(newTab);
    scroll.insertBefore(newTab, addBtn);
  });
  document.querySelectorAll('.sc-tab').forEach(t => {
    t.classList.toggle('active', parseInt(t.dataset.scPage) === savedCurrentSanPage);
  });
}

// 페이지 로드 시 복원 (IndexedDB 우선, 없으면 localStorage)
async function restoreOnLoad() {
  try {
    const saved = await idbGet('data', 'autosave');
    if (saved) {
      document.getElementById('docName').textContent = saved.title || '문서 제목';
      // 메모 페이지 복원
      if (saved.pageData) {
        Object.assign(pageData, saved.pageData);
        currentPage = saved.currentPage || 1;
        restoreTabs(pageData, currentPage);
        await loadPageRows(pageData[currentPage] || []);
      } else if (saved.rows && saved.rows.length) {
        pageData[1] = saved.rows;
        currentPage = 1;
        await loadPageRows(pageData[1]);
      }
      // 산출 멀티페이지 복원
      if (saved.sanPageData) {
        Object.assign(sanPageData, saved.sanPageData);
        currentSanPage = saved.currentSanPage || 1;
        restoreSanTabs(sanPageData, currentSanPage);
        loadSanPageData(sanPageData[currentSanPage]);
      } else if (saved.sanRows) {
        // 구버전 단일 산출 호환
        sanPageData[1] = { headers: saved.sanHeaders || DEFAULT_SAN_HEADERS, rows: saved.sanRows };
        loadSanPageData(sanPageData[1]);
      }
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
    pageData[currentPage] = getTableRows();
    sanPageData[currentSanPage] = getSanTableData();
    await idbSet('data', 'autosave', { title, pageData: { ...pageData }, currentPage, sanPageData: { ...sanPageData }, currentSanPage, savedAt: Date.now() });

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

// 1초마다 자동저장 + 앱 전환시 즉시 저장
setInterval(() => { saveToStorage(); autoSaveToDevice(); }, 1000);
window.addEventListener('pagehide', () => { saveToStorage(); autoSaveToDevice(); });
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { saveToStorage(); autoSaveToDevice(); }
});

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

  // 메모 페이지 초기화 (1,2만 남기기)
  Object.keys(pageData).forEach(k => delete pageData[k]);
  currentPage = 1;
  document.querySelectorAll('#memoTabsScroll .tab:not(.add-tab)').forEach(tab => {
    if (parseInt(tab.dataset.page) > 2) tab.remove();
  });
  document.querySelectorAll('#memoTabsScroll .tab:not(.add-tab)').forEach(t => {
    t.classList.toggle('active', parseInt(t.dataset.page) === 1);
  });
  loadPageRows([]);

  // 산출 페이지 초기화 (1,2만 남기기)
  Object.keys(sanPageData).forEach(k => delete sanPageData[k]);
  currentSanPage = 1;
  document.querySelectorAll('#sanTabsScroll .sc-tab').forEach(tab => {
    if (parseInt(tab.dataset.scPage) > 2) tab.remove();
  });
  // 산출탭 2번이 없으면 생성
  if (!document.querySelector('#sanTabsScroll .sc-tab[data-sc-page="2"]')) {
    const addBtn = document.getElementById('addSanPageBtn');
    const tab2 = document.createElement('button');
    tab2.className = 'tab sc-tab';
    tab2.dataset.scPage = 2;
    tab2.textContent = 2;
    bindSanTabClick(tab2);
    document.getElementById('sanTabsScroll').insertBefore(tab2, addBtn);
  }
  document.querySelectorAll('#sanTabsScroll .sc-tab').forEach(t => {
    t.classList.toggle('active', parseInt(t.dataset.scPage) === 1);
  });
  loadSanPageData(null);

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
  // 현재 페이지 반영
  pageData[currentPage] = getTableRows();
  const lines = [`제목:${title}`, ''];
  const pageNums = Object.keys(pageData).map(Number).sort((a, b) => a - b);
  pageNums.forEach(pg => {
    if (pageNums.length > 1) lines.push(`=== ${pg}페이지 ===`);
    (pageData[pg] || []).forEach(row => lines.push(row.join('\t')));
  });
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
async function doSaveToDevice(customName) {
  showToast('📦 저장 파일 만드는 중...');

  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  const biz = customName || document.getElementById('docName').textContent.trim() || '문서';
  const zipName = `${biz}-${dateStr}`;

  const zip = new JSZip();

  // ① 메인 문서 txt
  const { title, text } = buildTxtContent();
  zip.file(`${biz}.txt`, text);

  // ② 사진 폴더 - 모든 페이지에서 수집
  const photoIds = [];
  const addPhotoId = id => { if (id && !photoIds.includes(id)) photoIds.push(id); };

  // 현재 페이지 DOM에서 수집
  document.querySelectorAll('.cell-photo-icon').forEach(el => addPhotoId(el.dataset.imgId));

  // 다른 페이지 pageData에서 수집 (__IMG__id 형식)
  Object.values(pageData).forEach(rows => {
    rows.forEach(row => row.forEach(cell => {
      if (typeof cell === 'string' && cell.startsWith('__IMG__')) {
        addPhotoId(cell.replace('__IMG__', ''));
      }
    }));
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

  // ③ 산출 멀티페이지
  sanPageData[currentSanPage] = getSanTableData();
  const sanPgNums = Object.keys(sanPageData).map(Number).sort((a, b) => a - b);
  const sanLines = [`날짜:${dateStr}`, ''];
  let hasSanData = false;
  sanPgNums.forEach(pg => {
    const d = sanPageData[pg];
    if (!d) return;
    const hasData = d.rows && d.rows.some(row => row.some(cell => cell.trim()));
    if (hasData) hasSanData = true;
    if (sanPgNums.length > 1) sanLines.push(`=== ${pg}페이지 ===`);
    sanLines.push(d.headers.join('\t'));
    d.rows.forEach(row => sanLines.push(row.join('\t')));
    sanLines.push('');
  });
  zip.file(`산출-${biz}-${dateStr}.txt`, hasSanData ? sanLines.join('\n') : '데이터 없음');

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
}

document.getElementById('saveDeviceBtn').addEventListener('click', () => {
  document.getElementById('saveModal').classList.remove('open');
  const defaultName = document.getElementById('docName').textContent.trim() || '문서';
  document.getElementById('filenameInput').value = defaultName;
  document.getElementById('filenameModal').classList.add('open');
  setTimeout(() => document.getElementById('filenameInput').focus(), 100);
});

document.getElementById('filenameConfirmBtn').addEventListener('click', () => {
  const name = document.getElementById('filenameInput').value.trim() || document.getElementById('docName').textContent.trim() || '문서';
  document.getElementById('filenameModal').classList.remove('open');
  doSaveToDevice(name);
});

document.getElementById('filenameModalClose').addEventListener('click', () => {
  document.getElementById('filenameModal').classList.remove('open');
});

document.getElementById('filenameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('filenameConfirmBtn').click();
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

// ── 페이지 삭제 ──
document.getElementById('delPageBtn').addEventListener('click', async () => {
  const allTabs = memoTabs();
  if (allTabs.length <= 1) {
    showToast('마지막 페이지는 삭제할 수 없습니다.', 'error');
    return;
  }

  const deletedPage = currentPage;
  const activeTab = document.querySelector(`#memoTabsScroll .tab[data-page="${deletedPage}"]`);
  if (activeTab) activeTab.remove();
  delete pageData[deletedPage];

  const remaining = memoTabs().sort((a, b) => parseInt(a.dataset.page) - parseInt(b.dataset.page));
  const newPageData = {};
  remaining.forEach((tab, i) => {
    const oldNum = parseInt(tab.dataset.page);
    const newNum = i + 1;
    if (pageData[oldNum]) newPageData[newNum] = pageData[oldNum];
    tab.dataset.page = newNum;
    tab.textContent = newNum;
  });
  Object.keys(pageData).forEach(k => delete pageData[k]);
  Object.assign(pageData, newPageData);

  currentPage = Math.min(deletedPage, remaining.length);
  remaining.forEach(tab => {
    tab.classList.toggle('active', parseInt(tab.dataset.page) === currentPage);
  });
  await loadPageRows(pageData[currentPage] || []);
  scheduleAutoSave();
  showToast(`${deletedPage}페이지 삭제됨`);
});

// ════════════════════════════════════
// 페이지 탭 (멀티페이지)
// ════════════════════════════════════
let currentPage = 1;
const pageData = {}; // { pageNum: rows[] }

function getTableRows() {
  const rows = [];
  document.querySelectorAll('#tableBody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => {
      const img = td.querySelector('.cell-photo-icon');
      if (img) return '__IMG__' + img.dataset.imgId;
      return td.textContent;
    });
    rows.push(cells);
  });
  return rows;
}

async function loadPageRows(rows) {
  const tbody = document.getElementById('tableBody');
  if (!rows || rows.length === 0) {
    tbody.innerHTML = Array(5).fill(0).map(() =>
      `<tr>
        <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
        <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
        <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
        <td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true"></td>
      </tr>`
    ).join('');
    return;
  }
  tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    const cells = [];
    for (const cell of row) {
      if (typeof cell === 'string' && cell.startsWith('__IMG__')) {
        const id = cell.replace('__IMG__', '');
        const imgData = await idbGet('images', id).catch(() => null);
        const src = imgData?.src || localStorage.getItem('img_' + id) || '';
        const name = imgData?.name || localStorage.getItem('img_name_' + id) || '사진';
        cells.push(`<td contenteditable="false" style="text-align:center">${makeCellImg(id, src, name)}</td>`);
      } else {
        cells.push(`<td contenteditable="true" inputmode="text" autocorrect="on" autocapitalize="sentences" spellcheck="true">${cell}</td>`);
      }
    }
    tr.innerHTML = cells.join('');
    tbody.appendChild(tr);
  }
  bindImgClick();
}

function switchToPage(pageNum) {
  // 현재 페이지 데이터 저장
  pageData[currentPage] = getTableRows();
  currentPage = pageNum;
  // 새 페이지 데이터 로드
  loadPageRows(pageData[currentPage] || []);
  scheduleAutoSave();
}

function memoTabs() {
  return [...document.querySelectorAll('#memoTabsScroll .tab:not(.add-tab)')];
}

function bindTabClick(tab) {
  tab.addEventListener('click', () => {
    const pg = parseInt(tab.dataset.page);
    if (pg === currentPage) return;
    memoTabs().forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    switchToPage(pg);
  });
}

document.querySelectorAll('#memoTabsScroll .tab:not(.add-tab)').forEach(bindTabClick);

document.getElementById('addPageBtn').addEventListener('click', () => {
  const scroll = document.getElementById('memoTabsScroll');
  const addBtn = document.getElementById('addPageBtn');
  const count = memoTabs().length + 1;
  const newTab = document.createElement('button');
  newTab.className = 'tab';
  newTab.dataset.page = count;
  newTab.textContent = count;
  bindTabClick(newTab);
  scroll.insertBefore(newTab, addBtn);
  memoTabs().forEach(t => t.classList.remove('active'));
  newTab.classList.add('active');
  switchToPage(count);
});

// ════════════════════════════════════
// 음성인식
// ════════════════════════════════════
const recordBtn = document.getElementById('recordBtn');
const recordBtn2 = document.getElementById('recordBtn2');
let isRecording = false;
let recognition = null;
let lastFocusedCell = null;
let lastFocusedTarget = null; // 셀 또는 제목

document.addEventListener('focusin', (e) => {
  if (e.target.closest('td[contenteditable]')) {
    lastFocusedCell = e.target.closest('td[contenteditable]');
    lastFocusedTarget = lastFocusedCell;
  } else if (e.target.id === 'docName') {
    lastFocusedTarget = e.target;
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
  const target = lastFocusedTarget || lastFocusedCell || document.querySelector('td[contenteditable]');
  if (!target) return;
  const current = target.textContent;
  target.textContent = current ? current + ' ' + text : text;
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(target);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  if (target.id === 'docName') scheduleAutoSave();
}

function syncMicBtns() {
  document.querySelectorAll('.record-btn').forEach(b => {
    b.classList.toggle('recording', isRecording);
    b.textContent = isRecording ? '⏹' : '🎤';
  });
}

// 200ms마다 강제 동기화
setInterval(syncMicBtns, 200);

recordBtn.addEventListener('click', toggleRecording);

function toggleRecording() {
  isRecording = !isRecording;
  if (isRecording) {
    recognition = initRecognition();
    if (!recognition) { isRecording = false; return; }
    recognition.start();
    syncMicBtns();
    showRecordingIndicator(true);
  } else {
    if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
    syncMicBtns();
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
  document.getElementById('photoModal').classList.add('open');
});
document.getElementById('photoCameraBtn').addEventListener('click', () => {
  document.getElementById('photoModal').classList.remove('open');
  document.getElementById('photoInput').click();
});
document.getElementById('photoGalleryBtn').addEventListener('click', () => {
  document.getElementById('photoModal').classList.remove('open');
  document.getElementById('photoGalleryInput').click();
});
document.getElementById('photoModalClose').addEventListener('click', () => {
  document.getElementById('photoModal').classList.remove('open');
});

async function handlePhotoFile(e) {
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
  const imgCounter = (parseInt(localStorage.getItem('imgCounter') || '0')) + 1;
  localStorage.setItem('imgCounter', imgCounter);
  const imgName = String(imgCounter);
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
}
document.getElementById('photoInput').addEventListener('change', handlePhotoFile);
document.getElementById('photoGalleryInput').addEventListener('change', handlePhotoFile);

// ════════════════════════════════════
// 산출 멀티페이지
// ════════════════════════════════════
const DEFAULT_SAN_HEADERS = ['층', '소화기', '주방자동소화장치', '점검결과', '피난기구'];
let currentSanPage = 1;
const sanPageData = {}; // { pageNum: { headers:[], rows:[] } }

function getSanTableData() {
  const headers = [...document.querySelectorAll('#sanChulHeadRow th')].map(th => th.textContent);
  const rows    = [...document.querySelectorAll('#sanChulBody tr')].map(tr =>
    [...tr.querySelectorAll('td')].map(td => td.textContent)
  );
  return { headers, rows };
}

function loadSanPageData(data) {
  const headers = data?.headers || DEFAULT_SAN_HEADERS;
  const colCount = headers.length;
  const headRow = document.getElementById('sanChulHeadRow');
  headRow.innerHTML = headers.map(h =>
    `<th contenteditable="true" inputmode="text" spellcheck="false">${h}</th>`
  ).join('');
  const sanBody = document.getElementById('sanChulBody');
  const emptyRow = () =>
    `<tr>${Array(colCount).fill('<td contenteditable="true"></td>').join('')}</tr>`;

  const rows = data?.rows;
  const hasData = rows && rows.length > 0 && rows.some(r => r.length > 0);
  if (hasData) {
    // 모든 행의 셀 수를 헤더에 맞춰 정규화
    sanBody.innerHTML = rows.map(row => {
      const cells = Array(colCount).fill('').map((_, i) => row[i] ?? '');
      return `<tr>${cells.map(cell => `<td contenteditable="true">${cell}</td>`).join('')}</tr>`;
    }).join('');
  } else {
    sanBody.innerHTML = Array(3).fill(null).map(emptyRow).join('');
  }
}

function switchToSanPage(pageNum) {
  sanPageData[currentSanPage] = getSanTableData();
  currentSanPage = pageNum;
  loadSanPageData(sanPageData[currentSanPage]);
  scheduleAutoSave();
}

function bindSanTabClick(tab) {
  tab.addEventListener('click', () => {
    const pg = parseInt(tab.dataset.scPage);
    if (pg === currentSanPage) return;
    document.querySelectorAll('.sc-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    switchToSanPage(pg);
  });
}

document.querySelectorAll('.sc-tab').forEach(bindSanTabClick);

document.getElementById('addSanPageBtn').addEventListener('click', () => {
  const scroll = document.getElementById('sanTabsScroll');
  const addBtn = document.getElementById('addSanPageBtn');
  const count  = document.querySelectorAll('.sc-tab').length + 1;
  const newTab = document.createElement('button');
  newTab.className = 'tab sc-tab';
  newTab.dataset.scPage = count;
  newTab.textContent = count;
  bindSanTabClick(newTab);
  scroll.insertBefore(newTab, addBtn);
  document.querySelectorAll('.sc-tab').forEach(t => t.classList.remove('active'));
  newTab.classList.add('active');
  switchToSanPage(count);
});

document.getElementById('delSanPageBtn').addEventListener('click', async () => {
  const allTabs = [...document.querySelectorAll('.sc-tab')];
  if (allTabs.length <= 1) {
    showToast('마지막 페이지는 삭제할 수 없습니다.', 'error');
    return;
  }
  const deletedPage = currentSanPage;
  const activeTab = document.querySelector(`.sc-tab[data-sc-page="${deletedPage}"]`);
  if (activeTab) activeTab.remove();
  delete sanPageData[deletedPage];

  const remaining = [...document.querySelectorAll('.sc-tab')]
    .sort((a, b) => parseInt(a.dataset.scPage) - parseInt(b.dataset.scPage));
  const newData = {};
  remaining.forEach((tab, i) => {
    const oldNum = parseInt(tab.dataset.scPage);
    const newNum = i + 1;
    if (sanPageData[oldNum]) newData[newNum] = sanPageData[oldNum];
    tab.dataset.scPage = newNum;
    tab.textContent = newNum;
  });
  Object.keys(sanPageData).forEach(k => delete sanPageData[k]);
  Object.assign(sanPageData, newData);

  currentSanPage = Math.min(deletedPage, remaining.length);
  remaining.forEach(tab => {
    tab.classList.toggle('active', parseInt(tab.dataset.scPage) === currentSanPage);
  });
  loadSanPageData(sanPageData[currentSanPage]);
  scheduleAutoSave();
  showToast(`산출 ${deletedPage}페이지 삭제됨`);
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

function setMode(sanChul) {
  isSanChulMode = sanChul;
  const memoArea      = document.querySelector('.memo-area');
  const sanArea       = document.getElementById('sanChulArea');
  const sanToolbar    = document.getElementById('sanChulToolbar');
  const pageTabsRow   = document.getElementById('pageTabsRow');
  const sanPageTabsRow = document.getElementById('sanPageTabsRow');

  document.getElementById('memoModeBtn').classList.toggle('active', !sanChul);
  document.getElementById('sanChulBtn').classList.toggle('active', sanChul);

  const scBtns = document.querySelectorAll('.sc-num-btn');
  if (sanChul) {
    memoArea.style.display       = 'none';
    sanArea.style.display        = 'flex';
    sanToolbar.style.display     = 'flex';
    pageTabsRow.style.display    = 'none';
    sanPageTabsRow.style.display = 'flex';
    scBtns.forEach(b => b.style.display = 'flex');
  } else {
    memoArea.style.display       = 'flex';
    sanArea.style.display        = 'none';
    sanToolbar.style.display     = 'none';
    pageTabsRow.style.display    = 'flex';
    sanPageTabsRow.style.display = 'none';
    scBtns.forEach(b => b.style.display = 'none');
  }
}

document.getElementById('memoModeBtn').addEventListener('click', () => setMode(false));
document.getElementById('sanChulBtn').addEventListener('click',  () => setMode(true));

// 산출 셀 포커스 기억
document.getElementById('sanChulArea').addEventListener('focusin', (e) => {
  if (e.target.tagName === 'TD') {
    document.querySelectorAll('.sanchul-table td.selected').forEach(td => td.classList.remove('selected'));
    e.target.classList.add('selected');
    lastFocusedSanCell = e.target;
  }
});
document.getElementById('sanChulArea').addEventListener('input', scheduleAutoSave);

// + 셀 숫자 증가
document.getElementById('scPlus').addEventListener('click', () => {
  if (!lastFocusedSanCell) return;
  const text = lastFocusedSanCell.textContent.trim();
  if (text !== '' && isNaN(Number(text))) return;
  const val = Number(text) || 0;
  lastFocusedSanCell.textContent = val + 1;
  scheduleAutoSave();
});

// - 셀 숫자 감소
document.getElementById('scMinus').addEventListener('click', () => {
  if (!lastFocusedSanCell) return;
  const text = lastFocusedSanCell.textContent.trim();
  if (text !== '' && isNaN(Number(text))) return;
  const val = Number(text) || 0;
  lastFocusedSanCell.textContent = val - 1;
  scheduleAutoSave();
});

// 행 추가
document.getElementById('scAddRow').addEventListener('click', () => {
  const tbody = document.getElementById('sanChulBody');
  const colCount = document.querySelectorAll('#sanChulHeadRow th').length;
  const tr = document.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    td.setAttribute('inputmode', 'text');
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
  scheduleAutoSave();
});

// 열 추가
document.getElementById('scAddCol').addEventListener('click', () => {
  const head = document.getElementById('sanChulHeadRow');
  const th = document.createElement('th');
  th.contentEditable = 'true';
  th.setAttribute('inputmode', 'text');
  th.spellcheck = false;
  th.textContent = '열' + (head.children.length + 1);
  head.appendChild(th);
  document.querySelectorAll('#sanChulBody tr').forEach(tr => {
    const td = document.createElement('td');
    td.contentEditable = 'true';
    td.setAttribute('inputmode', 'text');
    tr.appendChild(td);
  });
  scheduleAutoSave();
});
