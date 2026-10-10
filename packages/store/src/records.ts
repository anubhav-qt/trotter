import { randomUUID } from "node:crypto";
import type { SQLOutputValue } from "node:sqlite";
import { type Author, checkValue, RecordId, type RecordRef, RecordStatus, Text } from "@trotter/schemas";
import { type Static, type TSchema, Type } from "typebox";
import { type Database, inTransaction, jsonColumn, now } from "./database.ts";
import { RecordConflictError, StoreError } from "./errors.ts";

/**
 * Every version of every record (ADR 0023). Nothing is overwritten: a change, a retirement or an
 * undo is a new version, and the store keeps their order: each version follows the latest one,
 * keeps its id and kind, says why it changed, and an undo names the earlier version it puts back.
 *
 * Each call takes the record's schema (such as `LessonRecord`) and checks every version with it
 * on the way in and on the way out.
 */

/** The fields of a stored version the store itself relies on; each kind's schema checks the rest. */
const StoredVersion = Type.Object({
	id: RecordId,
	version: Type.Integer({ minimum: 1 }),
	kind: Text,
	status: RecordStatus,
	body: Type.Unknown(),
});

type StoredVersion = Static<typeof StoredVersion>;

export interface FirstVersion {
	kind: string;
	author: Author;
	body: unknown;
	/** Active unless given. */
	status?: RecordStatus;
}

export interface NextVersion {
	/** The version the writer read. It must still be the latest. */
	from: RecordRef;
	status: RecordStatus;
	author: Author;
	reason: string;
	body: unknown;
}

export interface Undo {
	/** The version the writer read. It must still be the latest. */
	from: RecordRef;
	/** The earlier version to put back. */
	to: number;
	author: Author;
	reason: string;
}

/** Stores a new record as its version 1. */
export function createRecord<Schema extends TSchema>(
	database: Database,
	schema: Schema,
	first: FirstVersion,
): Static<Schema> {
	const fields: StoredVersion = {
		id: randomUUID(),
		version: 1,
		kind: first.kind,
		status: first.status ?? "active",
		body: first.body,
	};
	const record = checkValue(schema, { ...fields, writtenAt: now(), author: first.author }, `The new ${first.kind}`);
	inTransaction(database, () => insertVersion(database, fields, record));
	return record;
}

/** Stores the next version of a record: a change, a retirement or a rejection. */
export function changeRecord<Schema extends TSchema>(
	database: Database,
	schema: Schema,
	next: NextVersion,
): Static<Schema> {
	return inTransaction(database, () => {
		const latest = readLatestStored(database, next.from.id);
		checkFollowsLatest(latest, next.from);
		const fields: StoredVersion = {
			id: latest.id,
			version: latest.version + 1,
			kind: latest.kind,
			status: next.status,
			body: next.body,
		};
		const version = { ...fields, writtenAt: now(), author: next.author, reason: next.reason };
		const record = checkValue(schema, version, `Version ${fields.version} of ${latest.kind} ${latest.id}`);
		insertVersion(database, fields, record);
		return record;
	});
}

/** Stores the next version as a copy of an earlier one, its body and its status: an undo. */
export function revertRecord<Schema extends TSchema>(database: Database, schema: Schema, undo: Undo): Static<Schema> {
	return inTransaction(database, () => {
		const latest = readLatestStored(database, undo.from.id);
		checkFollowsLatest(latest, undo.from);
		checkIsEarlier(latest, undo.to);
		const target = readStored(database, latest.id, undo.to);
		const fields: StoredVersion = {
			id: latest.id,
			version: latest.version + 1,
			kind: latest.kind,
			status: target.status,
			body: target.body,
		};
		const version = {
			...fields,
			writtenAt: now(),
			author: undo.author,
			reason: undo.reason,
			revertsTo: undo.to,
		};
		const record = checkValue(schema, version, `Version ${fields.version} of ${latest.kind} ${latest.id}`);
		insertVersion(database, fields, record);
		return record;
	});
}

/** One exact version, as it was written. */
export function readRecord<Schema extends TSchema>(database: Database, schema: Schema, ref: RecordRef): Static<Schema> {
	const row = database
		.prepare("SELECT record FROM records WHERE id = ? AND version = ? AND kind = ?")
		.get(ref.id, ref.version, ref.kind);
	if (!row) {
		throw new StoreError(`There is no version ${ref.version} of ${ref.kind} ${ref.id}.`);
	}
	return checkRow(schema, row, `Stored ${ref.kind} ${ref.id} version ${ref.version}`);
}

/** The latest version of a record. */
export function readLatestRecord<Schema extends TSchema>(
	database: Database,
	schema: Schema,
	kind: string,
	id: string,
): Static<Schema> {
	const row = database
		.prepare("SELECT record FROM records WHERE id = ? AND kind = ? ORDER BY version DESC LIMIT 1")
		.get(id, kind);
	if (!row) {
		throw new StoreError(`There is no ${kind} ${id}.`);
	}
	return checkRow(schema, row, `Stored ${kind} ${id}`);
}

/** Every version of a record, oldest first. */
export function readRecordHistory<Schema extends TSchema>(
	database: Database,
	schema: Schema,
	kind: string,
	id: string,
): Static<Schema>[] {
	const rows = database.prepare("SELECT record FROM records WHERE id = ? AND kind = ? ORDER BY version").all(id, kind);
	return rows.map((row) => checkRow(schema, row, `Stored ${kind} ${id}`));
}

/** The latest version of every record of a kind, least recently written first; only those with `status` when given. */
export function listLatestRecords<Schema extends TSchema>(
	database: Database,
	schema: Schema,
	kind: string,
	status?: RecordStatus,
): Static<Schema>[] {
	const latestOfEach = `
		SELECT record FROM records AS r
		WHERE r.kind = ? AND r.version = (SELECT MAX(version) FROM records WHERE id = r.id)`;
	let rows: Record<string, SQLOutputValue>[];
	if (status === undefined) {
		rows = database.prepare(`${latestOfEach} ORDER BY r.rowid`).all(kind);
	} else {
		rows = database.prepare(`${latestOfEach} AND r.status = ? ORDER BY r.rowid`).all(kind, status);
	}
	return rows.map((row) => checkRow(schema, row, `A stored ${kind}`));
}

function insertVersion(database: Database, fields: StoredVersion, record: unknown): void {
	database
		.prepare("INSERT INTO records (id, version, kind, status, record) VALUES (?, ?, ?, ?, ?)")
		.run(fields.id, fields.version, fields.kind, fields.status, JSON.stringify(record));
}

function readLatestStored(database: Database, id: string): StoredVersion {
	const row = database.prepare("SELECT record FROM records WHERE id = ? ORDER BY version DESC LIMIT 1").get(id);
	if (!row) {
		throw new StoreError(`There is no record ${id}.`);
	}
	return checkRow(StoredVersion, row, `Stored record ${id}`);
}

function readStored(database: Database, id: string, version: number): StoredVersion {
	const row = database.prepare("SELECT record FROM records WHERE id = ? AND version = ?").get(id, version);
	if (!row) {
		throw new StoreError(`Record ${id} has no version ${version}.`);
	}
	return checkRow(StoredVersion, row, `Stored record ${id} version ${version}`);
}

function checkFollowsLatest(latest: StoredVersion, from: RecordRef): void {
	if (latest.kind !== from.kind) {
		throw new StoreError(`Record ${latest.id} is a ${latest.kind}, not a ${from.kind}.`);
	}
	if (latest.version !== from.version) {
		throw new RecordConflictError(
			`${latest.kind} ${latest.id} is at version ${latest.version} now, not ${from.version}. Read it again before changing it.`,
		);
	}
}

function checkIsEarlier(latest: StoredVersion, to: number): void {
	if (latest.version === 1) {
		throw new StoreError(`${latest.kind} ${latest.id} has only version 1, so there's nothing earlier to put back.`);
	}
	if (to < 1 || to >= latest.version) {
		throw new StoreError(
			`An undo puts back an earlier version: ${latest.kind} ${latest.id} has versions 1 to ${latest.version - 1} before its latest.`,
		);
	}
}

function checkRow<Schema extends TSchema>(
	schema: Schema,
	row: Record<string, SQLOutputValue>,
	what: string,
): Static<Schema> {
	return checkValue(schema, jsonColumn(row, "record"), what);
}
