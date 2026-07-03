'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 新規登録は Keycloak 側（セルフ登録）に委譲する。ログイン画面へ誘導する。
export default function RegisterPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/login')
  }, [router])

  return null
}
