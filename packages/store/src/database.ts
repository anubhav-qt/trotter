import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { StoreError } from "./errors.ts";
import { MIGRATIONS } from "./migrations.ts";

export type Database = DatabaseSync;

/** How long a write waits for another process's write to finish before giving up. */
const BUSY_TIMEOUT_MS = 5_000;

/**
 * Opens Trotter's database, creating it and bringing its tables up to date. `path` is a file,
 * or ":memory:" for a database that lasts only as long as the process (tests).
 */
export function openDatabase(path: string): Database {
	const database = new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });
	try {
		// WAL lets other processes read while one writes.
		database.exec("PRAGMA journal_mode = WAL");
		migrate(database, path);
	} catch (error) {
		// Let go of the file before reporting why it can't be used.
		database.close();
		throw error;
	}
	return database;
}

function migrate(database: Database, path: string): void {
	const current = schemaVersion(database);
	if (current > MIGRATIONS.length) {
		throw new StoreError(
			`The database at ${path} is at version ${current}, newer than this code (${MIGRATIONS.length}). Update Trotter.`,
		);
	}
	for (let index = current; index < MIGRATIONS.length; index++) {
		inTransaction(database, () => {
			database.exec(MIGRATIONS[index]);
			database.exec(`PRAGMA user_version = ${index + 1}`);
		});
	}
}

function schemaVersion(database: Database): number {
	const row = database.prepare("PRAGMA user_version").get();
	const version = row?.user_version;
	if (typeof version !== "number") {
		throw new StoreError("SQLite didn't report the database's version.");
	}
	return version;
}

/**
 * Runs `work` as one write: all of it is stored, or none of it. It takes the write lock at the
 * start, so a write that reads before it writes can't be overtaken by another process.
 */
export function inTransaction<Result>(database: Database, work: () => Result): Result {
	database.exec("BEGIN IMMEDIATE");
	try {
		const result = work();
		database.exec("COMMIT");
		return result;
	} catch (error) {
		// Throw away the half-done write; the caller still gets the error.
		database.exec("ROLLBACK");
		throw error;
	}
}

/** The value of a JSON column, parsed. */
export function jsonColumn(row: Record<string, SQLOutputValue>, column: string): unknown {
	const text = row[column];
	if (typeof text !== "string") {
		throw new StoreError(`Column ${column} doesn't hold JSON text.`);
	}
	return JSON.parse(text);
}

/** The time now, as every stored timestamp is written: UTC ISO 8601. */
export function now(): string {
	return new Date().toISOString();
}
