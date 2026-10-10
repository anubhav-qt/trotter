import type { Static, TSchema } from "typebox";
import { Compile } from "typebox/compile";
import type { TLocalizedValidationError } from "typebox/error";

type Validator = ReturnType<typeof Compile>;

/** Thrown when a value doesn't match its schema. Lists every problem, so an agent can fix them all at once. */
export class SchemaError extends Error {
	readonly problems: string[];

	constructor(what: string, problems: string[]) {
		const list = problems.map((problem) => `  - ${problem}`).join("\n");
		super(`${what} doesn't match its schema:\n${list}`);
		this.name = "SchemaError";
		this.problems = problems;
	}
}

const validators = new WeakMap<TSchema, Validator>();

/**
 * The check at every boundary: returns the value typed by its schema, or throws a SchemaError.
 * `what` names the value in the message, e.g. "The Trade Master's brief".
 */
export function checkValue<Schema extends TSchema>(schema: Schema, value: unknown, what: string): Static<Schema> {
	const validator = validatorFor(schema);
	if (validator.Check(value)) {
		return value as Static<Schema>;
	}
	const problems = validator.Errors(value).flatMap(describeError);
	throw new SchemaError(what, [...new Set(problems)]);
}

function validatorFor(schema: TSchema): Validator {
	const cached = validators.get(schema);
	if (cached) {
		return cached;
	}
	const validator = Compile(schema);
	validators.set(schema, validator);
	return validator;
}

function describeError(error: TLocalizedValidationError): string[] {
	// typebox reports each unexpected field twice: once here, once as a "boolean" error on the field itself.
	if (error.keyword === "boolean") {
		return [];
	}
	const path = readablePath(error.instancePath);
	if (error.keyword === "additionalProperties") {
		const fields = (error.params as { additionalProperties?: string[] }).additionalProperties ?? [];
		return fields.map((field) => `${path}: unexpected field "${field}"`);
	}
	return [`${path}: ${error.message}`];
}

function readablePath(instancePath: string): string {
	if (instancePath === "") {
		return "root";
	}
	return instancePath.slice(1).replaceAll("/", ".");
}
