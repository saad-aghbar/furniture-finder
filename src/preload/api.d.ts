import type { FFBridge } from '../shared/ipc'

declare global {
  interface Window {
    ff: FFBridge
  }
}

export {}
