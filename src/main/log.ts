import log from 'electron-log/main'

log.transports.file.level = 'info'
log.transports.file.maxSize = 2 * 1024 * 1024
log.transports.console.level = process.env['NODE_ENV'] === 'production' ? false : 'debug'

export { log }
