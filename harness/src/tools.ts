import type { AgentTool } from "@trotter/pi-agent";
import type { JsonValue } from "@trotter/pi-ai";
import { type Author, type Chat, checkValue, type RecordRef, type Run } from "@trotter/schemas";
import type { Database } from "@trotter/store";
import type { Static, TSchema } from "typebox";

/** What a tool can reach while it runs: the database, and which chat and run is calling it. */
export interface ToolContext {
	database: Database;
	chat: Chat;
	run: Run;
	/** The author to put on any record the tool writes for the chat. */
	author: Author;
	signal: AbortSignal;
}

/** What a tool hands back: the value the model reads, and the records it read and wrote, for the action log. */
export interface ToolOutput {
	value: JsonValue;
	dataSeen: RecordRef[];
	recordsWritten: RecordRef[];
}

/** A data tool or a system tool (ADR 0015). To fail, it throws an error that tells the model what went wrong. */
export interface TrotterTool<Parameters extends TSchema = TSchema> {
	name: string;
	label: string;
	description: string;
	parameters: Parameters;
	execute(params: Static<Parameters>, context: ToolContext): Promise<ToolOutput>;
}

/** Called with each tool's output, so the action log can record what it read and wrote. */
export type OutputListener = (toolCallId: string, output: ToolOutput) => void;

/**
 * The tool as pi's agent loop runs it. The arguments are checked with checkValue before the tool
 * runs, in place of pi's coercion (which would turn a missing price into 0); a call that fails the
 * check never runs, and the model gets every problem back to fix in one go. Calls run one at a time,
 * in the order the model made them.
 */
export function toAgentTool(
	tool: TrotterTool,
	context: Omit<ToolContext, "signal">,
	onOutput: OutputListener,
): AgentTool<TSchema, ToolOutput> {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		executionMode: "sequential",
		prepareArguments: (args) => checkValue(tool.parameters, args, `The call to ${tool.name}`),
		execute: async (toolCallId, params, signal) => {
			const output = await tool.execute(params, { ...context, signal: signal ?? new AbortController().signal });
			onOutput(toolCallId, output);
			return { content: [{ type: "text", text: JSON.stringify(output.value) }], details: output };
		},
	};
}
