import { type Static, Type } from "typebox";
import { CLOSED, Text } from "./primitives.ts";
import { versionedRecord } from "./records.ts";

/**
 * What a chat keeps when it compacts (ADR 0014). No numbers: prices, positions, P&L and scores
 * come from the engine at the next run. The earlier summary is folded into each new one.
 */
export const CompactionSummary = Type.Object(
	{
		soFar: Text,
		learnings: Type.Array(Text),
		feedback: Type.Array(Text, { description: "Auditor findings, Trade Master briefs and lessons it received" }),
		dos: Type.Array(Text),
		donts: Type.Array(Text),
		nextSteps: Type.Array(Text),
	},
	CLOSED,
);

export const CompactionSummaryRecord = versionedRecord("compaction-summary", CompactionSummary);

export type CompactionSummary = Static<typeof CompactionSummary>;
export type CompactionSummaryRecord = Static<typeof CompactionSummaryRecord>;
