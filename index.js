#!/usr/bin/env node
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { x402Client, x402HTTPClient } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const { toClientEvmSigner } = require("@x402/evm");
const { privateKeyToAccount } = require("viem/accounts");
const { createGuard } = require("./x402-guard");

const BASE_URL = "https://voice.forgemesh.io";
const MAX_SHORT_CHARS = 500;
const MAX_LONG_CHARS = 2000;
const MAX_BATCH_ITEMS = 20;
const BASE_VOICES = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"];
const PERSONA_VOICES = ["Storyteller", "Narrator", "Announcer", "Assistant", "Urgent", "Sage", "Spark", "Anchor", "Velvet", "Echo"];
const ALL_VOICES = [...BASE_VOICES, ...PERSONA_VOICES];
const LANGUAGES = ["en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi"];
const AUDIO_FORMATS = ["wav", "flac", "ogg"];
const LANG_NOTE = "Language code, default en for Latin-script text; must match the script of the text and is required for non-Latin text";
const CHARGE_NOTE = "Charged only for a 200 that carries audio: the service refuses with 400 before payment (charged:false) text with no letter or digit, text whose script does not match lang, non-Latin text without lang, speed outside 0.7-2.0, steps outside 1-100, or an unknown voice, lang or response_format; audio that fails its post-synthesis check answers 502 with charged:false.";

const TOOLS = [
  {
    name: "list_voice_catalog",
    title: "List Voice Catalog",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "Free discovery tool. Lists all 20 voices, 10 persona voices, 31 language codes, price buckets, character limits, and granular speed/quality controls before a paid voice generation call.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "generate_standard_voice",
    title: "Generate Standard Voice",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "Text to speech (TTS): turn up to 2,000 characters of text into spoken WAV audio (44.1 kHz, 16-bit mono) in one of 10 standard voices (M1-M5 male, F1-F5 female) across 31 languages. Base voices only: no speed, steps or personas. Best for agent narration, status updates, alerts and short spoken responses. Costs $0.005 for 1-500 chars and $0.005 for 501-2000 chars. " + CHARGE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: BASE_VOICES, description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", enum: LANGUAGES, description: LANG_NOTE },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_controlled_voice",
    title: "Generate Controlled Voice",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "Text to speech (TTS) with speed control: turn text into spoken WAV audio at a chosen speaking speed (0.7x to 2.0x) and quality steps (1-100), in 10 standard voices and 31 languages. Base voices only (no personas). Use it for faster, slower or more deliberate delivery. Costs $0.005 for 1-500 chars or $0.006 for 501-2000 chars. " + CHARGE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: BASE_VOICES, description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", enum: LANGUAGES, description: LANG_NOTE },
        speed: { type: "number", minimum: 0.7, maximum: 2.0, description: "Speech speed, 0.7-2.0" },
        steps: { type: "integer", minimum: 1, maximum: 100, description: "Quality steps, 1-100" },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_persona_voice",
    title: "Generate Persona Voice",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "Text to speech (TTS) with persona voices: turn text into expressive spoken WAV audio with personas such as Storyteller, Narrator, Announcer, Assistant, Urgent, Sage, Spark, Anchor, Velvet or Echo. The only tool that accepts persona voices; all 20 voices with speed and steps. Best for branded agents, characters, demos and stories. Costs $0.005 for 1-500 chars or $0.01 for 501-2000 chars. " + CHARGE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: ALL_VOICES, description: "Voice name; personas include Storyteller, Narrator, Announcer, Assistant, Urgent, Sage, Spark, Anchor, Velvet, Echo" },
        lang: { type: "string", enum: LANGUAGES, description: LANG_NOTE },
        speed: { type: "number", minimum: 0.7, maximum: 2.0, description: "Speech speed, 0.7-2.0" },
        steps: { type: "integer", minimum: 1, maximum: 100, description: "Quality steps, 1-100" },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_openai_compatible_voice",
    title: "Generate OpenAI-Compatible Voice",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "Text to speech (TTS), OpenAI-compatible: generate speech from an OpenAI-shaped request with input, voice, model and response_format fields (WAV, FLAC or OGG). The model field is accepted and ignored; 10 base voices only, no personas. Use it for agents or apps built around /v1/audio/speech payloads. Costs $0.005 for 1-500 chars and $0.005 for 501-2000 chars. " + CHARGE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: BASE_VOICES, description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", enum: LANGUAGES, description: LANG_NOTE },
        model: { type: "string", description: "Optional model field; accepted and ignored by the service" },
        response_format: { type: "string", enum: AUDIO_FORMATS, description: "wav, flac, or ogg" },
      },
      required: ["input"],
    },
  },
  {
    name: "generate_batch_voices",
    title: "Generate Batch Voices",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    description: "Batch text to speech (TTS): turn up to 20 separate text items into WAV audio in one paid call using the 10 standard voices (no speed, steps or personas). Returns JSON with one entry per item: audio_base64 (WAV), duration_s, format and sample_rate. Best for queues, notifications, scripted sequences and content batches. Costs $0.005 for 1-500 total chars and $0.005 for 501-2000 total chars. " + CHARGE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH_ITEMS,
          description: "Array of text items: { text, voice?, lang? }. Total text across all items must be <= 2000 chars.",
          items: {
            type: "object",
            properties: {
              text: { type: "string", maxLength: MAX_LONG_CHARS },
              voice: { type: "string", enum: BASE_VOICES },
              lang: { type: "string", enum: LANGUAGES },
            },
            required: ["text"],
          },
        },
        defaults: {
          type: "object",
          description: "Default standard voice and language",
          properties: {
            voice: { type: "string", enum: BASE_VOICES },
            lang: { type: "string", enum: LANGUAGES },
          },
        },
      },
      required: ["items"],
    },
  },
];

const TOOL_SCHEMAS = {
  list_voice_catalog: {},
  generate_standard_voice: {
    text: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(BASE_VOICES).optional().describe("Standard voice: M1-M5 or F1-F5"),
    lang: z.enum(LANGUAGES).optional().describe(LANG_NOTE),
  },
  generate_controlled_voice: {
    text: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(BASE_VOICES).optional().describe("Standard voice: M1-M5 or F1-F5"),
    lang: z.enum(LANGUAGES).optional().describe(LANG_NOTE),
    speed: z.number().min(0.7).max(2.0).optional().describe("Speech speed, 0.7-2.0"),
    steps: z.number().int().min(1).max(100).optional().describe("Quality steps, 1-100"),
  },
  generate_persona_voice: {
    text: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(ALL_VOICES).optional().describe("Voice name; personas include Storyteller, Narrator, Announcer, Assistant, Urgent, Sage, Spark, Anchor, Velvet, Echo"),
    lang: z.enum(LANGUAGES).optional().describe(LANG_NOTE),
    speed: z.number().min(0.7).max(2.0).optional().describe("Speech speed, 0.7-2.0"),
    steps: z.number().int().min(1).max(100).optional().describe("Quality steps, 1-100"),
  },
  generate_openai_compatible_voice: {
    input: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(BASE_VOICES).optional().describe("Standard voice: M1-M5 or F1-F5"),
    lang: z.enum(LANGUAGES).optional().describe(LANG_NOTE),
    model: z.string().optional().describe("Optional model field; accepted and ignored by the service"),
    response_format: z.enum(AUDIO_FORMATS).optional().describe("wav, flac, or ogg"),
  },
  generate_batch_voices: {
    items: z.array(z.object({
      text: z.string().min(1).max(MAX_LONG_CHARS),
      voice: z.enum(BASE_VOICES).optional(),
      lang: z.enum(LANGUAGES).optional(),
    })).min(1).max(MAX_BATCH_ITEMS).describe("Array of text items; total text across all items must be <= 2000 chars"),
    defaults: z.object({
      voice: z.enum(BASE_VOICES).optional(),
      lang: z.enum(LANGUAGES).optional(),
    }).optional().describe("Default standard voice and language"),
  },
};

function pickBucketEndpoint(shortPath, longPath, length) {
  if (length > MAX_LONG_CHARS) throw new Error(`Text is over the ${MAX_LONG_CHARS} character maximum`);
  return length > MAX_SHORT_CHARS ? longPath : shortPath;
}

function pickBatchEndpoint(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("items must be a non-empty array");
  if (items.length > MAX_BATCH_ITEMS) throw new Error(`items exceeds the ${MAX_BATCH_ITEMS} item maximum`);
  const totalChars = items.reduce((sum, item) => sum + String(item?.text || "").length, 0);
  if (totalChars > MAX_LONG_CHARS) throw new Error(`Batch text is over the ${MAX_LONG_CHARS} total character maximum`);
  return pickBucketEndpoint("/v1/tts/batch", "/v1/tts/batch-long", totalChars);
}

const guard = createGuard({
  baseUrl: BASE_URL,
  payTo: ["0x962794FB8aD92941fAf1ab446b9e30637B86F331"],
  maxPriceUsd: 0.01, // highest listed tool price
  sessionBudgetUsd: 10,
});

function requireWalletClient() {
  const key = process.env.WALLET_PRIVATE_KEY;
  if (!key) throw new Error("WALLET_PRIVATE_KEY required for paid voice tools");
  const pk = key.startsWith("0x") ? key : "0x" + key;
  const account = privateKeyToAccount(pk);
  const coreClient = new x402Client()
    .register("eip155:*", new ExactEvmScheme(toClientEvmSigner(account)))
    .registerPolicy(guard.policy);
  return { httpClient: new x402HTTPClient(coreClient), account };
}

async function paidPost(path, body) {
  const { httpClient } = requireWalletClient();
  const out = await guard.callPaid(httpClient, path, { method: "POST", body });
  if (out && out._binary) {
    return {
      content_type: out.content_type || "audio/wav",
      audio_base64: out.bytes.toString("base64"),
      bytes: out.bytes.length,
      payment_response: out._payment,
    };
  }
  const { _payment, ...response } = out;
  return { content_type: "application/json", response, payment_response: _payment };
}

async function freeGet(path) {
  const res = await guard.fetchBounded(path);
  if (!res.ok) throw guard.httpError(res, `GET ${path} failed: `, false);
  return JSON.parse(res.text);
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function callTool(name, args = {}) {
  if (name === "list_voice_catalog") return freeGet("/v1/voices");

  if (name === "generate_standard_voice") {
    const text = String(args.text || "");
    const path = pickBucketEndpoint("/v1/tts/base", "/v1/tts/base-long", text.length);
    return paidPost(path, { text, voice: args.voice || "M1", lang: args.lang });
  }

  if (name === "generate_controlled_voice") {
    const text = String(args.text || "");
    const path = pickBucketEndpoint("/v1/tts/pro", "/v1/tts/pro-long", text.length);
    return paidPost(path, {
      text,
      voice: args.voice || "M1",
      lang: args.lang,
      speed: args.speed,
      steps: args.steps,
    });
  }

  if (name === "generate_persona_voice") {
    const text = String(args.text || "");
    const path = pickBucketEndpoint("/v1/tts/custom", "/v1/tts/custom-long", text.length);
    return paidPost(path, {
      text,
      voice: args.voice || "Storyteller",
      lang: args.lang,
      speed: args.speed,
      steps: args.steps,
    });
  }

  if (name === "generate_openai_compatible_voice") {
    const input = String(args.input || "");
    const path = pickBucketEndpoint("/v1/audio/speech", "/v1/audio/speech-long", input.length);
    return paidPost(path, {
      input,
      voice: args.voice || "M1",
      lang: args.lang,
      model: args.model || "forgemesh-voice",
      response_format: args.response_format || "wav",
    });
  }

  if (name === "generate_batch_voices") {
    const path = pickBatchEndpoint(args.items);
    return paidPost(path, { items: args.items, defaults: args.defaults || { voice: "F2" } });
  }

  throw new Error(`Unknown tool: ${name}`);
}

const server = new McpServer({ name: "voice-mcp", version: require("./package.json").version });
server.server.onerror = (error) => {
  console.error(error instanceof Error ? error.message : String(error));
};
for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: TOOL_SCHEMAS[tool.name],
      annotations: tool.annotations,
    },
    async (args) => {
      try {
        return textResult(await callTool(tool.name, args || {}));
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: (error instanceof Error ? error.message : String(error)) + (error && typeof error.charged === "boolean" ? ` (charged: ${error.charged})` : "") }],
        };
      }
    }
  );
}

async function main() {
  await server.connect(new StdioServerTransport());
  process.stdin.resume();
  const keepAlive = setInterval(() => {}, 2 ** 30);
  process.stdin.on("end", () => clearInterval(keepAlive));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  TOOLS,
  TOOL_SCHEMAS,
  callTool,
  pickBucketEndpoint,
  pickBatchEndpoint,
};
