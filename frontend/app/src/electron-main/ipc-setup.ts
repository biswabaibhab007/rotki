import {
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell
} from 'electron';
import { ProgressInfo } from 'electron-builder';
import { autoUpdater } from 'electron-updater';
import { startHttp, stopHttp } from '@/electron-main/http';
import { BackendOptions, SystemVersion } from '@/electron-main/ipc';
import {
  IPC_CHECK_FOR_UPDATES,
  IPC_CLOSE_APP,
  IPC_DARK_MODE,
  IPC_DOWNLOAD_PROGRESS,
  IPC_DOWNLOAD_UPDATE,
  IPC_GET_DEBUG,
  IPC_INSTALL_UPDATE,
  IPC_METAMASK_IMPORT,
  IPC_OPEN_DIRECTORY,
  IPC_OPEN_PATH,
  IPC_OPEN_URL,
  IPC_PREMIUM_LOGIN,
  IPC_RESTART_BACKEND,
  IPC_SERVER_URL,
  IPC_VERSION
} from '@/electron-main/ipc-commands';
import { debugSettings, getUserMenu } from '@/electron-main/menu';
import { selectPort } from '@/electron-main/port-utils';
import PyHandler from '@/py-handler';
import { assert } from '@/utils/assertions';
import Timeout = NodeJS.Timeout;

const isDevelopment = process.env.NODE_ENV !== 'production';

async function select(
  title: string,
  prop: 'openFile' | 'openDirectory'
): Promise<string | undefined> {
  const value = await dialog.showOpenDialog({
    title,
    properties: [prop]
  });

  if (value.canceled) {
    return undefined;
  }
  return value.filePaths?.[0];
}

function setupMetamaskImport() {
  let importTimeout: Timeout;
  ipcMain.on(IPC_METAMASK_IMPORT, async (event, _args) => {
    try {
      const port = startHttp(
        addresses => event.sender.send(IPC_METAMASK_IMPORT, { addresses }),
        await selectPort(40000)
      );
      await shell.openExternal(`http://localhost:${port}`);
      if (importTimeout) {
        clearTimeout(importTimeout);
      }
      importTimeout = setTimeout(() => {
        stopHttp();
        event.sender.send(IPC_METAMASK_IMPORT, { error: 'waiting timeout' });
      }, 120000);
    } catch (e) {
      event.sender.send(IPC_METAMASK_IMPORT, { error: e.message });
    }
  });
}

function setupBackendRestart(
  win: Electron.BrowserWindow,
  pyHandler: PyHandler
) {
  ipcMain.on(IPC_RESTART_BACKEND, async (event, options: BackendOptions) => {
    let success = false;
    try {
      assert(win);
      await pyHandler.exitPyProc(true);
      await pyHandler.createPyProc(win, options.loglevel);
      success = true;
    } catch (e) {
      console.error(e);
    }

    event.sender.send(IPC_RESTART_BACKEND, success);
  });
}

function setupVersionInfo() {
  ipcMain.on(IPC_VERSION, event => {
    const version: SystemVersion = {
      os: process.platform,
      arch: process.arch,
      osVersion: process.getSystemVersion(),
      electron: process.versions.electron
    };
    event.sender.send(IPC_VERSION, version);
  });
}

function setupDarkModeSupport() {
  ipcMain.on(IPC_DARK_MODE, async (event, enabled) => {
    if (enabled) {
      nativeTheme.themeSource = 'dark';
    } else {
      nativeTheme.themeSource = 'light';
    }
    event.sender.send(IPC_DARK_MODE, nativeTheme.shouldUseDarkColors);
  });
}

export function ipcSetup(
  pyHandler: PyHandler,
  win: BrowserWindow,
  closeApp: () => Promise<void>
) {
  ipcMain.on(IPC_GET_DEBUG, event => {
    event.returnValue = debugSettings;
  });

  ipcMain.on(IPC_SERVER_URL, event => {
    event.returnValue = pyHandler.serverUrl;
  });

  ipcMain.on(IPC_PREMIUM_LOGIN, (event, args) => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(getUserMenu(!args)));
  });

  ipcMain.on(IPC_CLOSE_APP, async () => await closeApp());

  ipcMain.on(IPC_OPEN_URL, (event, args) => {
    if (!args.startsWith('https://')) {
      console.error(`Error: Requested to open untrusted URL: ${args} `);
      return;
    }
    shell.openExternal(args);
  });

  ipcMain.on(IPC_OPEN_DIRECTORY, async (event, args) => {
    const directory = await select(args, 'openDirectory');
    event.sender.send(IPC_OPEN_DIRECTORY, directory);
  });
  ipcMain.on(IPC_OPEN_PATH, (event, path) => shell.openPath(path));

  setupMetamaskImport();
  setupBackendRestart(win, pyHandler);
  setupVersionInfo();
  setupUpdaterInterop(pyHandler, win);
  setupDarkModeSupport();
}

function setupInstallUpdate(pyHandler: PyHandler) {
  ipcMain.on(IPC_INSTALL_UPDATE, async event => {
    const quit = new Promise<void>((resolve, reject) => {
      const quitAndInstall = () => {
        try {
          autoUpdater.quitAndInstall();
          resolve();
        } catch (e) {
          pyHandler.logToFile(e);
          reject(e);
        }
      };
      return setTimeout(quitAndInstall, 5000);
    });
    try {
      await quit;
      event.sender.send(IPC_INSTALL_UPDATE, true);
    } catch (e) {
      pyHandler.logToFile(e);
      event.sender.send(IPC_INSTALL_UPDATE, e);
    }
  });
}

function setupDownloadUpdate(
  win: Electron.BrowserWindow,
  pyHandler: PyHandler
) {
  ipcMain.on(IPC_DOWNLOAD_UPDATE, async event => {
    const progress = (progress: ProgressInfo) => {
      event.sender.send(IPC_DOWNLOAD_PROGRESS, progress.percent);
      win?.setProgressBar(progress.percent);
    };
    autoUpdater.on('download-progress', progress);
    try {
      await autoUpdater.downloadUpdate();
      event.sender.send(IPC_DOWNLOAD_UPDATE, true);
    } catch (e) {
      pyHandler.logToFile(e);
      event.sender.send(IPC_DOWNLOAD_UPDATE, false);
    } finally {
      autoUpdater.off('download-progress', progress);
    }
  });
}

function setupCheckForUpdates(pyHandler: PyHandler) {
  ipcMain.on(IPC_CHECK_FOR_UPDATES, async event => {
    if (isDevelopment) {
      console.log('Running in development skipping auto-updater check');
      return;
    }
    autoUpdater.once('update-available', () => {
      event.sender.send(IPC_CHECK_FOR_UPDATES, true);
    });
    autoUpdater.once('update-not-available', () => {
      event.sender.send(IPC_CHECK_FOR_UPDATES, false);
    });
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      console.error(e);
      pyHandler.logToFile(e);
      event.sender.send(IPC_CHECK_FOR_UPDATES, false);
    }
  });
}

function setupUpdaterInterop(pyHandler: PyHandler, win: BrowserWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.logger = {
    error: (message?: any) => pyHandler.logToFile(`(error): ${message}`),
    info: (message?: any) => pyHandler.logToFile(`(info): ${message}`),
    debug: (message: string) => pyHandler.logToFile(`(debug): ${message}`),
    warn: (message?: any) => pyHandler.logToFile(`(warn): ${message}`)
  };
  setupCheckForUpdates(pyHandler);
  setupDownloadUpdate(win, pyHandler);
  setupInstallUpdate(pyHandler);
}
