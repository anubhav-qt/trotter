import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
	appendMessage,
	ChatBusyError,
	endRun,
	listRuns,
	markInterruptedRuns,
	openChat,
	openDatabase,
	openTraderChat,
	readChat,
	readTranscript,
	startRun,
} from "../src/index.ts";

const RELIANCE = { isin: "INE002A01018", symbol: "RELIANCE" };
const TCS = { isin: "INE467B01029", symbol: "TCS" };
const AFTER_CLOSE = [{ kind: "schedule" as const, schedule: "after the close" }];

function newRun(chatId: string) {
	return { chatId, model: "gemini-3.8-flash-high", triggers: AFTER_CLOSE, systemPrompt: "You trade RELIANCE." };
}

test("a stock has one trader chat, however often it's opened", () => {
	const database = openDatabase(":memory:");

	const first = openTraderChat(database, RELIANCE);
	const again = openTraderChat(database, RELIANCE);
	const other = openTraderChat(database, TCS);

	assert.equal(again.id, first.id);
	assert.notEqual(other.id, first.id);
	assert.deepEqual(readChat(database, first.id), first);
});

test("the Trade Master, Lessons and the Auditor have one chat each", () => {
	const database = openDatabase(":memory:");

	const tradeMaster = openChat(database, "trade-master");

	assert.equal(openChat(database, "trade-master").id, tradeMaster.id);
	assert.notEqual(openChat(database, "lessons").id, tradeMaster.id);
	assert.notEqual(openChat(database, "auditor").id, tradeMaster.id);
});

test("a chat runs once at a time", () => {
	const database = openDatabase(":memory:");
	const chat = openTraderChat(database, RELIANCE);
	const first = startRun(database, newRun(chat.id));

	assert.throws(() => startRun(database, newRun(chat.id)), ChatBusyError);

	endRun(database, first.id, { status: "done" });
	const second = startRun(database, newRun(chat.id));

	assert.equal(second.status, "running");
});

test("a run ends once, with when and how", () => {
	const database = openDatabase(":memory:");
	const chat = openTraderChat(database, RELIANCE);
	const run = startRun(database, newRun(chat.id));

	const ended = endRun(database, run.id, { status: "failed", error: "The model answered with an error." });

	assert.equal(ended.status, "failed");
	assert.equal(ended.error, "The model answered with an error.");
	assert.ok(ended.endedAt);
	assert.throws(() => endRun(database, run.id, { status: "done" }), /already ended/);
});

test("runs still going when the harness stopped are marked interrupted when it starts again", () => {
	const database = openDatabase(":memory:");
	const reliance = openTraderChat(database, RELIANCE);
	const tcs = openTraderChat(database, TCS);
	const cutOff = startRun(database, newRun(reliance.id));
	const finished = startRun(database, newRun(tcs.id));
	endRun(database, finished.id, { status: "done" });

	const interrupted = markInterruptedRuns(database);

	assert.deepEqual(
		interrupted.map((run) => run.id),
		[cutOff.id],
	);
	assert.deepEqual(
		listRuns(database, reliance.id).map((run) => run.status),
		["interrupted"],
	);
	assert.deepEqual(
		listRuns(database, tcs.id).map((run) => run.status),
		["done"],
	);
});

test("a transcript keeps every message in order, across runs", () => {
	const database = openDatabase(":memory:");
	const chat = openTraderChat(database, RELIANCE);
	const first = startRun(database, newRun(chat.id));
	appendMessage(database, first, { role: "user", content: "Results are out", timestamp: 1 });
	endRun(database, first.id, { status: "done" });
	const second = startRun(database, newRun(chat.id));
	appendMessage(database, second, { role: "user", content: "Price fell 4%", timestamp: 2 });

	const transcript = readTranscript(database, chat.id);

	assert.deepEqual(
		transcript.map((entry) => [entry.seq, entry.runId, entry.message.timestamp]),
		[
			[1, first.id, 1],
			[2, second.id, 2],
		],
	);
	assert.deepEqual(
		readTranscript(database, chat.id, 1).map((entry) => entry.seq),
		[2],
	);
});

test("a database file keeps everything when it's opened again", () => {
	const folder = mkdtempSync(join(tmpdir(), "trotter-store-"));
	const path = join(folder, "trotter.db");
	try {
		const first = openDatabase(path);
		const chat = openTraderChat(first, RELIANCE);
		first.close();

		const reopened = openDatabase(path);

		assert.deepEqual(readChat(reopened, chat.id), chat);
		reopened.close();
	} finally {
		rmSync(folder, { recursive: true });
	}
});

test("a database from a newer Trotter is refused instead of being changed", () => {
	const folder = mkdtempSync(join(tmpdir(), "trotter-store-"));
	const path = join(folder, "trotter.db");
	try {
		const database = openDatabase(path);
		database.exec("PRAGMA user_version = 99");
		database.close();

		assert.throws(() => openDatabase(path), /newer than this code/);
	} finally {
		rmSync(folder, { recursive: true });
	}
});
