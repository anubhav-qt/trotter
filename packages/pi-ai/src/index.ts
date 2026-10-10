// @trotter/pi-ai: Trotter's hard fork of pi-ai (https://github.com/earendil-works/pi, MIT, see LICENSE),
// forked at e37cdc4 (2026-10-10). Kept: the four streaming APIs the harness reaches through CLIProxyAPI
// (Gemini, Anthropic Messages, OpenAI Responses, OpenAI Chat Completions). Dropped: provider catalogs,
// the Models registry and credential layer, OAuth, images, classifiers, telemetry and every other API.
export type { Static, TSchema } from "typebox";
export { Type } from "typebox";

export type { AnthropicEffort, AnthropicOptions, AnthropicThinkingDisplay } from "./api/anthropic-messages.ts";
export type { GoogleOptions } from "./api/google-generative-ai.ts";
export type { GoogleApiThinkingLevel, ResolvedGoogleThinkingLevel } from "./api/google-shared.ts";
export * from "./api/lazy.ts";
export type { OpenAICompletionsOptions } from "./api/openai-completions.ts";
export type { OpenAIResponsesOptions } from "./api/openai-responses.ts";
export * from "./models.ts";
export * from "./stream.ts";
export * from "./types.ts";
export * from "./utils/diagnostics.ts";
export * from "./utils/event-stream.ts";
export * from "./utils/json-parse.ts";
export { contentText, getSystemMessageText, renderSystemMessageUpdate } from "./utils/text.ts";
export * from "./utils/transcript.ts";
export * from "./utils/validation.ts";
