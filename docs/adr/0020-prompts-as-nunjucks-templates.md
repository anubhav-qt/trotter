# 0020. Every prompt is a Nunjucks template in prompts/

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0016](0016-the-goal.md), [0018](0018-agents-hand-over-json.md)

## Context

Every agent's input is built in code from JSON handovers and data ([0018](0018-agents-hand-over-json.md)). The owner wants all prompts kept apart from the code, in one place, as templates. POM's Seelie does this with Nunjucks.

## Decision

- **All prompts live in `prompts/`** at the repo root, as Nunjucks templates (`.njk`): one per agent (trader chat, Trade Master, Lessons, Auditor), one per kind of handover, and the compaction prompt. Shared pieces are partials in `prompts/partials/`.
- **No prompt text in code.** Code only picks a template and passes it data.
- **Templates hold wording, not logic**: loops and simple conditions over the data, nothing more. Anything that needs working out is done in code first.
- **Tested like code**: each template renders fixture JSON in a test, and the same data always renders the same prompt.
- **Model agnostic** ([0016](0016-the-goal.md)): one template serves every model. A variant for one model family is added only when paper trading shows it helps, and it lives next to the original.

## Consequences

- Changing what an agent is told is a reviewable diff in one folder.
- The harness depends on `nunjucks`, with autoescaping off (prompts aren't HTML).
