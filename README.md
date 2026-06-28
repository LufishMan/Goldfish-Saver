# 🐟 GoldFish Saver

一款參考 Windows 便利貼設計的簡易桌面備忘錄程式，使用 Electron 開發，支援 **Markdown 即時編輯**、標籤、顏色標記、釘選、以及像子母畫面（PiP）的浮動「檢視模式」。跨平台支援 **Windows / macOS**。

---

## ✨ 功能特色

- **Markdown 即時編輯器**（TipTap）：輸入 `# `、`- `、`**粗體**` 等語法即時成形，並附格式工具列。
- **欄位**：標題、內容、日期、標籤。
- **日期**：支援「單日」或「區間」（區間不可超過 3 個月）；當日的日期會 highlight。
- **標籤**：每則最多 3 個，過長自動以 `…` 截斷。
- **顏色標記 / 釘選置頂**：便利貼風格的色條，釘選的便條永遠排在最上面。
- **清單管理**：拖曳排序、快速刪除、搜尋（標題 / 內容 / 標籤）。
- **檢視模式（浮動小視窗）**：整個視窗縮成右下角的小卡片並自動置頂，像桌面便利貼；可在小視窗內直接編輯。
- **個性化設定**：主題色（琥珀夜 / 暖紙淺色）、字體大小。
- **本機自動儲存**：資料存在本機，關閉程式重開仍在。

---

## 📥 下載與安裝

到 [Releases](https://github.com/LufishMan/Goldfish-Saver/releases) 或 GitHub Actions 的 Artifacts 下載對應系統的安裝檔。

### Windows
1. 下載 `GoldFish Saver Setup x.x.x.exe`，雙擊安裝。
2. 因為未經程式碼簽章，第一次執行 Windows 可能出現 **SmartScreen** 警告 → 點「**更多資訊 → 仍要執行**」。

### macOS
1. 下載 `GoldFish Saver-x.x.x.dmg`，打開後把 App 拖進「應用程式」。
2. 因為未經 Apple 簽章 / 公證，第一次開啟可能被 **Gatekeeper** 擋 → 在 App 上**按右鍵 → 開啟 → 開啟**即可放行。

> 資料儲存位置：Windows 在 `%APPDATA%\goldfish-saver\`、macOS 在 `~/Library/Application Support/goldfish-saver/`。解除安裝不會刪除你的備忘錄。

---

## 🛠 開發

需要 [Node.js](https://nodejs.org/) 20+。

```bash
npm install          # 安裝相依套件
npm run build:editor # 打包 TipTap 編輯器（renderer/vendor/tiptap.bundle.js）
npm start            # 啟動開發版
```

> `renderer/vendor/tiptap.bundle.js` 由 esbuild 從 `renderer/src/editor-entry.js` 產生，已被 git 忽略；首次開發或改動編輯器入口後請執行 `npm run build:editor`。

## 📦 打包

```bash
npm run dist         # Windows 安裝檔（.exe）
npm run dist:mac     # macOS（.dmg，需在 macOS 上執行）
npm run dist:linux   # Linux（AppImage）
```

> macOS 的 `.dmg` **必須在 macOS 環境打包**。沒有 Mac 的話，推送 `v*` 標籤即可透過 GitHub Actions 在雲端同時產出 Windows 與 macOS 版本（見下方）。

## 🚀 發佈新版（CI 自動建置）

```bash
# 1. 更新 package.json 的 version
# 2. 提交並推送程式碼
git add -A && git commit -m "..." && git push
# 3. 打版本標籤觸發建置
git tag v1.0.5
git push origin v1.0.5
```

推送標籤後，`.github/workflows/build.yml` 會在 GitHub 的 macOS 與 Windows runner 各打包一次，產物可於 repo 的 **Actions → 該次執行 → Artifacts** 下載。

---

## 🧱 技術

Electron · TipTap（ProseMirror）· esbuild · electron-builder

## 📄 授權

MIT
