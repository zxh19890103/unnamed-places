import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';

import path, { extname, join } from 'node:path';
import exifr from 'exifr';

import { __dirname } from './context.js';

const DEV_CLIENT_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
const SERVICE_PORT = process.env.PORT || '4050';

let bundledServiceProcess = null;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp']);

const scanFolderForGeotaggedPhotos = async (rootPath) => {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(rootPath, entry.name))
    .filter((filePath) => IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase()));

  const records = [];

  for (const filePath of files) {
    const gps = await exifr.gps(filePath).catch(() => null);

    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      continue;
    }

    records.push({
      id: filePath,
      filePath,
      lat: gps.latitude,
      lng: gps.longitude,
      takenAt: null,
    });
  }

  return records;
};

const startBundledService = () => {
  if (!app.isPackaged || bundledServiceProcess) {
    console.log('Skipping bundled service start (not packaged or already running)');
    return;
  }

  const serviceRootDir = join(process.resourcesPath, 'lancangriver', 'serve');
  const serviceEntry = join(serviceRootDir, 'dist', 'server.js');
  const serviceCwd = serviceRootDir;

  bundledServiceProcess = spawn(process.execPath, [serviceEntry], {
    cwd: serviceCwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: SERVICE_PORT,
    },
  });

  bundledServiceProcess.on('exit', (code, signal) => {
    console.log(`Bundled service exited (code=${code}, signal=${signal})`);
    bundledServiceProcess = null;
  });
};

const stopBundledService = () => {
  if (bundledServiceProcess && !bundledServiceProcess.killed) {
    console.log('Stopping bundled service...');
    bundledServiceProcess.kill('SIGTERM');
  }
};

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    console.log('Loading development client URL...');
    await win.loadURL(DEV_CLIENT_URL);
    // win.webContents.openDevTools();
    return;
  }

  await win.loadFile(join(__dirname, 'lancangriver', 'client', 'dist', 'index.html'));
};

app.whenReady().then(() => {
  ipcMain.handle('photos:pick-and-load', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

    const selection = await dialog.showOpenDialog(focusedWindow, {
      title: 'Select photo folder',
      properties: ['openDirectory'],
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return [];
    }

    return scanFolderForGeotaggedPhotos(selection.filePaths[0]);
  });

  startBundledService();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ipcMain.removeHandler('photos:pick-and-load');
  stopBundledService();
});
