# 0005. The agent is a hard fork of pi, with models through CLIProxyAPI

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depended on by [0006](0006-agent-picks-engine-enforces.md)

## Context

The owner builds agents the same way in other projects: POM's Seelie (github.com/anubhav-qt/pom, `src/lib/seelie/`) is a hard fork of pi's model and agent packages, and reaches models from the owner's subscriptions through CLIProxyAPI. It is the reference for Trotter's agent.

## Decision

- Fork pi fresh from upstream (github.com/earendil-works/pi, MIT, at `e37cdc4`, 2026-10-10) into `packages/pi-ai` and `packages/pi-agent`, keeping their LICENSE. Trim to the four APIs CLIProxyAPI serves (Gemini, Anthropic Messages, OpenAI Responses, OpenAI Chat Completions) and the agent loop. Drop provider catalogs, the Models registry, OAuth, images, classifiers, telemetry and the proxy transport. It is a hard fork, not a dependency kept in sync.
- Run CLIProxyAPI (v8.0.23, checksum verified) locally from `harness/.cliproxy/`, bound to 127.0.0.1, with keys in `harness/.env.local`.
- Models: Google Antigravity while building and testing; Claude for paper trading on the finished product.

## Consequences

- Using subscriptions through a proxy may go against the providers' terms and could be blocked. A Claude API key is the fallback and needs no code change (the same Anthropic Messages API).
- Subscription limits are finite, so bulk work (tagging hundreds of news articles) goes to local models on the GPU (see [0008](0008-charts-from-numbers-and-own-cnn.md)).
