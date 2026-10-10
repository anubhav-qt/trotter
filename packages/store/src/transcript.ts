import type { AssistantMessage, ToolResultMessage, UserMessage } from "@trotter/pi-ai";
import { checkValue, type Run } from "@trotter/schemas";
import { Type } from "typebox";
import { type Database, inTransaction, jsonColumn } from "./database.ts";

/**
 * Every chat's transcript, kept whole for as long as the chat lives (ADR 0014): compaction only
 * shortens what the model reads. The system prompt isn't part of it; each run keeps its own.
 */

export type TranscriptMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface TranscriptEntry {
	seq: number;
	runId: string;
	message: TranscriptMessage;
}

/** pi's message format, kept as pi wrote it; only the fields the store relies on are checked. */
const StoredMessage = Type.Object({
	role: Type.Enum(["user", "assistant", "toolResult"]),
	timestamp: Type.Number(),
});

/** Adds a message to the end of its chat's transcript. */
export function appendMessage(database: Database, run: Run, message: TranscriptMessage): TranscriptEntry {
	checkValue(StoredMessage, message, `A message of run ${run.id}`);
	return inTransaction(database, () => {
		const seq = lastSeq(database, run.chatId) + 1;
		database
			.prepare("INSERT INTO messages (chat_id, seq, run_id, message) VALUES (?, ?, ?, ?)")
			.run(run.chatId, seq, run.id, JSON.stringify(message));
		return { seq, runId: run.id, message };
	});
}

/** A chat's transcript in order, from just after `afterSeq`: 0 for all of it. */
export function readTranscript(database: Database, chatId: string, afterSeq = 0): TranscriptEntry[] {
	const rows = database
		.prepare("SELECT seq, run_id, message FROM messages WHERE chat_id = ? AND seq > ? ORDER BY seq")
		.all(chatId, afterSeq);
	const entries: TranscriptEntry[] = [];
	for (const row of rows) {
		const what = `Message ${String(row.seq)} of chat ${chatId}`;
		const message = checkValue(StoredMessage, jsonColumn(row, "message"), what);
		// Checked above for what the store relies on; the rest is pi's, stored as pi wrote it.
		entries.push({ seq: Number(row.seq), runId: String(row.run_id), message: message as TranscriptMessage });
	}
	return entries;
}

function lastSeq(database: Database, chatId: string): number {
	const row = database.prepare("SELECT MAX(seq) AS seq FROM messages WHERE chat_id = ?").get(chatId);
	const seq = row?.seq;
	if (typeof seq === "number") {
		return seq;
	}
	return 0;
}
