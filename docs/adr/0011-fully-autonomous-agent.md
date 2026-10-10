# 0011. The agent is fully autonomous: no approvals anywhere

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0006](0006-agent-picks-engine-enforces.md), [0010](0010-lessons-from-losses.md)

## Context

POM's Seelie, the reference agent, asks before every change and shows an approval card. The owner wants Trotter's agent to run on its own: no approval for trades, lessons or anything else.

## Decision

- No tool asks for approval. Trades, lesson changes, data gathering and every other action run on their own. Tools have no "ask first" kinds, unlike Seelie's.
- The agent is bounded only by the engine's hard risk limits and the kill switch. These are settings the owner owns and the engine enforces; the agent can't read past them or change them. They are a boundary, not an approval step.
- The owner reviews after the fact: every action is stored with its reasoning and shown in the app.

## Consequences

- At go-live, SEBI's retail algo rules still require the owner to complete the broker's 2FA login once every trading day. That is a login, not an approval, and the system works around it (orders wait for a valid session).
- With no human in the loop, the hard limits and the kill switch carry all of the safety, so they are built and tested before the agent can place its first paper order.
