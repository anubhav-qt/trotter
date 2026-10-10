import assert from "node:assert/strict";
import { test } from "node:test";
import type { StreamFn } from "@trotter/pi-agent";
import { contentText, type Message } from "@trotter/pi-ai";
import { CLOSED, Text, versionedRecord } from "@trotter/schemas";
import { createRecord, openDatabase, openTraderChat, readActionLog, readRecord, readTranscript } from "@trotter/store";
import { Type } from "typebox";

import { type RunChatInput, runChat } from "../src/run-chat.ts";
import type { TrotterTool } from "../src/tools.ts";
import { reply, scriptedModel, streamOf, TEST_MODEL } from "./scripted-model.ts";

const RELIANCE = { isin: "INE002A01018", symbol: "RELIANCE" };

const Note = versionedRecord("note", Type.Object({ text: Text }, CLOSED));
const NoteArguments = Type.Object({ text: Text }, CLOSED);

/** A system tool for tests: it stores a note and says which record it wrote. */
function noteTool(calls: { count: number } = { count: 0 }): TrotterTool<typeof NoteArguments> {
	return {
		name: "write_note",
		label: "Write a note",
		description: "Stores a note.",
		parameters: NoteArguments,
		async execute(params, context) {
			calls.count++;
			const note = createRecord(context.database, Note, { kind: "note", author: context.author, body: params });
			const ref = { kind: note.kind, id: note.id, version: note.version };
			return { value: { stored: ref }, dataSeen: [], recordsWritten: [ref] };
		},
	};
}

function setUp(streamFn: StreamFn, tools: TrotterTool[] = []): RunChatInput {
	const database = openDatabase(":memory:");
	return {
		database,
		chat: openTraderChat(database, RELIANCE),
		model: TEST_MODEL,
		thinkingLevel: "off",
		triggers: [{ kind: "schedule", schedule: "after the close" }],
		systemPrompt: "You trade RELIANCE.",
		prompt: "The market has closed.",
		tools,
		apiKey: "test-key",
		streamFn,
	};
}

function textsOf(messages: readonly Message[]): string[] {
	return messages.map((message) => {
		if (message.role === "assistant") {
			return `${message.role}: ${contentText(message.content.filter((block) => block.type === "text"))}`;
		}
		return `${message.role}: ${contentText(message.content)}`;
	});
}

test("a run stores the whole exchange, keeps what the chat was told, and ends done", async () => {
	const model = scriptedModel([reply([{ type: "text", text: "No edge today." }])]);
	const input = setUp(model.streamFn);

	const run = await runChat(input);

	assert.equal(run.status, "done");
	assert.equal(run.systemPrompt, "You trade RELIANCE.");
	assert.deepEqual(textsOf(readTranscript(input.database, input.chat.id).map((entry) => entry.message)), [
		"user: The market has closed.",
		"assistant: No edge today.",
	]);
	assert.deepEqual(textsOf(model.requests[0]), ["system: You trade RELIANCE.", "user: The market has closed."]);
});

test("every tool call is logged with its arguments, the reasoning before it, its result and what it wrote", async () => {
	const model = scriptedModel([
		reply(
			[
				{ type: "thinking", thinking: "Results beat estimates." },
				{ type: "text", text: "Writing it down." },
				{ type: "toolCall", id: "call-1", name: "write_note", arguments: { text: "Beat estimates" } },
			],
			"toolUse",
		),
		reply([{ type: "text", text: "Noted." }]),
	]);
	const input = setUp(model.streamFn, [noteTool()]);

	const run = await runChat(input);

	const [entry] = readActionLog(input.database, run.id);
	assert.equal(entry.tool, "write_note");
	assert.equal(entry.toolCallId, "call-1");
	assert.deepEqual(entry.arguments, { text: "Beat estimates" });
	assert.equal(entry.reasoning, "Results beat estimates.\n\nWriting it down.");
	assert.equal(entry.result.ok, true);
	assert.equal(entry.recordsWritten.length, 1);
	const note = readRecord(input.database, Note, entry.recordsWritten[0]);
	assert.deepEqual(note.author, { kind: "chat", chatId: input.chat.id, runId: run.id, model: TEST_MODEL.id });
	assert.deepEqual(
		readTranscript(input.database, input.chat.id).map((stored) => stored.message.role),
		["user", "assistant", "toolResult", "assistant"],
	);
});

test("a call whose arguments don't match is never run, and the model gets every problem back", async () => {
	const calls = { count: 0 };
	const model = scriptedModel([
		reply([{ type: "toolCall", id: "call-1", name: "write_note", arguments: { text: 5, mood: "sure" } }], "toolUse"),
		reply([{ type: "text", text: "I'll fix it." }]),
	]);
	const input = setUp(model.streamFn, [noteTool(calls)]);

	const run = await runChat(input);

	assert.equal(calls.count, 0);
	const [entry] = readActionLog(input.database, run.id);
	assert.equal(entry.result.ok, false);
	const toldModel = textsOf(model.requests[1]).at(-1) ?? "";
	for (const problem of ["text: must be string", 'unexpected field "mood"']) {
		assert.ok(!entry.result.ok && entry.result.error.includes(problem), `the log names: ${problem}`);
		assert.ok(toldModel.includes(problem), `the model is told: ${problem}`);
	}
});

test("the next run carries on from the chat's transcript", async () => {
	const first = scriptedModel([reply([{ type: "text", text: "Watching for Thursday's results." }])]);
	const input = setUp(first.streamFn);
	await runChat(input);
	const second = scriptedModel([reply([{ type: "text", text: "Results are in." }])]);

	await runChat({ ...input, prompt: "Results are out.", streamFn: second.streamFn });

	assert.deepEqual(textsOf(second.requests[0]), [
		"system: You trade RELIANCE.",
		"user: The market has closed.",
		"assistant: Watching for Thursday's results.",
		"user: Results are out.",
	]);
});

test("a model error ends the run as failed, with the error kept", async () => {
	const model = scriptedModel([reply([], "error", "The account is out of quota.")]);
	const input = setUp(model.streamFn);

	const run = await runChat(input);

	assert.equal(run.status, "failed");
	assert.equal(run.error, "The account is out of quota.");
});

test("stopping a run reaches the model call and ends the run as stopped", async () => {
	const controller = new AbortController();
	const streamFn: StreamFn = (_model, _context, options) => {
		controller.abort();
		const stopReason = options?.signal?.aborted ? "aborted" : "stop";
		return streamOf(reply([], stopReason));
	};
	const input = setUp(streamFn);

	const run = await runChat({ ...input, signal: controller.signal });

	assert.equal(run.status, "stopped");
});
