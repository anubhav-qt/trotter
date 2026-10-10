# 0008. Charts: exact patterns from numbers, plus our own chart CNN

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0003](0003-run-on-the-owners-pc.md)

## Context

The GPU invites reading candlestick charts with vision models. But a chart is drawn from OHLCV numbers we already store, so a picture holds less than the data behind it. A general vision model is imprecise, varies between runs, and can't be backtested because it has seen historical charts in training. Jiang, Kelly and Xiu ("(Re-)Imag(in)ing Price Trends", Journal of Finance, 2023) did find that a small CNN trained on rendered OHLC images predicted returns better than standard momentum and reversal signals.

## Decision

- The engine computes chart patterns and trend exactly from OHLCV (engulfing candles, support and resistance, trendlines, breakouts, multi-timeframe trend).
- We train our own CNN on daily, weekly and monthly charts we render from our own point-in-time data, test it walk-forward like any model, and feed its output into the score. Yearly charts have too few bars to learn from.
- No vision LLM reading chart screenshots, and no screenshots of chart sites.
- The GPU also runs local models for bulk news work (tagging, sentiment, deduplication, clustering), reads scanned filings and analyst reports, and trains the later ML/RL models.

## Consequences

- The CNN waits until the engine has stored price history to train on.
- The likely toolchain is training in Python with PyTorch, exporting ONNX, and running it from the engine on the GPU. Decided when we get there.
