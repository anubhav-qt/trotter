# Engineering standard

How code is written, checked and shipped in Trotter. `npm run check` enforces what a tool can; the rest is on review.

## 1. Readability first

The most beautiful code is the easiest to read and still does the job just as well. Clever code that does the same job is worse.

- **One step per line.** No one-liners that pack several steps into one expression. Give each step its own line and, where it helps, its own well named variable.
- **Plain `if` and `else`.** No nested ternaries, and no chains of `&&` or `||` used as control flow. A single ternary is fine only for a trivial value (`const label = done ? "Done" : "Running"`).
- **Always use braces**, even for a one-line `if`.
- **Return early** to keep the main path unindented.
- **Small functions with clear names.** A function does one thing, and its name says what.
- **Names say what a thing is**, in full words: `closingPrice`, not `cp`. Units go in the name when they matter: `pricePaise`, `timeoutMs`.
- **Comments explain why, not what.** Match the comment density of the file you're in.
- **No dead code** and no commented-out code. Git remembers.

## 2. TypeScript

- Node 24 runs `.ts` directly (type stripping), so there is no build step. Only erasable syntax: no `enum`, no `namespace`, no parameter properties. Use `as const` objects and union types.
- Imports use the `.ts` extension. Node built-ins use the `node:` prefix.
- `strict` is on. No `any` (use `unknown` and narrow it), no non-null `!`.
- Named exports only.
- Files are `kebab-case.ts`. Types are `PascalCase`, functions and variables `camelCase`, constants `UPPER_SNAKE_CASE`.

## 3. Boundaries and data

- **Validate everything that crosses a boundary** with a typebox schema (the schema library pi already uses): HTTP requests and responses, files, database rows, environment variables and above all LLM output. Inside a boundary, trust the types.
- **Money is integer paise**, quantities are integer shares. Never add up money in floating point.
- **Time** is stored as UTC ISO 8601 strings. A trading day is a `YYYY-MM-DD` date in India time (Asia/Kolkata). Convert only at the edges.
- **Point in time.** Every stored fact records when it became known (`knownAt`). A backtest or a model may only use what was known at its moment. Nothing is overwritten; corrections are new rows.
- **The LLM reads and analyses; code calculates.** The LLM reads the material (a filing's OCR text and the PDF itself, an article, a transcript) and returns its analysis and the figures it found as schema-checked JSON. Code does every calculation on that JSON and enforces every limit; the agent can't change either. Where an official structured source has the same figure (XBRL results, NSE files), code checks the LLM's figure against it and flags a mismatch.

## 4. Errors

- Throw `Error` subclasses with a message that says what went wrong and how to fix it.
- Never swallow an error. Catch only where you can handle it, and say why in a comment.
- An agent tool that fails returns an error result the model can act on, not a crash.

## 5. Tests

- Node's built-in runner (`node:test`, `node:assert/strict`). Tests live in each package's `test/` folder as `*.test.ts`.
- Test logic that can break quietly: scoring, risk checks, parsers, anything that decides on LLM output.
- No network in tests. Use fixtures.
- A test name is a sentence that says what must stay true.

## 6. Dependencies

- Prefer Node built-ins. Every new dependency needs a reason in its commit.
- Pin exact versions (`.npmrc` has `save-exact`). Don't take a release younger than two weeks unless it fixes something we need.
- `packages/pi-ai` and `packages/pi-agent` are a hard fork of pi: change them freely, keep their LICENSE, and mark our changes with a short `// Trotter:` comment.

## 7. Secrets and safety

- Secrets live only in `.env.local` files, which git ignores. Never log them, print them or paste them into chat.
- Read-only by default: anything that places an order, moves money or changes a limit is explicit, logged and checked by the engine.

## 8. Docs and decisions

- **CLAUDE.md** is the project's memory for every new session. Update it in the same commit as any change to structure, status, commands or rules. Keep it brief: link to ADRs and this file instead of repeating them.
- **ADRs** in `docs/adr/` record every significant decision: one file per decision, numbered, never edited after acceptance except to mark it superseded. Add a line to the index in `docs/adr/README.md`.
- No em dashes or en dashes anywhere: code, comments, UI copy, docs, commits.

## 9. Git

- `dev` is where work happens; `master` is the last stable state.
- A commit is one line, `type: message` (feat, fix, docs, chore, refactor, test, ci). Playful is welcome. No body, no Co-Authored-By line, no mention of Claude.
- Commit each change on its own. Push only with the owner's go-ahead.

## 10. Definition of done

1. `npm run check` passes (format, lint, typecheck, tests).
2. CLAUDE.md is still true.
3. A significant decision has an ADR.
4. The owner gets a short test checklist, 1 to 5 words per item.
