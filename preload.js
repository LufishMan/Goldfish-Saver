const { contextBridge, ipcRenderer } = require('electron');

// 安全橋接：只暴露必要的存取點給渲染程序
contextBridge.exposeInMainWorld('memoAPI', {
  platform: process.platform,
  load: () => ipcRenderer.invoke('memos:load'),
  save: (memos) => ipcRenderer.invoke('memos:save', memos),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  setOverlay: (opts) => ipcRenderer.invoke('window:setOverlay', opts),
  enterMini: () => ipcRenderer.invoke('window:enterMini'),
  exitMini: () => ipcRenderer.invoke('window:exitMini')
});
