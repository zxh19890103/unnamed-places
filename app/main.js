import { app, BrowserWindow } from "electron";

import path, { join } from "node:path";

import { __dirname } from "./context.js";

const DEV_CLIENT_URL = process.env.ELECTRON_RENDERER_URL || "http://localhost:5173";

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    await win.loadURL(DEV_CLIENT_URL);
    // win.webContents.openDevTools();
    return;
  }

  await win.loadFile(join(__dirname, "lancangriver", "client", "dist", "index.html"));
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
