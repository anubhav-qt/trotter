import { Agent, type AgentEvent, type AgentToolResult, type StreamFn, type ThinkingLevel } from "@trotter/pi-agent";
import { type Api, type AssistantMessage, contentText, type Model, streamSimple } from "@trotter/pi-ai";
import type { ActionLogEntry, Author, Chat, Run, RunTrigger } from "@trotter/schemas";
import {
	appendActionLogEntry,
	appendMessage,
	type Database,
	endRun,
	type RunEnd,
	readTranscript,
	startRun,
} from "@trotter/store";
import { type ToolOutput, type TrotterTool, toAgentTool } from "./tools.ts";

export interface RunChatInput {
	database: Database;
	chat: Chat;
	model: Model<Api>;
	thinkingLevel: ThinkingLevel;
	triggers: RunTrigger[];
	/** The chat's instructions for this run, rendered from its template. */
	systemPrompt: string;
	/** The run's opening message, rendered from its template: what woke the chat. */
	prompt: string;
	tools: TrotterTool[];
	apiKey: string;
	/** How the model is called. Tests pass a stand-in. */
	streamFn?: StreamFn;
	/** Stops the run: the model stops and the run ends as stopped. */
	signal?: AbortSignal;
}

/** A tool call as the model made it, kept until the call finishes and is logged. */
interface MadeCall {
	arguments: unknown;
	reasoning: string;
}

/**
 * One run of a chat: the model reads the chat's transcript and the new prompt, then calls tools
 * until it's done. Every message is stored as it ends and every tool call is logged as it
 * finishes, so a run cut off halfway still leaves its record. Returns the ended run.
 */
export async function runChat(input: RunChatInput): Promise<Run> {
	const { database, chat } = input;
	const run = startRun(database, {
		chatId: chat.id,
		model: input.model.id,
		triggers: input.triggers,
		systemPrompt: input.systemPrompt,
	});
	const author: Author = { kind: "chat", chatId: chat.id, runId: run.id, model: input.model.id };
	const history = readTranscript(database, chat.id).map((entry) => entry.message);
	const outputs = new Map<string, ToolOutput>();
	const onOutput = (toolCallId: string, output: ToolOutput) => outputs.set(toolCallId, output);

	const agent = new Agent({
		initialState: {
			systemPrompt: input.systemPrompt,
			model: input.model,
			thinkingLevel: input.thinkingLevel,
			tools: input.tools.map((tool) => toAgentTool(tool, { database, chat, run, author }, onOutput)),
			messages: history,
		},
		streamFn: input.streamFn ?? streamSimple,
		getApiKey: () => input.apiKey,
		sessionId: chat.id,
	});
	agent.subscribe(recordEvents(database, run, outputs));

	const stop = () => agent.abort();
	input.signal?.addEventListener("abort", stop, { once: true });
	try {
		await agent.prompt(input.prompt);
	} catch (error) {
		// The loop reports model failures as messages; reaching here means storing the run itself failed.
		return endRun(database, run.id, { status: "failed", error: errorText(error) });
	} finally {
		input.signal?.removeEventListener("abort", stop);
	}
	return endRun(database, run.id, endOf(agent.state.messages));
}

/** Stores each message as it ends and logs each tool call as it finishes. */
function recordEvents(database: Database, run: Run, outputs: Map<string, ToolOutput>) {
	const madeCalls = new Map<string, MadeCall>();
	return (event: AgentEvent) => {
		if (event.type === "message_end") {
			// The system prompt is kept on the run, not in the transcript.
			if (event.message.role === "system") {
				return;
			}
			appendMessage(database, run, event.message);
			if (event.message.role === "assistant") {
				rememberCalls(event.message, madeCalls);
			}
			return;
		}
		if (event.type === "tool_execution_end") {
			const madeCall = madeCalls.get(event.toolCallId);
			if (!madeCall) {
				throw new Error(`Tool call ${event.toolCallId} finished, but no assistant message made it.`);
			}
			const result: AgentToolResult<unknown> = event.result;
			appendActionLogEntry(database, {
				runId: run.id,
				toolCallId: event.toolCallId,
				tool: event.toolName,
				arguments: madeCall.arguments,
				reasoning: madeCall.reasoning,
				...outcomeOf(outputs.get(event.toolCallId), result),
			});
		}
	};
}

function rememberCalls(message: AssistantMessage, madeCalls: Map<string, MadeCall>): void {
	const reasoning = reasoningOf(message);
	for (const block of message.content) {
		if (block.type === "toolCall") {
			madeCalls.set(block.id, { arguments: block.arguments, reasoning });
		}
	}
}

/** The model's own words in the message that made the calls: its visible thinking, then its text. */
function reasoningOf(message: AssistantMessage): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block.type === "thinking" && !block.redacted) {
			parts.push(block.thinking);
		}
		if (block.type === "text") {
			parts.push(block.text);
		}
	}
	return parts.join("\n\n").trim();
}

type Outcome = Pick<ActionLogEntry, "result" | "dataSeen" | "recordsWritten">;

/** A tool that ran hands back its output; anything else (bad arguments, an unknown tool, a throw) is an error. */
function outcomeOf(output: ToolOutput | undefined, result: AgentToolResult<unknown>): Outcome {
	if (output) {
		return {
			result: { ok: true, value: output.value },
			dataSeen: output.dataSeen,
			recordsWritten: output.recordsWritten,
		};
	}
	const error = contentText(result.content) || "The tool failed without saying why.";
	return { result: { ok: false, error }, dataSeen: [], recordsWritten: [] };
}

function endOf(messages: readonly { role: string }[]): RunEnd {
	const last = lastAssistantMessage(messages);
	if (!last) {
		return { status: "failed", error: "The model never answered." };
	}
	if (last.stopReason === "aborted") {
		return { status: "stopped" };
	}
	if (last.stopReason === "error") {
		return { status: "failed", error: last.errorMessage ?? "The model answered with an error." };
	}
	return { status: "done" };
}

function lastAssistantMessage(messages: readonly { role: string }[]): AssistantMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (isAssistantMessage(message)) {
			return message;
		}
	}
	return undefined;
}

function isAssistantMessage(message: { role: string }): message is AssistantMessage {
	return message.role === "assistant";
}

function errorText(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
