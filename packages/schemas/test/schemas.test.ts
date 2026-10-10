import assert from "node:assert/strict";
import { test } from "node:test";
import { type TSchema, Type } from "typebox";
import { Compile } from "typebox/compile";

import { Chat, factRecord, LessonRecord, PricePaise, type RecordRef, TraderDecision } from "../src/index.ts";

const STOCK = { isin: "INE002A01018", symbol: "RELIANCE" };
const CHAT_ID = "3f2b8c1e-5d4a-4e6f-8a9b-0c1d2e3f4a5b";
const RUN_ID = "7a1c2e3d-4b5f-4a6e-9c8d-1e2f3a4b5c6d";
const RECORD_ID = "c4d5e6f7-0a1b-4c2d-8e3f-4a5b6c7d8e9f";
const ORDER: RecordRef = { kind: "order", id: "e1f2a3b4-c5d6-4e7f-8a9b-c0d1e2f3a4b5", version: 1 };

function matches(schema: TSchema, value: unknown): boolean {
	return Compile(schema).Check(value);
}

test("a trader chat must name its stock", () => {
	assert.equal(matches(Chat, { id: CHAT_ID, role: "trader", createdAt: "2026-10-12T10:00:00Z" }), false);
	assert.equal(matches(Chat, { id: CHAT_ID, role: "trader", stock: STOCK, createdAt: "2026-10-12T10:00:00Z" }), true);
});

test("only a trader chat has a stock", () => {
	const tradeMaster = { id: CHAT_ID, role: "trade-master", stock: STOCK, createdAt: "2026-10-12T10:00:00Z" };

	assert.equal(matches(Chat, tradeMaster), false);
});

test("a plan must say when to wake the chat", () => {
	const plan = {
		decision: "plan-and-wait",
		waitingFor: "Thursday's results",
		answers: [],
		reasoning: "Too close to results",
	};

	assert.equal(matches(TraderDecision, { ...plan, wakeWhen: [] }), false);
	assert.equal(matches(TraderDecision, { ...plan, wakeWhen: [{ kind: "time", at: "2026-10-16T12:00:00Z" }] }), true);
	assert.equal(
		matches(TraderDecision, { ...plan, wakeWhen: [{ kind: "price-at-or-below", pricePaise: 138_000 }] }),
		true,
	);
});

test("acting now must point at the orders placed", () => {
	const act = { decision: "act-now", answers: [], reasoning: "Breakout on volume" };

	assert.equal(matches(TraderDecision, { ...act, orders: [] }), false);
	assert.equal(matches(TraderDecision, { ...act, orders: [ORDER] }), true);
});

test("doing nothing carries no orders", () => {
	const nothing = { decision: "do-nothing", answers: [], reasoning: "No edge today" };

	assert.equal(matches(TraderDecision, nothing), true);
	assert.equal(matches(TraderDecision, { ...nothing, orders: [ORDER] }), false);
});

test("a wake price is whole paise above zero", () => {
	assert.equal(matches(PricePaise, 138_000), true);
	assert.equal(matches(PricePaise, 1380.5), false);
	assert.equal(matches(PricePaise, 0), false);
});

const lessonVersion = {
	id: RECORD_ID,
	version: 1,
	kind: "lesson",
	status: "active",
	writtenAt: "2026-10-12T11:00:00Z",
	author: { kind: "chat", chatId: CHAT_ID, runId: RUN_ID, model: "gemini-3.8-flash-high" },
	body: {
		title: "Results week",
		rule: "Don't open a position in the three trading days before the stock's results",
		causes: ["event-risk"],
		sectors: [],
		evidence: [{ kind: "trade", id: ORDER.id, version: 1 }],
		reasoning: "Two losses this month gapped down on results",
	},
};

test("a lesson is stored as a version with who wrote it and with which model", () => {
	assert.equal(matches(LessonRecord, lessonVersion), true);
});

test("an undo is a new version that names the version it puts back", () => {
	const undo = {
		...lessonVersion,
		version: 3,
		reason: "Version 2 dropped the evidence it was built on",
		revertsTo: 1,
		author: { kind: "chat", chatId: CHAT_ID, runId: RUN_ID, model: "claude-opus-5-5" },
	};

	assert.equal(matches(LessonRecord, undo), true);
});

test("a lesson's cause comes from the fixed list", () => {
	const body = { ...lessonVersion.body, causes: ["mercury-in-retrograde"] };

	assert.equal(matches(LessonRecord, { ...lessonVersion, body }), false);
});

test("a fact from a data tool must say where it came from", () => {
	const Example = factRecord("example", Type.Object({ value: Type.Integer() }));
	const fact = {
		...lessonVersion,
		kind: "example",
		author: { kind: "code", component: "example-tool" },
		knownAt: "2026-10-12T10:30:00Z",
		body: { value: 1 },
	};
	const source = { url: "https://www.nseindia.com/", fetchedAt: "2026-10-12T10:31:00Z" };

	assert.equal(matches(Example, { ...fact, sources: [] }), false);
	assert.equal(matches(Example, { ...fact, sources: [source] }), true);
});
