import { PrismaClient } from '../generated/prisma'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('password123', 10)

  await prisma.user.upsert({
    where: { email: 'jack@example.com' },
    update: {},
    create: {
      id: 'user-001',
      email: 'jack@example.com',
      name: 'Jack Driscoll',
      password,
      apiKey: 'demo-api-key',
    },
  })

  await prisma.user.upsert({
    where: { email: 'carl@example.com' },
    update: {},
    create: {
      id: 'user-002',
      email: 'carl@example.com',
      name: 'Carl Denham',
      password,
      apiKey: 'admin-api-key',
    },
  })

  console.log('User seed completed.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
