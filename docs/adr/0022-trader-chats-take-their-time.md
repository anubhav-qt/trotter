# 0022. Trader chats take their time: no forced action

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · amends [0012](0012-auditor-chat.md) and [0013](0013-trader-chat-per-stock-and-trade-master.md) · depends on [0018](0018-agents-hand-over-json.md)

## Context

[0012](0012-auditor-chat.md) and [0013](0013-trader-chat-per-stock-and-trade-master.md) said a trader chat must act on an Auditor finding or a Trade Master brief in its next run, or justify not acting. The owner wants trader chats to judge like a patient professional: no feedback or new information forces an immediate trade.

## Decision

- **No forced action**: after a finding, a brief, a lesson or any new information, a trader chat can take its time. It thinks, looks back at its own past decisions and their outcomes with this stock, and weighs the context.
- **It can ask for more**: more data from the data tools, or more analysis from other agents (the Trade Master, the news and filings analysis, the trader chat of a competitor or supplier). A request is a handover ([0018](0018-agents-hand-over-json.md)); the trader chat wakes when the answer arrives.
- **Then it decides one of three things**, recorded with its reasoning:
  - act now;
  - plan and wait: what it's waiting for and when it will look again, and code wakes it then;
  - do nothing, and say why.
- **A finding or brief still gets an answer** in the next run, but the answer can be "waiting, here's the plan" rather than a trade. This replaces "exit or justify staying in" in [0012](0012-auditor-chat.md) and "act on them or explain why not" in [0013](0013-trader-chat-per-stock-and-trade-master.md).
- **The engine never waits**: hard limits, protective stops and the kill switch act at once, whatever a trader chat is planning.

## Consequences

- Plans are records with a wake time or condition; code keeps a queue of them and wakes each chat on time.- The Lessons chat can learn from patience too: plans that waited well and plans that waited too long are both on record.
