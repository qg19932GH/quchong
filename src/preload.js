const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  startScan: (dirPath) => ipcRenderer.send('start-scan', dirPath),
  cancelScan: () => ipcRenderer.send('cancel-scan'),
  openFolder: (filePath) => ipcRenderer.invoke('open-folder', filePath),
  moveToTrash: (filePath) => ipcRenderer.invoke('move-to-trash', filePath),
  cleanFolderWithMerge: (deleteDir, keepDir) => ipcRenderer.invoke('clean-folder-with-merge', deleteDir, keepDir),
  onScanProgress: (callback) => {
    // Wrap callback to strip event argument
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan-progress', subscription);
    return () => ipcRenderer.removeListener('scan-progress', subscription);
  },
  onScanDone: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan-done', subscription);
    return () => ipcRenderer.removeListener('scan-done', subscription);
  },
  onScanError: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan-error', subscription);
    return () => ipcRenderer.removeListener('scan-error', subscription);
  }
});
