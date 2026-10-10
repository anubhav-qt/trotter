import { randomUUID } from "node:crypto";
import { ActionLogEntry, checkValue } from "@trotter/schemas";
import { type Database, jsonColumn, now } from "./database.ts";

/** Every tool call every chat makes, with enough to judge it later (ADR 0012). Only ever added to. */

export type NewActionLogEntry = Omit<ActionLogEntry, "id" | "at">;

export function appendActionLogEntry(database: Database, newEntry: NewActionLogEntry): ActionLogEntry {
	const entry = checkValue(
		ActionLogEntry,
		{ id: randomUUID(), at: now(), ...newEntry },
		`The action log entry for ${newEntry.tool}`,
	);
	database
		.prepare("INSERT INTO action_log (id, run_id, entry) VALUES (?, ?, ?)")
		.run(entry.id, entry.runId, JSON.stringify(entry));
	return entry;
}

/** A run's tool calls, in the order they finished. */
export function readActionLog(database: Database, runId: string): ActionLogEntry[] {
	const rows = database.prepare("SELECT entry FROM action_log WHERE run_id = ? ORDER BY rowid").all(runId);
	return rows.map((row) =>
		checkValue(ActionLogEntry, jsonColumn(row, "entry"), `An action log entry of run ${runId}`),
	);
}
