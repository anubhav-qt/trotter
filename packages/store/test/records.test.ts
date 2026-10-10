import assert from "node:assert/strict";
import { test } from "node:test";
import { type Author, CLOSED, SchemaError, Text, versionedRecord } from "@trotter/schemas";
import { Type } from "typebox";

import {
	changeRecord,
	createRecord,
	listLatestRecords,
	openDatabase,
	RecordConflictError,
	readLatestRecord,
	readRecord,
	readRecordHistory,
	revertRecord,
	StoreError,
} from "../src/index.ts";

const Note = versionedRecord("note", Type.Object({ text: Text }, CLOSED));

const LESSONS_CHAT: Author = {
	kind: "chat",
	chatId: "3f2b8c1e-5d4a-4e6f-8a9b-0c1d2e3f4a5b",
	runId: "7a1c2e3d-4b5f-4a6e-9c8d-1e2f3a4b5c6d",
	model: "gemini-3.8-flash-high",
};
const AUDITOR_CHAT: Author = { ...LESSONS_CHAT, model: "claude-opus-5-5" };

function refOf(record: { kind: string; id: string; version: number }) {
	return { kind: record.kind, id: record.id, version: record.version };
}

test("a new record is version 1, active, with who wrote it", () => {
	const database = openDatabase(":memory:");

	const note = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });

	assert.equal(note.version, 1);
	assert.equal(note.status, "active");
	assert.deepEqual(note.author, LESSONS_CHAT);
	assert.deepEqual(readRecord(database, Note, refOf(note)), note);
});

test("a change is the next version, and every earlier version stays readable as it was", () => {
	const database = openDatabase(":memory:");
	const first = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });

	const second = changeRecord(database, Note, {
		from: refOf(first),
		status: "active",
		author: LESSONS_CHAT,
		reason: "Sharper wording",
		body: { text: "Second" },
	});

	assert.equal(second.version, 2);
	assert.equal(second.reason, "Sharper wording");
	assert.deepEqual(readRecord(database, Note, refOf(first)), first);
	assert.deepEqual(readLatestRecord(database, Note, "note", first.id), second);
	assert.deepEqual(readRecordHistory(database, Note, "note", first.id), [first, second]);
});

test("a change made from a version that is no longer the latest is refused, so nothing is lost", () => {
	const database = openDatabase(":memory:");
	const first = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });
	const change = { status: "active" as const, author: LESSONS_CHAT, reason: "Edit", body: { text: "Edited" } };
	changeRecord(database, Note, { ...change, from: refOf(first) });

	assert.throws(() => changeRecord(database, Note, { ...change, from: refOf(first) }), RecordConflictError);
	assert.equal(readRecordHistory(database, Note, "note", first.id).length, 2);
});

test("a change can't turn a record into another kind", () => {
	const database = openDatabase(":memory:");
	const first = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });

	assert.throws(
		() =>
			changeRecord(database, Note, {
				from: { ...refOf(first), kind: "lesson" },
				status: "active",
				author: LESSONS_CHAT,
				reason: "Edit",
				body: { text: "Edited" },
			}),
		/is a note, not a lesson/,
	);
});

test("a change must say why", () => {
	const database = openDatabase(":memory:");
	const first = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });

	assert.throws(
		() =>
			changeRecord(database, Note, {
				from: refOf(first),
				status: "retired",
				author: LESSONS_CHAT,
				reason: "",
				body: first.body,
			}),
		SchemaError,
	);
});

test("an undo puts back an earlier version's body and status, and names the version it put back", () => {
	const database = openDatabase(":memory:");
	const first = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });
	const rejected = changeRecord(database, Note, {
		from: refOf(first),
		status: "rejected",
		author: LESSONS_CHAT,
		reason: "Dropped the evidence",
		body: { text: "Worse" },
	});

	const undo = revertRecord(database, Note, {
		from: refOf(rejected),
		to: 1,
		author: AUDITOR_CHAT,
		reason: "Version 2 dropped the evidence it was built on",
	});

	assert.equal(undo.version, 3);
	assert.equal(undo.revertsTo, 1);
	assert.equal(undo.status, "active");
	assert.deepEqual(undo.body, first.body);
	assert.deepEqual(undo.author, AUDITOR_CHAT);
});

test("an undo must point back to an earlier version", () => {
	const database = openDatabase(":memory:");
	const first = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });
	const undo = { author: AUDITOR_CHAT, reason: "Undo" };

	assert.throws(() => revertRecord(database, Note, { ...undo, from: refOf(first), to: 1 }), /nothing earlier/);

	const second = changeRecord(database, Note, {
		from: refOf(first),
		status: "active",
		author: LESSONS_CHAT,
		reason: "Edit",
		body: { text: "Second" },
	});

	assert.throws(() => revertRecord(database, Note, { ...undo, from: refOf(second), to: 2 }), StoreError);
	assert.throws(() => revertRecord(database, Note, { ...undo, from: refOf(second), to: 0 }), StoreError);
});

test("a body that doesn't match its schema is never stored", () => {
	const database = openDatabase(":memory:");

	assert.throws(
		() => createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "", extra: 1 } }),
		SchemaError,
	);
	assert.deepEqual(listLatestRecords(database, Note, "note"), []);
});

test("listing a kind gives the latest version of each record, filtered by status when asked", () => {
	const database = openDatabase(":memory:");
	const kept = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "Kept" } });
	const dropped = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "Dropped" } });
	const retired = changeRecord(database, Note, {
		from: refOf(dropped),
		status: "retired",
		author: LESSONS_CHAT,
		reason: "No longer true",
		body: dropped.body,
	});

	assert.deepEqual(listLatestRecords(database, Note, "note"), [kept, retired]);
	assert.deepEqual(listLatestRecords(database, Note, "note", "active"), [kept]);
});

test("a stored version can never be edited or deleted, even with raw SQL", () => {
	const database = openDatabase(":memory:");
	const note = createRecord(database, Note, { kind: "note", author: LESSONS_CHAT, body: { text: "First" } });

	assert.throws(() => database.prepare("UPDATE records SET status = 'rejected'").run(), /never changed/);
	assert.throws(() => database.prepare("DELETE FROM records").run(), /never deleted/);
	assert.deepEqual(readRecord(database, Note, refOf(note)), note);
});
