import { PrismaClient } from '@prisma/client'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import { registerInstrumentations } from '@opentelemetry/instrumentation'

registerInstrumentations({
  instrumentations: [new PrismaInstrumentation()],
})

export const prisma = new PrismaClient()
