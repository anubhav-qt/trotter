# 0003. Everything runs on the owner's PC

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depended on by [0007](0007-tauri-app-and-separate-processes.md), [0008](0008-charts-from-numbers-and-own-cnn.md)

## Context

Oracle Cloud's free tier was first planned as the host, mainly for its static IP. The owner's PC (RTX 5070 with 12 GB, Ryzen 7 9800X3D, 32 GB RAM, over 1 TB of SSD) is far more capable, costs nothing, and its GPU can train and run models.

## Decision

The engine, the harness, CLIProxyAPI and the app all run locally on that PC.

## Consequences

- Live orders need a static IP registered with the broker. Before go-live, pick an ISP static IP or a free Oracle VM used only as the fixed address orders leave from (WireGuard), with the PC still doing all the work.
- The PC must be on and online during market hours. For swing trades this matters less, and protective stop orders held at the broker cover outages.
