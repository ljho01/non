import { agentRequest } from './desktop'
import type { IndexSnapshot, LinkResolution, SearchHit } from '@/shared/contracts/links'

export const knowledge = {
  query: (path: string, rebuild = false) =>
    agentRequest<IndexSnapshot>(rebuild ? 'index:rebuild' : 'index:query', { path }),
  search: (query: string) => agentRequest<SearchHit[]>('index:search', { query }),
  resolve: (path: string, target: string) =>
    agentRequest<LinkResolution>('index:resolve', { path, target }),
}
