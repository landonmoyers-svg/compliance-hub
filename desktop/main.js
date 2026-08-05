// Compliance Hub — desktop shell.
//
// A thin, hardened native window around the HOSTED web app. It does not bundle
// the Next.js server or any data; it loads the production URL, so the desktop
// app is always in sync with what's deployed and all /api routes + Supabase
// auth work exactly as in a browser. External links open in the system browser;
// navigation is confined to the app + Supabase origins.

const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

const APP_URL = process.env.COMPLIANCE_HUB_URL || "https://compliance-hub-lone-peak.vercel.app";

// Hosts the app window may navigate to internally (the app + its Supabase auth).
// Anything else opens in the user's default browser.
const ALLOWED_HOSTS = new Set([
  "compliance-hub-lone-peak.vercel.app",
  "gkrhxfthvqprmnztoxxw.supabase.co",
]);

let mainWindow = null;

function isAllowed(urlStr) {
  try { return ALLOWED_HOSTS.has(new URL(urlStr).hostname); } catch { return false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "Compliance Hub",
    backgroundColor: "#121212", // matches the app's dark base; avoids white flash
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  // window.open / target=_blank and any non-app origin → system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { label: "Back", accelerator: "CmdOrCtrl+[", click: () => mainWindow?.webContents.navigationHistory.canGoBack() && mainWindow.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: () => mainWindow?.webContents.navigationHistory.canGoForward() && mainWindow.webContents.navigationHistory.goForward() },
        { label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: () => mainWindow?.loadURL(APP_URL) },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        { label: "Check for Updates…", click: () => checkForUpdates(true) },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function checkForUpdates(interactive) {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    if (interactive) {
      dialog.showMessageBox({ type: "info", message: "Update check unavailable", detail: String(err?.message ?? err) });
    }
  });
}

// Single-instance: focus the existing window instead of opening a second.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu());
    createWindow();
    checkForUpdates(false); // no-op for unsigned local builds without a published release
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
