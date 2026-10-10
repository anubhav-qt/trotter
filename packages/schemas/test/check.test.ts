import assert from "node:assert/strict";
import { test } from "node:test";
import { Type } from "typebox";

import { CLOSED, checkValue, PricePaise, SchemaError, StockRef, UtcTimestamp } from "../src/index.ts";

const Example = Type.Object(
	{
		stock: StockRef,
		pricePaise: PricePaise,
		at: UtcTimestamp,
	},
	CLOSED,
);

const valid = {
	stock: { isin: "INE002A01018", symbol: "RELIANCE" },
	pricePaise: 141_250,
	at: "2026-10-12T09:15:00.000Z",
};

function problemsFor(value: unknown): string[] {
	try {
		checkValue(Example, value, "The example");
	} catch (error) {
		assert.ok(error instanceof SchemaError);
		return error.problems;
	}
	assert.fail("expected a SchemaError");
}

test("a value that matches its schema comes back unchanged", () => {
	const checked = checkValue(Example, valid, "The example");

	assert.deepEqual(checked, valid);
});

test("every problem is listed with a readable path, so an agent can fix them all at once", () => {
	const problems = problemsFor({
		stock: { isin: "US0378331005", symbol: "AAPL" },
		pricePaise: 1412.5,
		at: "2026-10-12T14:45:00+05:30",
	});

	assert.deepEqual(problems, [
		'stock.isin: must match pattern "^IN[A-Z0-9]{9}[0-9]$"',
		"pricePaise: must be integer",
		'at: must match pattern "Z$"',
	]);
});

test("an unexpected field is named once instead of being dropped", () => {
	const problems = problemsFor({ ...valid, confidence: 0.9 });

	assert.deepEqual(problems, ['root: unexpected field "confidence"']);
});

test("a missing field is named", () => {
	const { at: _at, ...withoutTime } = valid;

	const problems = problemsFor(withoutTime);

	assert.deepEqual(problems, ["root: must have required properties at"]);
});

test("an impossible date is rejected even when it looks like a timestamp", () => {
	const problems = problemsFor({ ...valid, at: "2026-02-30T09:15:00Z" });

	assert.deepEqual(problems, ['at: must match format "date-time"']);
});

test("the error message names what was checked", () => {
	assert.throws(() => checkValue(Example, {}, "The Trade Master's brief"), /^SchemaError: The Trade Master's brief/);
});
