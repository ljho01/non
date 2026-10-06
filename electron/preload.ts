import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, AgentRequest, NonDesktopApi, ThemeSource } from '../src/shared/api/non-api'
import type { TranscriptionEvent } from '../src/shared/contracts/transcription'

const api: NonDesktopApi = {
  vault: {
    defaultRoot: () => ipcRenderer.invoke('vault:default-root'),
    open: (path) => ipcRenderer.invoke('vault:open', path),
    list: () => ipcRenderer.invoke('vault:list'),
    read: (path) => ipcRenderer.invoke('vault:read', path),
    save: (path, content, revision) =>
      ipcRenderer.invoke('vault:save', { path, content, revision }),
    createFolder: (path) => ipcRenderer.invoke('vault:create-folder', path),
    propertyTypes: () => ipcRenderer.invoke('vault:property-types'),
    databaseEntries: () => ipcRenderer.invoke('vault:database-entries'),
    readAsset: (path) => ipcRenderer.invoke('vault:read-asset', path),
    readPdf: (path) => ipcRenderer.invoke('vault:read-pdf', path),
    importPdf: (source, folder) => ipcRenderer.invoke('vault:import-pdf', { source, folder }),
    trash: (path) => ipcRenderer.invoke('vault:trash', path),
    archive: (path) => ipcRenderer.invoke('vault:archive', path),
    listArchived: () => ipcRenderer.invoke('vault:list-archived'),
    restoreArchived: (id) => ipcRenderer.invoke('vault:restore-archived', id),
    deleteArchived: (id) => ipcRenderer.invoke('vault:delete-archived', id),
    rename: (path, name) => ipcRenderer.invoke('vault:rename', { path, name }),
    move: (path, targetFolder) => ipcRenderer.invoke('vault:move', { path, targetFolder }),
    reveal: (path) => ipcRenderer.invoke('vault:reveal', path),
  },
  dialog: {
    chooseFolder: () => ipcRenderer.invoke('dialog:choose-folder'),
    choosePdf: () => ipcRenderer.invoke('dialog:choose-pdf'),
  },
  transcription: {
    list: () => ipcRenderer.invoke('transcription:list'),
    listArchived: () => ipcRenderer.invoke('transcription:list-archived'),
    microphoneInputs: () => ipcRenderer.invoke('transcription:microphone-inputs'),
    setMicrophoneInput: (id) => ipcRenderer.invoke('transcription:set-microphone-input', id),
    create: (language, folder) => ipcRenderer.invoke('transcription:create', { language, folder }),
    createLive: (language, folder) =>
      ipcRenderer.invoke('transcription:create-live', { language, folder }),
    rename: (id, name) => ipcRenderer.invoke('transcription:rename', { id, name }),
    move: (id, folder) => ipcRenderer.invoke('transcription:move', { id, folder }),
    remove: (id) => ipcRenderer.invoke('transcription:remove', id),
    archive: (id) => ipcRenderer.invoke('transcription:archive', id),
    restoreArchived: (id) => ipcRenderer.invoke('transcription:restore-archived', id),
    setLanguage: (id, language) =>
      ipcRenderer.invoke('transcription:set-language', { id, language }),
    start: (id) => ipcRenderer.invoke('transcription:start', id),
    retranscribe: (id) => ipcRenderer.invoke('transcription:retranscribe', id),
    stop: (id) => ipcRenderer.invoke('transcription:stop', id),
    runtimeStatus: () => ipcRenderer.invoke('transcription:runtime-status'),
    installRuntime: () => ipcRenderer.invoke('transcription:install-runtime'),
    audioUrl: (id) => `non-audio://session/${encodeURIComponent(id)}`,
    onEvent: (callback: (event: TranscriptionEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: TranscriptionEvent) =>
        callback(value)
      ipcRenderer.on('transcription:event', listener)
      return () => ipcRenderer.removeListener('transcription:event', listener)
    },
  },
  agent: {
    request: (request: AgentRequest) => ipcRenderer.invoke('agent:request', request),
    onEvent: (callback: (event: AgentEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: AgentEvent) => callback(value)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    },
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    install: () => ipcRenderer.invoke('skills:install'),
    setEnabled: (id, enabled) => ipcRenderer.invoke('skills:set-enabled', { id, enabled }),
    remove: (id) => ipcRenderer.invoke('skills:remove', id),
    reveal: () => ipcRenderer.invoke('skills:reveal'),
  },
  window: {
    setTheme: (theme: ThemeSource) => ipcRenderer.invoke('window:set-theme', theme),
    isFullScreen: () => ipcRenderer.invoke('window:is-full-screen'),
    onFullScreenChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, fullScreen: boolean) =>
        callback(fullScreen)
      ipcRenderer.on('window:full-screen-changed', listener)
      return () => ipcRenderer.removeListener('window:full-screen-changed', listener)
    },
    hide: () => ipcRenderer.invoke('window:hide'),
    onCloseRequested: (callback: (quit: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, quit: boolean) => callback(quit)
      ipcRenderer.on('window:close-requested', listener)
      return () => ipcRenderer.removeListener('window:close-requested', listener)
    },
    closeReady: (quit: boolean) => ipcRenderer.invoke('window:close-ready', quit),
  },
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
}

contextBridge.exposeInMainWorld('non', api)
