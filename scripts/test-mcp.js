#!/usr/bin/env node
"use strict";

const { TOOLS, TOOL_SCHEMAS, pickBucketEndpoint } = require("../index.js");

const expected = [
  "batch_speak",
  "list_tts_voices",
  "openai_speech",
  "speak_persona",
  "speak_pro",
  "speak_standard",
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

console.log(`MCP contract ok: ${names.length} tools`);
