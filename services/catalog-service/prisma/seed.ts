import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

const products = [
  // === バナナ・フード ===
  {
    id: 'prod-001',
    name: '極上キングバナナ 1房',
    description:
      'ジャングル最深部で厳選された特大キングバナナ。一房で満腹になるゴリラサイズ。完熟の甘みと濃厚な香りがたまらない逸品。',
    price: 1980,
    imageUrl: '/images/products/king-banana.png',
    category: 'バナナ',
    stock: 200,
  },
  {
    id: 'prod-002',
    name: 'プレミアムバナナチップス 大容量パック',
    description:
      '厚切りバナナをココナッツオイルでカリッと揚げた贅沢チップス。ゴリラのおやつタイムに最適。500g入りの大満足サイズ。',
    price: 1280,
    imageUrl: '/images/products/banana-chips.png',
    category: 'バナナ',
    stock: 150,
  },
  {
    id: 'prod-003',
    name: 'オーガニックバナナスムージーミックス',
    description:
      '有機栽培バナナをフリーズドライにした粉末ミックス。水を入れてシェイクするだけで濃厚バナナスムージーの完成。プロテイン配合でパワーチャージ。',
    price: 2480,
    imageUrl: '/images/products/banana-smoothie.png',
    category: 'バナナ',
    stock: 100,
  },
  // === ゴリラファッション ===
  {
    id: 'prod-004',
    name: 'ゴリラマッチョ Tシャツ',
    description:
      'シルバーバックの筋肉美をプリントした高品質Tシャツ。肩幅広めの設計で、たくましい胸板も余裕でカバー。綿100%で動きやすい。',
    price: 4980,
    imageUrl: '/images/products/gorilla-tshirt.png',
    category: 'ファッション',
    stock: 120,
  },
  {
    id: 'prod-005',
    name: 'ジャングルカモフラージュ パーカー',
    description:
      '熱帯雨林の葉っぱ柄をモチーフにしたカモ柄パーカー。裏起毛で暖かく、フードは頭をすっぽり覆えるゴリラ仕様。夜のジャングルにも。',
    price: 8900,
    imageUrl: '/images/products/jungle-hoodie.png',
    category: 'ファッション',
    stock: 80,
  },
  {
    id: 'prod-006',
    name: 'シルバーバック レザーベルト',
    description:
      'ゴリラの背中の銀色をイメージしたメタリックバックル付き本革ベルト。太めの幅で存在感抜群。ドラミングしても外れない頑丈設計。',
    price: 6800,
    imageUrl: '/images/products/silverback-belt.png',
    category: 'ファッション',
    stock: 60,
  },
  // === ジャングルギア ===
  {
    id: 'prod-007',
    name: 'ゴリラグリップ ダンベル 30kg',
    description:
      '握りやすい極太グリップを採用した高重量ダンベル。ゴリラ並みの握力を目指すトレーニーに。ラバーコーティングで床も傷つかない。',
    price: 12800,
    imageUrl: '/images/products/gorilla-dumbbell.png',
    category: 'フィットネス',
    stock: 40,
  },
  {
    id: 'prod-008',
    name: 'ツリークライミングロープ 10m',
    description:
      'ジャングルの大木を登るためのプロ仕様クライミングロープ。耐荷重500kg。ゴリラが掴んでも切れない。アウトドアやトレーニングに。',
    price: 7500,
    imageUrl: '/images/products/climbing-rope.png',
    category: 'フィットネス',
    stock: 35,
  },
  {
    id: 'prod-009',
    name: 'ジャングルネスト ハンモック',
    description:
      '木と木の間に張って使える大型ハンモック。ゴリラが寝転んでも余裕のワイドサイズ。防水素材でスコールにも対応。最高の昼寝体験を。',
    price: 9800,
    imageUrl: '/images/products/jungle-hammock.png',
    category: 'アウトドア',
    stock: 50,
  },
  // === ゴリラ教養 ===
  {
    id: 'prod-010',
    name: '図解 ゴリラ学入門 ～霊長類の王者を知る～',
    description:
      'ゴリラの生態・社会構造・コミュニケーションを豊富な写真とイラストで解説。シルバーバックのリーダーシップ論はビジネスにも活かせる。',
    price: 2980,
    imageUrl: '/images/products/gorilla-book.png',
    category: '書籍',
    stock: 150,
  },
  {
    id: 'prod-011',
    name: 'バナナレシピ100選 ～朝食からデザートまで～',
    description:
      'バナナを使った100のレシピを収録。バナナブレッド、バナナカレー、バナナ天ぷらまで。ゴリラシェフ監修の本格レシピ集。',
    price: 1800,
    imageUrl: '/images/products/banana-recipe-book.png',
    category: '書籍',
    stock: 100,
  },
  {
    id: 'prod-012',
    name: 'ドラミング瞑想CD ～ジャングルサウンドで癒し～',
    description:
      'ゴリラのドラミング音と熱帯雨林の環境音を収録したリラクゼーションCD。胸を叩くリズムに合わせて深呼吸すると、野生の本能が目覚める。',
    price: 2200,
    imageUrl: '/images/products/drumming-cd.png',
    category: 'エンタメ',
    stock: 90,
  },
]

async function main() {
  console.log('Seeding catalog database...')

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name: product.name,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        category: product.category,
        stock: product.stock,
      },
      create: product,
    })
    console.log(`  Upserted product: ${product.name}`)
  }

  console.log('Catalog seeding complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
