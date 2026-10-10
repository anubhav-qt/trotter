import { type Static, Type } from "typebox";

/**
 * Every object schema here is closed: a field the schema doesn't name is an error,
 * so a misspelt field in a model's handover is caught instead of silently dropped.
 */
export const CLOSED = { additionalProperties: false } as const;

/** Text that must say something. */
export const Text = Type.String({ minLength: 1 });

/** A price in integer paise (₹1 is 100 paise). Money is never a float. */
export const PricePaise = Type.Integer({ minimum: 1, description: "A price in integer paise: ₹1 is 100 paise" });

/** A moment, as a UTC ISO 8601 string ending in Z. */
export const UtcTimestamp = Type.String({
	format: "date-time",
	pattern: "Z$",
	description: "A UTC ISO 8601 timestamp ending in Z",
});

/** A trading day: a YYYY-MM-DD date in India time (Asia/Kolkata). */
export const TradingDay = Type.String({ format: "date", description: "A YYYY-MM-DD date in India time" });

export const RecordId = Type.String({ format: "uuid" });

/** An Indian ISIN: IN, nine letters or digits, then a check digit. */
export const Isin = Type.String({ pattern: "^IN[A-Z0-9]{9}[0-9]$" });

/**
 * A stock, keyed by its ISIN because the ISIN is the same on NSE and BSE and survives
 * a rename, with its symbol alongside so people and models can read it.
 */
export const StockRef = Type.Object(
	{
		isin: Isin,
		symbol: Type.String({ minLength: 1, description: "The NSE symbol, or the BSE code for a stock only on BSE" }),
	},
	CLOSED,
);

export const Sector = Type.String({ minLength: 1, description: "A sector or industry as NSE classifies it" });

export type PricePaise = Static<typeof PricePaise>;
export type UtcTimestamp = Static<typeof UtcTimestamp>;
export type TradingDay = Static<typeof TradingDay>;
export type RecordId = Static<typeof RecordId>;
export type StockRef = Static<typeof StockRef>;
