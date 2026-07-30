import { defineLegacyCard, type LegacyAgentCard } from '@konnect-demo/a2a-support'

export function recommendationCard(selfUrl: string): LegacyAgentCard {
  return defineLegacyCard({
    name: 'Recommendation Agent',
    description:
      'ジャングルストアの商品カタログから、ユーザーの好み・用途をヒアリングして最適な商品を提案する専門エージェント。',
    url: selfUrl.endsWith('/') ? selfUrl : `${selfUrl}/`,
    skills: [
      {
        id: 'product-recommendation',
        name: '商品の提案',
        description:
          'ユーザーの好み（用途・予算・好きな色など）を聞き出し、カタログを検索して商品を提案する。情報が足りない場合は質問を返す。',
        tags: ['recommendation', 'catalog'],
        examples: ['アウトドアで使えるマグカップを探している', 'プレゼントにおすすめの商品は？'],
      },
    ],
  })
}
