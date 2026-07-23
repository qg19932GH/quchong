const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { extractVideoId } = require('./parser');
const { getVideoMetadata } = require('./metadata');

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.rmvb', '.m4v', '.ts', '.3gp', '.mpeg', '.mpg'
]);

let mainWindow = null;
let cancelRequested = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 850,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true,
    title: '视频重复文件查找与清理工具'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open devtools if in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择视频所在文件夹'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.on('start-scan', async (event, dirPath) => {
  cancelRequested = false;
  try {
    const results = await scanDirectory(dirPath, event);
    event.sender.send('scan-done', results);
  } catch (err) {
    if (err.message === 'SCAN_CANCELLED') {
      event.sender.send('scan-progress', { cancelled: true });
    } else {
      event.sender.send('scan-error', err.message);
    }
  }
});

ipcMain.on('cancel-scan', () => {
  cancelRequested = true;
});

ipcMain.handle('open-folder', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (err) {
    console.error(`Failed to show item in folder: ${filePath}`, err);
    return false;
  }
});

ipcMain.handle('move-to-trash', async (event, filePath) => {
  try {
    // shell.trashItem moves the file to the Recycle Bin (Windows)
    await shell.trashItem(filePath);
    return true;
  } catch (err) {
    console.warn(`Failed to move file to trash: ${filePath}. Trying permanent deletion fallback (e.g. NAS/SMB share).`, err);
    try {
      // Fallback to permanent deletion if Recycle Bin is not supported (like on network mapped drives)
      await fs.unlink(filePath);
      return true;
    } catch (unlinkErr) {
      console.error(`Permanent deletion fallback also failed for: ${filePath}`, unlinkErr);
      return false;
    }
  }
});

// Scan helper
async function scanDirectory(dirPath, event) {
  let scannedCount = 0;
  let matchedCount = 0;
  const filesById = new Map();

  async function traverse(currentDir) {
    if (cancelRequested) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      console.warn(`Failed to read directory: ${currentDir}`, err);
      return;
    }

    for (const entry of entries) {
      if (cancelRequested) return;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          scannedCount++;
          const videoId = extractVideoId(entry.name);
          if (videoId) {
            matchedCount++;
            try {
              const stat = await fs.stat(fullPath);
              const meta = await getVideoMetadata(fullPath);
              if (!filesById.has(videoId)) {
                filesById.set(videoId, []);
              }
              filesById.get(videoId).push({
                path: fullPath,
                name: entry.name,
                size: stat.size,
                mtime: stat.mtimeMs,
                duration: meta ? meta.duration : null,
                resolution: meta ? meta.resolution : null
              });
            } catch (statErr) {
              console.warn(`Failed to stat file: ${fullPath}`, statErr);
            }
          }

          // Send progress every 20 scanned video files to feel responsive
          if (scannedCount % 20 === 0) {
            event.sender.send('scan-progress', {
              scannedCount,
              matchedCount,
              currentDir: path.basename(currentDir)
            });
          }
        }
      }
    }
  }

  await traverse(dirPath);

  if (cancelRequested) {
    throw new Error('SCAN_CANCELLED');
  }

  // Filter out non-duplicate IDs
  const duplicates = [];
  for (const [key, files] of filesById.entries()) {
    if (files.length > 1) {
      // Sort files within duplicate groups: put largest size first
      files.sort((a, b) => b.size - a.size);
      duplicates.push({
        key,
        files
      });
    }
  }

  // Sort groups: group with most duplicates first
  duplicates.sort((a, b) => b.files.length - a.files.length || a.key.localeCompare(b.key));

  return {
    scannedCount,
    matchedCount,
    duplicates
  };
}
