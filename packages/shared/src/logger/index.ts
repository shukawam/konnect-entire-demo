import pino from 'pino'

export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
  })
}
