# 0018. Agents hand over schema-checked JSON, read in code

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0010](0010-lessons-from-losses.md), [0012](0012-auditor-chat.md), [0013](0013-trader-chat-per-stock-and-trade-master.md), [0015](0015-data-tools-and-system-tools.md)

## Context

Many agents pass things to each other: the Trade Master's briefs and notes, the Auditor's findings, the Lessons chat's lessons, trader chats' decisions, the data tools' analysis. If one LLM's prose became the next one's input as is, numbers would drift, nothing could be checked, and code couldn't calculate on any of it.

## Decision

- **Everything passed from one agent to another is JSON**: the first agent's output is the relevant metrics and facts in a typebox schema for that kind of handover (a brief, a finding, a lesson, a decision, an analysis).
- **Free text stays free text**: explanations and reasoning travel as text fields inside that JSON, not squeezed into metrics.
- **Code sits in between**: it validates the JSON, stores it as a versioned record, calculates whatever is needed from its metrics, and builds the next LLM's input from it with that agent's prompt template. No agent ever reads another agent's raw output.
- A handover that fails its schema is rejected and the sending agent is asked to fix it; it never reaches the next agent.

## Consequences

- Every kind of handover has a schema in the shared package, next to the harness to engine data format.
- Prompt templates are tested like code: the same JSON always renders the same input.
- The Auditor can check handovers field by field, and undo one, like any other record.
