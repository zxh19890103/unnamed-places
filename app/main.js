import { app, BrowserWindow } from "electron";
import { spawn } from "node:child_process";

import path, { join } from "node:path";

import { __dirname } from "./context.js";

const DEV_CLIENT_URL = process.env.ELECTRON_RENDERER_URL || "http://localhost:5173";
const SERVICE_PORT = process.env.PORT || "4050";

let bundledServiceProcess = null;

const startBundledService = () => {
  if (!app.isPackaged || bundledServiceProcess) {
    console.log("Skipping bundled service start (not packaged or already running)");
    return;
  }

  const serviceRootDir = join(process.resourcesPath, "lancangriver", "serve");
  const serviceEntry = join(serviceRootDir, "dist", "server.js");
  const serviceCwd = serviceRootDir;

  bundledServiceProcess = spawn(process.execPath, [serviceEntry], {
    cwd: serviceCwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: SERVICE_PORT,
    },
  });

  bundledServiceProcess.on("exit", (code, signal) => {
    console.log(`Bundled service exited (code=${code}, signal=${signal})`);
    bundledServiceProcess = null;
  });
};

const stopBundledService = () => {
  if (bundledServiceProcess && !bundledServiceProcess.killed) {
    console.log("Stopping bundled service...");
    bundledServiceProcess.kill("SIGTERM");
  }
};

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
    console.log("Loading development client URL...");
    await win.loadURL(DEV_CLIENT_URL);
    // win.webContents.openDevTools();
    return;
  }

  await win.loadFile(join(__dirname, "lancangriver", "client", "dist", "index.html"));
};

app.whenReady().then(() => {
  startBundledService();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBundledService();
});
