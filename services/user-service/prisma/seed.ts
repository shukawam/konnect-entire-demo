import { PrismaClient } from '../generated/prisma'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('password123', 10)

  await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      id: 'user-001',
      email: 'user@example.com',
      name: 'ゴリラ太郎',
      password,
      apiKey: 'demo-api-key',
    },
  })

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      id: 'user-002',
      email: 'admin@example.com',
      name: 'シルバーバック管理者',
      password,
      apiKey: 'admin-api-key',
    },
  })

  console.log('User seed completed.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
