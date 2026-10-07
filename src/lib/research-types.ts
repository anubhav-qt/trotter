// Shapes shared by the research API and the UI. Type-only imports, so this
// file is safe to import from client components.

import type { Verification } from './market/verify'
import type { HistorySource } from './market/types'
import type { Horizon, HorizonAnalysis } from './scoring'
import type { TrackRecordSummary } from './track-record'

export type { Horizon, HorizonAnalysis, TrackRecordSummary, Verification }

export interface NewsSummary {
  title: string
  link: string
  publisher: string
  publishedAt: string
  reason: string
}

export interface DataQuality {
  historySource: HistorySource
  sessions: number
  firstDate: string
  fetchedAt: string
  stale: boolean
  verification: Verification
  warnings: string[]
}

export interface ResearchResult {
  symbol: string
  name: string
  industry: string | null
  modelVersion: string
  /** Last completed session the scores are based on. */
  asOf: string
  lastClose: number
  /** Delayed live quote for display only (Yahoo); null outside market data availability. */
  quote: { price: number | null; change: number | null; changePercent: number | null } | null
  analyses: Record<Horizon, HorizonAnalysis>
  stats: {
    marketCap: number | null
    pe: number | null
    sectorPe: number | null
    peerCount: number
    eps: number | null
    lastVolume: number | null
    avgVolume: number | null
    high52: number | null
    low52: number | null
  }
  news: { good: NewsSummary[]; bad: NewsSummary[]; neutral: NewsSummary[] }
  data: DataQuality
  trackRecord: TrackRecordSummary
}
