const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusGram', {
  setInstagram: (state) => ipcRenderer.invoke('instagram:state', state),
  setViewport: (bounds) => ipcRenderer.invoke('instagram:bounds', bounds),
  setTheme: (theme) => ipcRenderer.invoke('app:theme', theme),
  refresh: () => ipcRenderer.invoke('instagram:refresh'),
  resetInstagram: () => ipcRenderer.invoke('instagram:reset'),
  selectUpload: (kind) => ipcRenderer.invoke('upload:select', kind),
  openComposer: (payload) => ipcRenderer.invoke('upload:composer', payload),
  storyCapabilities: () => ipcRenderer.invoke('story:capabilities'),
  prepareStories: () => ipcRenderer.invoke('story:prepare'),
  publishStory: (payload) => ipcRenderer.invoke('story:publish', payload),
  onStatus: (callback) => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('app:status', listener);
    return () => ipcRenderer.removeListener('app:status', listener);
  },
});
