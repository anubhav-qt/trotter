import { type Static, type TSchema, Type } from "typebox";
import { CLOSED, RecordId, Text, UtcTimestamp } from "./primitives.ts";

/** One exact version of a record, so what an agent saw or cited can be read back as it was then. */
export const RecordRef = Type.Object(
	{
		kind: Text,
		id: RecordId,
		version: Type.Integer({ minimum: 1 }),
	},
	CLOSED,
);

/**
 * - active: in force.
 * - retired: no longer in force, with its reason (a lesson retired, a plan that has woken its chat).
 * - rejected: undone or found wrong; kept for history, never used.
 * - disputed: sources disagree beyond tolerance; not used until code settles it.
 */
export const RecordStatus = Type.Enum(["active", "retired", "rejected", "disputed"]);

/** Who wrote a version: a chat (with the run and model, so models can be compared), a data tool's model call, code, or the owner. */
export const Author = Type.Union([
	Type.Object({ kind: Type.Literal("chat"), chatId: RecordId, runId: RecordId, model: Text }, CLOSED),
	Type.Object({ kind: Type.Literal("analysis"), tool: Text, model: Text }, CLOSED),
	Type.Object({ kind: Type.Literal("code"), component: Text }, CLOSED),
	Type.Object({ kind: Type.Literal("owner") }, CLOSED),
]);

/**
 * The fields every version of a record carries. Nothing is overwritten: a change, a retirement
 * or an undo is a new version, and every earlier version stays readable.
 */
export function versionFields<Kind extends string>(kind: Kind) {
	return {
		id: RecordId,
		version: Type.Integer({ minimum: 1 }),
		kind: Type.Literal(kind),
		status: RecordStatus,
		writtenAt: UtcTimestamp,
		author: Author,
		reason: Type.Optional(Type.String({ minLength: 1, description: "Why this version changed the one before it" })),
		revertsTo: Type.Optional(
			Type.Integer({ minimum: 1, description: "Set on an undo: the earlier version this one puts back" }),
		),
	};
}

/** A versioned record of one kind, holding a body the agent wrote. */
export function versionedRecord<Kind extends string, Body extends TSchema>(kind: Kind, body: Body) {
	return Type.Object({ ...versionFields(kind), body }, CLOSED);
}

export type RecordRef = Static<typeof RecordRef>;
export type RecordStatus = Static<typeof RecordStatus>;
export type Author = Static<typeof Author>;
