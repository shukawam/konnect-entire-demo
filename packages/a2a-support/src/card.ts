import type { AgentCard } from '@a2a-js/sdk'
import { duplicateInterfacesForLegacy } from '@a2a-js/sdk/compat/v0_3'

export interface LegacyCardSkill {
  id: string
  name: string
  description: string
  tags: string[]
  examples: string[]
}

// A2A v0.3 形式の Agent Card。Kong ai-a2a-proxy はトップレベル url を
// Gateway アドレスへ書き換えるため、url はサービス自身の内部 URL でよい。
export interface LegacyAgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  preferredTransport: 'JSONRPC'
  version: string
  capabilities: { streaming: boolean; pushNotifications: boolean }
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: LegacyCardSkill[]
}

export interface LegacyCardInput {
  name: string
  description: string
  url: string
  version?: string
  skills: LegacyCardSkill[]
}

export function defineLegacyCard(input: LegacyCardInput): LegacyAgentCard {
  return {
    protocolVersion: '0.3.0',
    name: input.name,
    description: input.description,
    url: input.url,
    preferredTransport: 'JSONRPC',
    version: input.version ?? '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: input.skills,
  }
}

// DefaultRequestHandler に渡す v1 形式カード。legacy カードから機械的に組み立てる。
export function toCoreCard(card: LegacyAgentCard): AgentCard {
  return {
    name: card.name,
    description: card.description,
    supportedInterfaces: duplicateInterfacesForLegacy(
      [{ url: card.url, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: '1.0' }],
      ['JSONRPC'],
    ),
    provider: undefined,
    version: card.version,
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: card.defaultInputModes,
    defaultOutputModes: card.defaultOutputModes,
    skills: card.skills.map((s) => ({
      ...s,
      inputModes: [],
      outputModes: [],
      securityRequirements: [],
    })),
    signatures: [],
  }
}
