import { defineLegacyCard, type LegacyAgentCard } from '@konnect-demo/a2a-support'

export function orderCard(selfUrl: string): LegacyAgentCard {
  return defineLegacyCard({
    name: 'Order Agent',
    description:
      'ジャングルストアのカート操作と注文確定を担当する専門エージェント。数量の確認と最終確認を経て注文を確定する。',
    url: selfUrl.endsWith('/') ? selfUrl : `${selfUrl}/`,
    skills: [
      {
        id: 'cart-and-order',
        name: 'カート操作と注文確定',
        description:
          '指定された商品をカートに追加し、数量・合計金額をユーザーに確認したうえで注文を確定する。確認が取れるまで注文は実行しない。',
        tags: ['cart', 'order', 'checkout'],
        examples: ['Gorilla Mug を2つ注文したい', 'カートの中身をそのまま注文して'],
      },
    ],
  })
}
