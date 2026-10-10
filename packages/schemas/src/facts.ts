import { type Static, type TSchema, Type } from "typebox";
import { CLOSED, UtcTimestamp } from "./primitives.ts";
import { versionFields } from "./records.ts";

/** Where a value came from and when we fetched it, so a bad source can be traced and its data rejected. */
export const Source = Type.Object(
	{
		url: Type.String({ format: "uri" }),
		fetchedAt: UtcTimestamp,
		publishedAt: Type.Optional(UtcTimestamp),
	},
	CLOSED,
);

/**
 * A fact a data tool wrote for the engine and the agents: a versioned record plus when it
 * became known (a backtest may only use facts known by its moment) and its sources.
 * The kinds of fact (prices, news analysis, filing figures) are added with each data tool.
 */
export function factRecord<Kind extends string, Body extends TSchema>(kind: Kind, body: Body) {
	return Type.Object(
		{
			...versionFields(kind),
			knownAt: UtcTimestamp,
			sources: Type.Array(Source, { minItems: 1 }),
			body,
		},
		CLOSED,
	);
}

export type Source = Static<typeof Source>;
