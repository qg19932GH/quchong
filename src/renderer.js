// DOM Elements
const dropZone = document.getElementById('dropZone');
const btnSelectDir = document.getElementById('btnSelectDir');
const selectedPathText = document.getElementById('selectedPathText');
const btnStartScan = document.getElementById('btnStartScan');
const btnCancelScan = document.getElementById('btnCancelScan');

const scanProgressSection = document.getElementById('scanProgressSection');
const scanStatus = document.getElementById('scanStatus');
const progressDetailText = document.getElementById('progressDetailText');
const progressBarFill = document.getElementById('progressBarFill');
const currentDirText = document.getElementById('currentDirText');

const resultsSection = document.getElementById('resultsSection');
const summaryText = document.getElementById('summaryText');
const searchInput = document.getElementById('searchInput');
const duplicateList = document.getElementById('duplicateList');
const emptyState = document.getElementById('emptyState');

// Modal Elements
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalBodySingle = document.getElementById('modalBodySingle');
const modalBodyGroup = document.getElementById('modalBodyGroup');
const modalFileName = document.getElementById('modalFileName');
const modalFilePath = document.getElementById('modalFilePath');
const modalFileListKeep = document.getElementById('modalFileListKeep');
const modalFileListDelete = document.getElementById('modalFileListDelete');
const modalBtnCancel = document.getElementById('modalBtnCancel');
const modalBtnConfirm = document.getElementById('modalBtnConfirm');

// State Variables
let selectedDirPath = null;
let duplicatesData = [];
let fileToDelete = null; // { filePath, element, groupKey }
let isGroupDelete = false;
let groupToDelete = null; // { key, files }
let filesToDeleteInGroup = [];
let isFolderDelete = false;
let folderPairIndexToDelete = null;
let activeMirrorFolders = [];

// Helper: Format Bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper: Format Timestamp to readable date
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.getFullYear() + '-' + 
         String(date.getMonth() + 1).padStart(2, '0') + '-' + 
         String(date.getDate()).padStart(2, '0') + ' ' + 
         String(date.getHours()).padStart(2, '0') + ':' + 
         String(date.getMinutes()).padStart(2, '0');
}

// Helper: Format Duration to readable string (HH:MM:SS or MM:SS)
function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Update UI with selected directory path
function updateSelectedDirectory(dirPath) {
  if (dirPath) {
    selectedDirPath = dirPath;
    selectedPathText.textContent = dirPath;
    selectedPathText.style.color = 'var(--text-secondary)';
    btnStartScan.disabled = false;
  } else {
    selectedDirPath = null;
    selectedPathText.textContent = '未选择任何文件夹';
    selectedPathText.style.color = 'var(--text-muted)';
    btnStartScan.disabled = true;
  }
}

// Drag & Drop event listeners
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  
  if (e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.path) {
      updateSelectedDirectory(file.path);
      // Start scanning immediately!
      btnStartScan.click();
    }
  }
});

// Click to select folder
btnSelectDir.addEventListener('click', async (e) => {
  e.stopPropagation(); // Avoid triggering dropZone click if nested
  const path = await window.electronAPI.selectDirectory();
  if (path) {
    updateSelectedDirectory(path);
  }
});

dropZone.addEventListener('click', async () => {
  if (!selectedDirPath) {
    const path = await window.electronAPI.selectDirectory();
    if (path) {
      updateSelectedDirectory(path);
    }
  }
});

// Start Scanning
btnStartScan.addEventListener('click', () => {
  if (!selectedDirPath) return;
  
  // Update Buttons
  btnStartScan.style.display = 'none';
  btnCancelScan.style.display = 'inline-flex';
  
  // Show/Hide sections
  scanProgressSection.style.display = 'block';
  resultsSection.style.display = 'none';
  emptyState.style.display = 'none';
  
  // Reset Progress UI
  scanStatus.textContent = '正在检索目录中...';
  scanStatus.className = 'status-badge pulse-badge';
  progressDetailText.textContent = '已扫描视频: 0 | 识别番号: 0';
  progressBarFill.style.width = '5%';
  currentDirText.textContent = '当前正在扫描根目录...';
  
  duplicatesData = [];
  duplicateList.innerHTML = '';
  
  // Trigger main scan
  window.electronAPI.startScan(selectedDirPath);
});

// Cancel Scanning
btnCancelScan.addEventListener('click', () => {
  window.electronAPI.cancelScan();
  scanStatus.textContent = '正在取消扫描...';
  btnCancelScan.disabled = true;
});

// IPC: Scan Progress Updates
const unsubscribeProgress = window.electronAPI.onScanProgress((data) => {
  if (data.cancelled) {
    resetScanButtons();
    scanProgressSection.style.display = 'none';
    return;
  }
  
  progressDetailText.textContent = `已扫描视频: ${data.scannedCount} | 识别番号: ${data.matchedCount}`;
  currentDirText.textContent = `当前目录: ${data.currentDir || ''}`;
  
  // Indeterminate visual progression: increment slightly but keep it moving
  let currentWidth = parseFloat(progressBarFill.style.width) || 0;
  if (currentWidth < 90) {
    progressBarFill.style.width = (currentWidth + 2) + '%';
  }
});

// IPC: Scan Error
const unsubscribeError = window.electronAPI.onScanError((errMsg) => {
  resetScanButtons();
  scanProgressSection.style.display = 'none';
  alert(`扫描出错: ${errMsg}`);
});

// IPC: Scan Done
const unsubscribeDone = window.electronAPI.onScanDone((results) => {
  resetScanButtons();
  
  // Set progress to 100% and hide progress section after a tiny delay
  progressBarFill.style.width = '100%';
  scanStatus.textContent = '扫描完成！';
  scanStatus.className = 'status-badge';
  scanStatus.style.backgroundColor = 'var(--success-light)';
  scanStatus.style.color = 'var(--success-text)';
  
  setTimeout(() => {
    scanProgressSection.style.display = 'none';
    renderResults(results);
  }, 600);
});

function resetScanButtons() {
  btnStartScan.style.display = 'inline-flex';
  btnCancelScan.style.display = 'none';
  btnCancelScan.disabled = false;
}

// Render Results to UI
function renderResults(results) {
  duplicatesData = results.duplicates || [];
  
  resultsSection.style.display = 'block';
  summaryText.innerHTML = `共扫描到 <strong style="color:var(--primary)">${results.scannedCount}</strong> 个视频文件，识别出 <strong style="color:var(--primary)">${results.matchedCount}</strong> 个带番号的视频。共发现 <strong style="color:var(--danger)">${duplicatesData.length}</strong> 组重复文件。`;
  
  searchInput.value = ''; // Clear search
  updateMirrorFolders();  // Compute and draw mirror folders panel
  filterAndRenderList('');
}

// Filter and render list based on search query
function filterAndRenderList(query) {
  duplicateList.innerHTML = '';

  // Hide mirror folders panel during searches for a clean interface
  if (mirrorSection) {
    mirrorSection.style.display = query ? 'none' : (activeMirrorFolders.length > 0 ? 'flex' : 'none');
  }

  const filtered = duplicatesData.filter(group => {
    if (!query) return true;
    const q = query.toUpperCase();
    if (group.key.includes(q)) return true;
    return group.files.some(file => file.name.toUpperCase().includes(q) || file.path.toUpperCase().includes(q));
  });

  if (filtered.length === 0) {
    if (duplicatesData.length === 0) {
      emptyState.style.display = 'flex';
    } else {
      duplicateList.innerHTML = '<p class="text-muted" style="text-align:center; padding: 40px 0;">没有找到匹配搜索条件的结果...</p>';
    }
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(group => {
    const isAd = group.key === '[ADVERTISEMENT]';

    // Calculate total wasted size (files - 1 size, or all if ad)
    const sizes = group.files.map(f => f.size);
    const maxSize = Math.max(...sizes);
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    const wastedSize = isAd ? totalSize : (totalSize - maxSize); // Estimate wasted space

    const groupCard = document.createElement('div');
    groupCard.className = isAd ? 'duplicate-group ad-group' : 'duplicate-group';
    groupCard.dataset.key = group.key;

    const groupKeyText = isAd ? '⚠️ 广告宣传视频' : group.key;
    const badgeText = isAd ? `${group.files.length} 个广告` : `${group.files.length} 个重复`;
    const badgeClass = isAd ? 'group-badge ad-badge' : 'group-badge';
    const buttonText = isAd ? '一键清理广告' : '一键去重';
    const buttonTitle = isAd ? '清理所有广告视频，一个不留' : '一键去重（保留最大文件，清理其余重复视频）';

    // Header
    const headerHtml = `
      <div class="group-header">
        <div class="group-title">
          <span class="group-key">${groupKeyText}</span>
          <span class="${badgeClass}">${badgeText}</span>
        </div>
        <div class="group-actions">
          <span class="group-info">${isAd ? '垃圾广告体积' : '重复占用空间'}: <strong>${formatBytes(wastedSize)}</strong></span>
          <button class="btn btn-group-dedup" title="${buttonTitle}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            ${buttonText}
          </button>
        </div>
      </div>
    `;

    // Files List
    const filesContainer = document.createElement('div');
    filesContainer.className = 'group-files';

    group.files.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.dataset.path = file.path;

      const isChecked = index === 0 && group.key !== '[ADVERTISEMENT]';

      fileItem.innerHTML = `
        <div class="file-select-wrapper">
          <input type="checkbox" class="file-keep-checkbox" ${isChecked ? 'checked' : ''} title="勾选以保留此文件，未勾选的文件在一键去重时将被送入回收站">
        </div>
        <div class="file-main-info">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-video-icon">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
          <div class="file-details">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <div class="file-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                <span>${formatBytes(file.size)}</span>
              </div>
              ${file.resolution ? `
              <div class="file-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                <span>${file.resolution}</span>
              </div>
              ` : ''}
              ${file.duration ? `
              <div class="file-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>${formatDuration(file.duration)}</span>
              </div>
              ` : ''}
              <div class="file-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span>${formatDate(file.mtime)}</span>
              </div>
            </div>
            <div class="file-path">${file.path}</div>
          </div>
        </div>
        <div class="file-actions">
          <button class="action-icon-btn btn-folder-action" title="打开所在文件夹并定位文件">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button class="action-icon-btn btn-trash-action" title="移至回收站">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;

      // Button Actions binding
      fileItem.querySelector('.btn-folder-action').addEventListener('click', () => {
        window.electronAPI.openFolder(file.path);
      });

      fileItem.querySelector('.btn-trash-action').addEventListener('click', () => {
        showDeleteConfirmation(file.path, file.name, fileItem, group.key);
      });

      filesContainer.appendChild(fileItem);
    });

    groupCard.innerHTML = headerHtml;

    // Bind group dedup button
    const btnGroupDedup = groupCard.querySelector('.btn-group-dedup');
    if (btnGroupDedup) {
      btnGroupDedup.addEventListener('click', () => {
        showGroupDeleteConfirmation(group);
      });
    }

    groupCard.appendChild(filesContainer);
    duplicateList.appendChild(groupCard);
  });
}

// Search input event
searchInput.addEventListener('input', (e) => {
  filterAndRenderList(e.target.value);
});

// Show modal dialog to confirm single file deletion
function showDeleteConfirmation(filePath, fileName, element, groupKey) {
  isGroupDelete = false;
  fileToDelete = { filePath, element, groupKey };
  
  modalTitle.textContent = '确认删除文件';
  modalBodySingle.style.display = 'block';
  modalBodyGroup.style.display = 'none';
  
  modalFileName.textContent = fileName;
  modalFilePath.textContent = filePath;
  confirmModal.classList.add('active');
}

// Show modal dialog to confirm one-click group deduplication
function showGroupDeleteConfirmation(group) {
  isGroupDelete = true;
  groupToDelete = group;
  
  const isAd = group.key === '[ADVERTISEMENT]';
  modalTitle.textContent = isAd ? '一键清理广告确认' : '一键去重确认';
  modalBodySingle.style.display = 'none';
  modalBodyGroup.style.display = 'flex';
  modalBodyGroup.style.flexDirection = 'column';

  const keepSection = confirmModal.querySelector('.modal-section-keep');
  const deleteTitle = confirmModal.querySelector('.modal-section-delete .modal-section-title span');

  // Query DOM to check the state of the checkmarks
  const groupCard = document.querySelector(`.duplicate-group[data-key="${group.key}"]`);
  let keepFiles = [];
  let deleteFiles = [];

  if (groupCard) {
    const fileItems = groupCard.querySelectorAll('.file-item');
    fileItems.forEach(item => {
      const filePath = item.dataset.path;
      if (item.classList.contains('is-deleted')) return;

      const checkbox = item.querySelector('.file-keep-checkbox');
      const isChecked = checkbox ? checkbox.checked : false;
      const fileData = group.files.find(f => f.path === filePath);
      
      if (fileData) {
        if (isChecked) {
          keepFiles.push(fileData);
        } else {
          deleteFiles.push(fileData);
        }
      }
    });
  } else {
    // Fallback if card is not found in DOM
    if (isAd) {
      deleteFiles = [...group.files];
    } else {
      keepFiles = [group.files[0]];
      deleteFiles = group.files.slice(1);
    }
  }

  filesToDeleteInGroup = deleteFiles;

  // Render Keep Files list
  if (keepFiles.length === 0) {
    if (keepSection) keepSection.style.display = 'none';
  } else {
    if (keepSection) keepSection.style.display = 'block';
    modalFileListKeep.innerHTML = '';
    keepFiles.forEach(file => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="modal-file-keep-name">${file.name}</div>
        <div class="modal-file-keep-path">${file.path}</div>
      `;
      modalFileListKeep.appendChild(li);
    });
  }

  // Render Delete Files list
  if (deleteTitle) {
    deleteTitle.textContent = isAd ? '移至回收站 (清理所有广告)' : '移至回收站 (清理重复)';
    deleteTitle.className = 'badge badge-danger';
  }
  
  modalFileListDelete.innerHTML = '';
  deleteFiles.forEach(file => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="modal-file-delete-name">${file.name}</div>
      <div class="modal-file-delete-path">${file.path}</div>
    `;
    modalFileListDelete.appendChild(li);
  });
  
  confirmModal.classList.add('active');
}

// --- NEW: Mirror Folders Batch Deduplicator ---

const mirrorSection = document.getElementById('mirrorSection');

function shortenPath(p, maxLen = 65) {
  if (p.length <= maxLen) return p;
  const drive = p.substring(0, 15);
  const end = p.substring(p.length - (maxLen - 18));
  return `${drive}...${end}`;
}

function updateMirrorFolders() {
  if (!mirrorSection) return;
  mirrorSection.innerHTML = '';
  
  activeMirrorFolders = detectMirrorFolderGroups(duplicatesData);
  
  if (activeMirrorFolders.length === 0) {
    mirrorSection.style.display = 'none';
    return;
  }
  
  mirrorSection.style.display = 'flex';
  
  activeMirrorFolders.forEach((pair, index) => {
    const card = document.createElement('div');
    card.className = 'mirror-card';
    card.dataset.index = index;
    card.innerHTML = `
      <div class="mirror-card-header">
        <div class="mirror-card-title-group">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mirror-folder-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <h4>检测到镜像重复文件夹组 (共 ${pair.directories.length} 个目录相互重复)</h4>
        </div>
        <div class="mirror-card-actions-header" style="display:flex; align-items:center; gap: 12px;">
          <span class="badge-mirror">涵盖 ${pair.keys.length} 组重复番号</span>
          <button class="btn btn-primary btn-sm btn-batch-dedup-folders" data-index="${index}" style="background-color: var(--primary); border-color: var(--primary); color:#fff; font-weight:600; padding: 5px 14px; border-radius: 6px;">
            一键去重文件夹
          </button>
        </div>
      </div>
      <div class="mirror-card-body">
        ${pair.directories.map((dir, dIdx) => {
          const isChecked = dIdx === 0;
          return `
            <div class="mirror-folder-row" data-path="${dir.replace(/"/g, '&quot;')}">
              <div class="mirror-folder-info">
                <input type="checkbox" class="folder-keep-checkbox" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; margin-right:8px; accent-color: var(--primary); cursor:pointer;" title="勾选保留该文件夹中的视频，未勾选的文件在一键去重时将被删除">
                <span class="folder-label" style="${isChecked ? 'color:var(--success-text); font-weight:bold;' : 'color:var(--text-secondary); font-weight:bold;'}">
                  ${isChecked ? '保留：' : '清理：'}
                </span>
                <span class="folder-path" title="${dir}">${shortenPath(dir)}</span>
              </div>
              <button class="btn btn-secondary btn-sm btn-open-folder" data-path="${dir.replace(/"/g, '&quot;')}" style="padding: 5px 10px; font-size: 0.72rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                打开目录
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
    
    // Bind checkbox change events for interactive labels
    const checkboxes = card.querySelectorAll('.folder-keep-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const row = cb.closest('.mirror-folder-row');
        const label = row.querySelector('.folder-label');
        if (cb.checked) {
          label.textContent = '保留：';
          label.style.color = 'var(--success-text)';
        } else {
          label.textContent = '清理：';
          label.style.color = 'var(--text-secondary)';
        }
      });
    });

    // Bind open folder action buttons
    const openFolderButtons = card.querySelectorAll('.btn-open-folder');
    openFolderButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const dirPath = btn.dataset.path;
        window.electronAPI.openFolder(dirPath);
      });
    });

    // Bind batch deduplication button click event
    const batchButton = card.querySelector('.btn-batch-dedup-folders');
    if (batchButton) {
      batchButton.addEventListener('click', () => {
        showFolderDeleteConfirmation(pair, index);
      });
    }

    mirrorSection.appendChild(card);
  });
}

function detectMirrorFolderGroups(duplicates) {
  const dirToKeys = new Map();
  const dirToFiles = new Map();

  duplicates.forEach(group => {
    if (group.key === '[ADVERTISEMENT]') return;

    group.files.forEach(file => {
      const dir = file.path.substring(0, file.path.lastIndexOf(file.path.includes('\\') ? '\\' : '/'));
      if (!dirToKeys.has(dir)) {
        dirToKeys.set(dir, new Set());
        dirToFiles.set(dir, new Set());
      }
      dirToKeys.get(dir).add(group.key);
      dirToFiles.get(dir).add(file.path);
    });
  });

  const dirs = Array.from(dirToKeys.keys());
  const adj = new Map();
  dirs.forEach(d => adj.set(d, new Set()));

  // Connect directories sharing >= 2 duplicate keys
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      const dirA = dirs[i];
      const dirB = dirs[j];
      const keysA = dirToKeys.get(dirA);
      const keysB = dirToKeys.get(dirB);

      let intersectionCount = 0;
      keysA.forEach(k => {
        if (keysB.has(k)) intersectionCount++;
      });

      if (intersectionCount >= 2) {
        adj.get(dirA).add(dirB);
        adj.get(dirB).add(dirA);
      }
    }
  }

  const visited = new Set();
  const groups = [];

  dirs.forEach(dir => {
    if (!visited.has(dir)) {
      const component = [];
      const queue = [dir];
      visited.add(dir);

      while (queue.length > 0) {
        const u = queue.shift();
        component.push(u);

        adj.get(u).forEach(v => {
          if (!visited.has(v)) {
            visited.add(v);
            queue.push(v);
          }
        });
      }

      if (component.length >= 2) {
        const componentKeys = new Set();
        component.forEach(d => {
          dirToKeys.get(d).forEach(k => componentKeys.add(k));
        });

        let totalFilesCount = 0;
        component.forEach(d => {
          totalFilesCount += dirToFiles.get(d).size;
        });

        groups.push({
          directories: component.sort(),
          keys: Array.from(componentKeys),
          totalFilesCount
        });
      }
    }
  });

  groups.sort((a, b) => b.totalFilesCount - a.totalFilesCount);
  return groups;
}

function showFolderDeleteConfirmation(pair, pairIndex) {
  const card = document.querySelector(`.mirror-card[data-index="${pairIndex}"]`);
  if (!card) return;

  const keepDirs = [];
  const deleteDirs = [];

  const rows = card.querySelectorAll('.mirror-folder-row');
  rows.forEach(row => {
    const dirPath = row.dataset.path;
    const checkbox = row.querySelector('.folder-keep-checkbox');
    if (checkbox && checkbox.checked) {
      keepDirs.push(dirPath);
    } else {
      deleteDirs.push(dirPath);
    }
  });

  if (keepDirs.length === 0) {
    alert('请至少勾选保留一个文件夹！如果想清理所有文件，请在主列表中手动操作。');
    return;
  }

  if (deleteDirs.length === 0) {
    alert('您已勾选保留所有文件夹，没有需要清理的文件。请取消勾选不需要的文件夹进行清理。');
    return;
  }

  isGroupDelete = false;
  isFolderDelete = true;
  folderPairIndexToDelete = pairIndex;

  modalTitle.textContent = '批量清理镜像文件夹';
  modalBodySingle.style.display = 'none';
  modalBodyGroup.style.display = 'flex';
  modalBodyGroup.style.flexDirection = 'column';

  const keepSection = confirmModal.querySelector('.modal-section-keep');
  const deleteTitle = confirmModal.querySelector('.modal-section-delete .modal-section-title span');

  if (keepSection) keepSection.style.display = 'block';
  if (deleteTitle) {
    deleteTitle.textContent = '移至回收站 (批量清理重复)';
    deleteTitle.className = 'badge badge-danger';
  }

  const keepFiles = [];
  const deleteFiles = [];

  pair.keys.forEach(key => {
    const group = duplicatesData.find(g => g.key === key);
    if (!group) return;

    group.files.forEach(file => {
      const isDeleted = Array.from(document.querySelectorAll('.file-item')).find(item => item.dataset.path === file.path)?.classList.contains('is-deleted');
      if (isDeleted) return;

      const fileDir = file.path.substring(0, file.path.lastIndexOf(file.path.includes('\\') ? '\\' : '/'));
      
      if (keepDirs.includes(fileDir)) {
        keepFiles.push(file);
      } else if (deleteDirs.includes(fileDir)) {
        deleteFiles.push(file);
      }
    });
  });

  filesToDeleteInGroup = deleteFiles;

  // Render Keep Files list in modal
  modalFileListKeep.innerHTML = '';
  keepFiles.forEach(file => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="modal-file-keep-name">${file.name}</div>
      <div class="modal-file-keep-path">${file.path}</div>
    `;
    modalFileListKeep.appendChild(li);
  });

  // Render Delete Files list in modal
  modalFileListDelete.innerHTML = '';
  deleteFiles.forEach(file => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="modal-file-delete-name">${file.name}</div>
      <div class="modal-file-delete-path">${file.path}</div>
    `;
    modalFileListDelete.appendChild(li);
  });

  confirmModal.classList.add('active');
}

// Hide Modal
function hideDeleteConfirmation() {
  confirmModal.classList.remove('active');
  fileToDelete = null;
  groupToDelete = null;
  isFolderDelete = false;
  folderPairIndexToDelete = null;
}

modalBtnCancel.addEventListener('click', hideDeleteConfirmation);

// Confirm Delete (for single, group, and folder-level deduplication)
modalBtnConfirm.addEventListener('click', async () => {
  modalBtnConfirm.disabled = true;
  modalBtnConfirm.textContent = '正在清理...';

  if (isFolderDelete) {
    // Folder batch de-duplication
    const pair = activeMirrorFolders[folderPairIndexToDelete];
    if (pair) {
      let successCount = 0;
      let failedFiles = [];
      const deletedPaths = [];

      for (const file of filesToDeleteInGroup) {
        const success = await window.electronAPI.moveToTrash(file.path);
        if (success) {
          successCount++;
          deletedPaths.push(file.path);
        } else {
          failedFiles.push(file.name);
        }
      }

      if (successCount > 0) {
        // Mark all deleted paths in UI as deleted, and update duplicatesData
        deletedPaths.forEach(path => {
          // Update duplicatesData
          duplicatesData.forEach(group => {
            const fIdx = group.files.findIndex(f => f.path === path);
            if (fIdx !== -1) {
              group.files.splice(fIdx, 1);
            }
          });

          // Mark UI rows
          const fileItemElement = Array.from(document.querySelectorAll('.file-item')).find(item => item.dataset.path === path);
          if (fileItemElement) {
            fileItemElement.classList.add('is-deleted');
            const folderBtn = fileItemElement.querySelector('.btn-folder-action');
            const trashBtn = fileItemElement.querySelector('.btn-trash-action');
            const checkbox = fileItemElement.querySelector('.file-keep-checkbox');
            if (folderBtn) folderBtn.style.pointerEvents = 'none';
            if (trashBtn) trashBtn.style.pointerEvents = 'none';
            if (checkbox) {
              checkbox.checked = false;
              checkbox.disabled = true;
            }
          }
        });

        // Remove duplicate groups that now have <= 1 file (or empty ads)
        for (let i = duplicatesData.length - 1; i >= 0; i--) {
          const group = duplicatesData[i];
          const isAd = group.key === '[ADVERTISEMENT]';
          const shouldRemoveCard = isAd ? group.files.length === 0 : group.files.length <= 1;

          if (shouldRemoveCard) {
            const groupCardElement = document.querySelector(`.duplicate-group[data-key="${group.key}"]`);
            if (groupCardElement) {
              groupCardElement.style.opacity = '0';
              groupCardElement.style.transform = 'translateY(10px)';
              groupCardElement.style.transition = 'all 0.3s ease';
              const card = groupCardElement;
              setTimeout(() => {
                card.remove();
                // Ensure correct sync indices
                const currentIdx = duplicatesData.findIndex(g => g.key === group.key);
                if (currentIdx !== -1) {
                  duplicatesData.splice(currentIdx, 1);
                }
                updateSummaryAfterDeletion();
              }, 300);
            } else {
              duplicatesData.splice(i, 1);
            }
          } else {
            // Update stats for groups that still have multiple files
            const groupCardElement = document.querySelector(`.duplicate-group[data-key="${group.key}"]`);
            if (groupCardElement) {
              const badge = groupCardElement.querySelector('.group-badge');
              if (badge) badge.textContent = `${group.files.length} 个重复`;
              
              const sizes = group.files.map(f => f.size);
              const maxSize = Math.max(...sizes);
              const totalSize = sizes.reduce((a, b) => a + b, 0);
              const wastedSize = totalSize - maxSize;
              
              const sizeTextElement = groupCardElement.querySelector('.group-info span strong');
              if (sizeTextElement) sizeTextElement.textContent = formatBytes(wastedSize);
            }
          }
        }

        // Refresh mirror folders card
        updateMirrorFolders();
        updateSummaryAfterDeletion();
      }

      if (failedFiles.length > 0) {
        alert(`镜像文件夹清理完毕，但有 ${failedFiles.length} 个文件删除失败，请手动确认：\n${failedFiles.join('\n')}`);
      }
    }
  } else if (!isGroupDelete) {
    // Single file deletion
    if (fileToDelete) {
      const { filePath, element, groupKey } = fileToDelete;
      const success = await window.electronAPI.moveToTrash(filePath);
      
      if (success) {
        element.classList.add('is-deleted');
        const folderBtn = element.querySelector('.btn-folder-action');
        const trashBtn = element.querySelector('.btn-trash-action');
        if (folderBtn) folderBtn.style.pointerEvents = 'none';
        if (trashBtn) trashBtn.style.pointerEvents = 'none';

        const groupIndex = duplicatesData.findIndex(g => g.key === groupKey);
        if (groupIndex !== -1) {
          const group = duplicatesData[groupIndex];
          const fileIndex = group.files.findIndex(f => f.path === filePath);
          if (fileIndex !== -1) {
            group.files.splice(fileIndex, 1);
          }
          
          if (group.files.length <= 1) {
            const groupCardElement = document.querySelector(`.duplicate-group[data-key="${groupKey}"]`);
            if (groupCardElement) {
              groupCardElement.style.opacity = '0';
              groupCardElement.style.transform = 'translateY(10px)';
              groupCardElement.style.transition = 'all 0.3s ease';
              
              setTimeout(() => {
                groupCardElement.remove();
                duplicatesData.splice(groupIndex, 1);
                updateSummaryAfterDeletion();
              }, 300);
            }
          } else {
            const groupCardElement = document.querySelector(`.duplicate-group[data-key="${groupKey}"]`);
            if (groupCardElement) {
              const badge = groupCardElement.querySelector('.group-badge');
              if (badge) badge.textContent = `${group.files.length} 个重复`;
              
              const sizes = group.files.map(f => f.size);
              const maxSize = Math.max(...sizes);
              const totalSize = sizes.reduce((a, b) => a + b, 0);
              const wastedSize = totalSize - maxSize;
              const sizeTextElement = groupCardElement.querySelector('.group-info span strong');
              if (sizeTextElement) sizeTextElement.textContent = formatBytes(wastedSize);
            }
            updateSummaryAfterDeletion();
          }
        }
      } else {
        alert('无法删除该文件，可能该文件正在被其他程序占用，或者权限不足。');
      }
    }
  } else {
    // Group one-click deduplication / advertisement cleanup (respects custom checkboxes)
    if (groupToDelete) {
      let successCount = 0;
      let failedFiles = [];
      const deletedPaths = [];
      
      for (const file of filesToDeleteInGroup) {
        const success = await window.electronAPI.moveToTrash(file.path);
        if (success) {
          successCount++;
          deletedPaths.push(file.path);
        } else {
          failedFiles.push(file.name);
        }
      }
      
      if (successCount > 0) {
        const groupKey = groupToDelete.key;
        const groupIndex = duplicatesData.findIndex(g => g.key === groupKey);
        
        if (groupIndex !== -1) {
          const group = duplicatesData[groupIndex];
          
          // Remove deleted files from group data
          deletedPaths.forEach(path => {
            const fIdx = group.files.findIndex(f => f.path === path);
            if (fIdx !== -1) {
              group.files.splice(fIdx, 1);
            }
            
            // Mark the deleted file row in UI as deleted
            const fileItemElement = Array.from(document.querySelectorAll('.file-item')).find(item => item.dataset.path === path);
            if (fileItemElement) {
              fileItemElement.classList.add('is-deleted');
              const folderBtn = fileItemElement.querySelector('.btn-folder-action');
              const trashBtn = fileItemElement.querySelector('.btn-trash-action');
              const checkbox = fileItemElement.querySelector('.file-keep-checkbox');
              if (folderBtn) folderBtn.style.pointerEvents = 'none';
              if (trashBtn) trashBtn.style.pointerEvents = 'none';
              if (checkbox) {
                checkbox.checked = false;
                checkbox.disabled = true;
              }
            }
          });

          // Check how many files are left in this group
          const isAd = groupKey === '[ADVERTISEMENT]';
          const shouldRemoveCard = isAd ? group.files.length === 0 : group.files.length <= 1;

          if (shouldRemoveCard) {
            // Fade out and remove the entire group card
            const groupCardElement = document.querySelector(`.duplicate-group[data-key="${groupKey}"]`);
            if (groupCardElement) {
              groupCardElement.style.opacity = '0';
              groupCardElement.style.transform = 'translateY(10px)';
              groupCardElement.style.transition = 'all 0.3s ease';
              
              setTimeout(() => {
                groupCardElement.remove();
                duplicatesData.splice(groupIndex, 1);
                updateSummaryAfterDeletion();
              }, 300);
            }
          } else {
            // Update the UI card stats for remaining files
            const groupCardElement = document.querySelector(`.duplicate-group[data-key="${groupKey}"]`);
            if (groupCardElement) {
              const badge = groupCardElement.querySelector('.group-badge');
              if (badge) badge.textContent = `${group.files.length} 个重复`;
              
              // Recalculate wasted size
              const sizes = group.files.map(f => f.size);
              const maxSize = Math.max(...sizes);
              const totalSize = sizes.reduce((a, b) => a + b, 0);
              const wastedSize = totalSize - maxSize;
              
              const sizeTextElement = groupCardElement.querySelector('.group-info span strong');
              if (sizeTextElement) sizeTextElement.textContent = formatBytes(wastedSize);
            }
            updateSummaryAfterDeletion();
          }
        }
      }
      
      if (failedFiles.length > 0) {
        alert(`一键清理完毕，但有 ${failedFiles.length} 个文件删除失败，请手动确认：\n${failedFiles.join('\n')}`);
      }
    }
  }
  
  modalBtnConfirm.disabled = false;
  modalBtnConfirm.textContent = '确认移至回收站';
  hideDeleteConfirmation();
});

function updateSummaryAfterDeletion() {
  // Recalculate total groups and files
  const activeGroups = duplicatesData.length;
  // If all clear, show empty state
  if (activeGroups === 0) {
    emptyState.style.display = 'flex';
  }
  
  // Find initial matches, let's keep scannedCount unchanged or update it
  // Since we only know what's left, we can just say "当前还剩 X 组重复"
  const currentText = summaryText.innerHTML;
  summaryText.innerHTML = currentText.replace(/发现 <strong.*?>\d+<\/strong> 组重复文件/i, `发现 <strong style="color:var(--danger)">${activeGroups}</strong> 组重复文件`);
}

// Clean up listeners on exit
window.addEventListener('beforeunload', () => {
  unsubscribeProgress();
  unsubscribeDone();
  unsubscribeError();
});
