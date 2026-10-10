import { type Static, Type } from "typebox";
import { CLOSED, RecordId, StockRef, Text, UtcTimestamp } from "./primitives.ts";
import { RecordRef } from "./records.ts";

export const ChatRole = Type.Enum(["trader", "trade-master", "lessons", "auditor"]);

/** A long-running chat. A trader chat belongs to one stock; the other roles have one chat each. */
export const Chat = Type.Union([
	Type.Object(
		{
			id: RecordId,
			role: Type.Literal("trader"),
			stock: StockRef,
			createdAt: UtcTimestamp,
		},
		CLOSED,
	),
	Type.Object(
		{
			id: RecordId,
			role: Type.Enum(["trade-master", "lessons", "auditor"]),
			createdAt: UtcTimestamp,
		},
		CLOSED,
	),
]);

/** What woke a chat: a schedule (after the close, a market hour), or a record (news, a brief, a finding, an answer, a plan coming due). */
export const RunTrigger = Type.Union([
	Type.Object({ kind: Type.Literal("schedule"), schedule: Text }, CLOSED),
	Type.Object({ kind: Type.Literal("record"), record: RecordRef }, CLOSED),
]);

/** One wake of a chat. Several triggers can arrive together and wake it once. */
export const Run = Type.Object(
	{
		id: RecordId,
		chatId: RecordId,
		model: Text,
		startedAt: UtcTimestamp,
		triggers: Type.Array(RunTrigger, { minItems: 1 }),
	},
	CLOSED,
);

/** Enough to judge a tool call later: what was called, why, what came back, what the chat had seen and what it wrote. */
export const ActionLogEntry = Type.Object(
	{
		id: RecordId,
		runId: RecordId,
		at: UtcTimestamp,
		tool: Text,
		arguments: Type.Unknown(),
		reasoning: Type.String({ description: "The model's own words before the call; can be empty" }),
		result: Type.Union([
			Type.Object({ ok: Type.Literal(true), value: Type.Unknown() }, CLOSED),
			Type.Object({ ok: Type.Literal(false), error: Text }, CLOSED),
		]),
		dataSeen: Type.Array(RecordRef),
		recordsWritten: Type.Array(RecordRef),
	},
	CLOSED,
);

export type ChatRole = Static<typeof ChatRole>;
export type Chat = Static<typeof Chat>;
export type RunTrigger = Static<typeof RunTrigger>;
export type Run = Static<typeof Run>;
export type ActionLogEntry = Static<typeof ActionLogEntry>;
