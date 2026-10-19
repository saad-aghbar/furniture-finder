import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ff', { version: process.versions.electron })
