// Runs a Node script with Electron's bundled Node (ELECTRON_RUN_AS_NODE=1).
// better-sqlite3 is compiled for Electron's ABI by `electron-builder install-app-deps`,
// so tests and scripts that touch SQLite must run on Electron's Node, not the system Node.
import { spawn } from 'node:child_process'
import electronPath from 'electron'

const child = spawn(electronPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
