const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusGram', {
  importMedia: (kind) => ipcRenderer.invoke('media:import', kind),
  exportVideo: (project) => ipcRenderer.invoke('media:export', project),
  cancelExport: () => ipcRenderer.invoke('media:cancel'),
  revealExport: () => ipcRenderer.invoke('media:reveal'),
  setInstagram: (state) => ipcRenderer.invoke('instagram:state', state),
  resetInstagram: () => ipcRenderer.invoke('instagram:reset'),
  onExportProgress: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },
  onInstagramStatus: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('instagram:status', listener);
    return () => ipcRenderer.removeListener('instagram:status', listener);
  },
});
