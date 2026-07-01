#!/usr/bin/env node
"use strict";

const { TOOLS, TOOL_SCHEMAS, pickBucketEndpoint, pickBatchEndpoint } = require("../index.js");

const expected = [
  "generate_batch_voices",
  "generate_controlled_voice",
  "generate_openai_compatible_voice",
  "generate_persona_voice",
  "generate_standard_voice",
  "list_voice_catalog",
];

const names = TOOLS.map((tool) => tool.name).sort();
for (const name of expected) {
  if (!names.includes(name)) throw new Error(`Missing tool: ${name}`);
  if (!Object.prototype.hasOwnProperty.call(TOOL_SCHEMAS, name)) {
    throw new Error(`Missing schema for tool: ${name}`);
  }
}

if (new Set(names).size !== names.length) throw new Error("Duplicate tool names");
if (pickBucketEndpoint("/short", "/long", 500) !== "/short") throw new Error("Short bucket route failed");
if (pickBucketEndpoint("/short", "/long", 501) !== "/long") throw new Error("Long bucket route failed");

let tooLongFailed = false;
try {
  pickBucketEndpoint("/short", "/long", 2001);
} catch (_) {
  tooLongFailed = true;
}
if (!tooLongFailed) throw new Error("Over-limit text did not fail");

if (pickBatchEndpoint([{ text: "x".repeat(500) }]) !== "/v1/tts/batch") throw new Error("Short batch route failed");
if (pickBatchEndpoint([{ text: "x".repeat(501) }]) !== "/v1/tts/batch-long") throw new Error("Long batch route failed");

let batchTooLongFailed = false;
try {
  pickBatchEndpoint([{ text: "x".repeat(2001) }]);
} catch (_) {
  batchTooLongFailed = true;
}
if (!batchTooLongFailed) throw new Error("Over-limit batch text did not fail");

let batchTooManyFailed = false;
try {
  pickBatchEndpoint(Array.from({ length: 21 }, () => ({ text: "x" })));
} catch (_) {
  batchTooManyFailed = true;
}
if (!batchTooManyFailed) throw new Error("Over-limit batch item count did not fail");

console.log(`MCP contract ok: ${names.length} tools`);
