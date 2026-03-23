import { PrismaClient } from '../generated/prisma'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { registerInstrumentations } from '@opentelemetry/instrumentation'

registerInstrumentations({
  instrumentations: [new PrismaInstrumentation()],
})

export const prisma = new PrismaClient()
