import { randomUUID } from "node:crypto";
import { checkValue, Run, type RunTrigger } from "@trotter/schemas";
import { readChat } from "./chats.ts";
import { type Database, inTransaction, jsonColumn, now } from "./database.ts";
import { ChatBusyError, StoreError } from "./errors.ts";

export interface NewRun {
	chatId: string;
	model: string;
	triggers: RunTrigger[];
	systemPrompt: string;
}

/** How a run ended, when the harness ends it. */
export type RunEnd = { status: "done" } | { status: "stopped" } | { status: "failed"; error: string };

/** Starts a run of a chat. A chat runs once at a time, so while it has a run going this throws ChatBusyError. */
export function startRun(database: Database, newRun: NewRun): Run {
	const run = checkValue(
		Run,
		{ id: randomUUID(), ...newRun, startedAt: now(), status: "running" },
		`The new run of chat ${newRun.chatId}`,
	);
	return inTransaction(database, () => {
		readChat(database, run.chatId);
		const going = database.prepare("SELECT run FROM runs WHERE chat_id = ? AND status = 'running'").get(run.chatId);
		if (going) {
			const goingRun = checkValue(Run, jsonColumn(going, "run"), `The stored run of chat ${run.chatId}`);
			throw new ChatBusyError(`Chat ${run.chatId} already has a run going, since ${goingRun.startedAt}.`);
		}
		database
			.prepare("INSERT INTO runs (id, chat_id, status, run) VALUES (?, ?, ?, ?)")
			.run(run.id, run.chatId, run.status, JSON.stringify(run));
		return run;
	});
}

/** Ends a run that is going. A run ends once. */
export function endRun(database: Database, runId: string, end: RunEnd): Run {
	return inTransaction(database, () => {
		const run = readRun(database, runId);
		if (run.status !== "running") {
			throw new StoreError(`Run ${runId} already ended: ${run.status}.`);
		}
		const ended = checkValue(Run, { ...run, ...end, endedAt: now() }, `The end of run ${runId}`);
		saveEnd(database, ended);
		return ended;
	});
}

/**
 * Ends every run still going as interrupted. The harness calls this when it starts: it's the only
 * process that runs chats, so a run still going then was cut off when the harness last stopped.
 */
export function markInterruptedRuns(database: Database): Run[] {
	return inTransaction(database, () => {
		const rows = database.prepare("SELECT run FROM runs WHERE status = 'running'").all();
		const interrupted: Run[] = [];
		for (const row of rows) {
			const run = checkValue(Run, jsonColumn(row, "run"), "A stored run");
			const ended = checkValue(Run, { ...run, status: "interrupted", endedAt: now() }, `The end of run ${run.id}`);
			saveEnd(database, ended);
			interrupted.push(ended);
		}
		return interrupted;
	});
}

export function readRun(database: Database, id: string): Run {
	const row = database.prepare("SELECT run FROM runs WHERE id = ?").get(id);
	if (!row) {
		throw new StoreError(`There is no run ${id}.`);
	}
	return checkValue(Run, jsonColumn(row, "run"), `Stored run ${id}`);
}

/** A chat's runs, oldest first. */
export function listRuns(database: Database, chatId: string): Run[] {
	const rows = database.prepare("SELECT run FROM runs WHERE chat_id = ? ORDER BY rowid").all(chatId);
	return rows.map((row) => checkValue(Run, jsonColumn(row, "run"), `A stored run of chat ${chatId}`));
}

function saveEnd(database: Database, ended: Run): void {
	database
		.prepare("UPDATE runs SET status = ?, run = ? WHERE id = ?")
		.run(ended.status, JSON.stringify(ended), ended.id);
}
