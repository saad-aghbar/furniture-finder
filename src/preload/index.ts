import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type EventChannel, type FFBridge, type InvokeChannel } from '../shared/ipc'

const invokeAllowed = new Set<string>(INVOKE_CHANNELS)
const eventAllowed = new Set<string>(EVENT_CHANNELS)

const bridge: FFBridge = {
  invoke: ((channel: InvokeChannel, payload?: unknown) => {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`blocked channel ${channel}`))
    return ipcRenderer.invoke(channel, payload)
  }) as FFBridge['invoke'],
  on: ((channel: EventChannel, listener: (payload: unknown) => void) => {
    if (!eventAllowed.has(channel)) throw new Error(`blocked channel ${channel}`)
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }) as FFBridge['on'],
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  platform: process.platform
}

contextBridge.exposeInMainWorld('ff', bridge)
