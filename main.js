const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows 11：設定 AppUserModelID，通知才能以正確的應用程式身分／圖示顯示於通知中心
const APP_ID = 'com.kenlu.goldfishsaver';
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// 資料檔放在使用者資料夾，關閉程式後資料仍保留
const dataFile = path.join(app.getPath('userData'), 'memos.json');

function readMemos() {
  try {
    if (!fs.existsSync(dataFile)) return [];
    const raw = fs.readFileSync(dataFile, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('讀取備忘錄失敗:', err);
    return [];
  }
}

function writeMemos(memos) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(memos, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('寫入備忘錄失敗:', err);
    return false;
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const opts = {
    width: 1040,
    height: 680,
    minWidth: 720,
    minHeight: 480,
    title: 'GoldFish Saver',
    backgroundColor: '#1f1f24', // 第一幀即為主題底色，視窗立即開啟、不閃白
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  if (isMac) {
    // macOS：保留紅綠燈按鈕（內縮），垂直置中於自訂標題列
    opts.titleBarStyle = 'hiddenInset';
    opts.trafficLightPosition = { x: 12, y: 13 };
  } else {
    // Windows / Linux：隱藏原生標題列 + 主題色控制鈕
    opts.icon = path.join(__dirname, 'build', 'icon.ico'); // mac 由 .app bundle 提供圖示
    opts.titleBarStyle = 'hidden';
    opts.titleBarOverlay = { color: '#26262d', symbolColor: '#e8e8ec', height: 40 };
  }
  const win = new BrowserWindow(opts);

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// IPC：渲染程序透過 preload 呼叫這些
ipcMain.handle('memos:load', () => readMemos());
ipcMain.handle('memos:save', (_e, memos) => writeMemos(memos));
ipcMain.handle('window:setAlwaysOnTop', (e, flag) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setAlwaysOnTop(!!flag);
  return !!flag;
});

// 隨主題更新標題列控制鈕的底色 / 符號色
ipcMain.handle('window:setOverlay', (e, opts) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && win.setTitleBarOverlay) {
    try { win.setTitleBarOverlay(opts); } catch (err) {}
  }
});

// 系統級待辦提醒：顯示 Windows 11 原生通知（Toast）
// payload = { id, title, body }
ipcMain.handle('notify:show', (e, payload = {}) => {
  if (!Notification.isSupported()) return false;
  const win = BrowserWindow.fromWebContents(e.sender);
  const n = new Notification({
    title: payload.title || '待辦提醒',
    body: payload.body || '',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    timeoutType: 'default',
  });
  // 點擊通知：喚回視窗並請渲染程序開啟該則備忘錄
  n.on('click', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.moveTop();
    }
    if (payload.id) e.sender.send('notification:open', payload.id);
  });
  n.show();
  return true;
});

// 檢視模式：縮小成右下角浮動小視窗並置頂（子母畫面）
let savedBounds = null;
const MINI_W = 320, MINI_H = 470;

ipcMain.handle('window:enterMini', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  savedBounds = win.getBounds();
  win.setMinimumSize(260, 320);
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({
    x: wa.x + wa.width - MINI_W - 24,
    y: wa.y + wa.height - MINI_H - 24,
    width: MINI_W,
    height: MINI_H,
  });
  // 用較高的置頂層級並主動提到最前，確保不會被其他視窗壓在後面
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  win.focus();
});

ipcMain.handle('window:exitMini', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  win.setAlwaysOnTop(false);
  win.setMinimumSize(720, 480);
  if (savedBounds) win.setBounds(savedBounds);
  win.focus();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
