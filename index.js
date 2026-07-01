#!/usr/bin/env node
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { x402Client, x402HTTPClient } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const { toClientEvmSigner } = require("@x402/evm");
const { privateKeyToAccount } = require("viem/accounts");
const { createPublicClient, http } = require("viem");
const { base } = require("viem/chains");

const BASE_URL = (
  process.env.X402_VOICE_BASE_URL ||
  "https://voice.forgemesh.io"
).replace(/\/+$/, "");
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const MAX_SHORT_CHARS = 500;
const MAX_LONG_CHARS = 2000;
const MAX_BATCH_ITEMS = 20;
const BASE_VOICES = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"];
const PERSONA_VOICES = ["Storyteller", "Narrator", "Announcer", "Assistant", "Urgent", "Sage", "Spark", "Anchor", "Velvet", "Echo"];
const ALL_VOICES = [...BASE_VOICES, ...PERSONA_VOICES];
const LANGUAGES = ["en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi"];
const AUDIO_FORMATS = ["wav", "flac", "ogg"];

const TOOLS = [
  {
    name: "list_voice_catalog",
    title: "List Voice Catalog",
    description: "Free discovery tool. Lists all 20 voices, 10 persona voices, 31 language codes, price buckets, character limits, and granular speed/quality controls before a paid voice generation call.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "generate_standard_voice",
    title: "Generate Standard Voice",
    description: "Generate low-cost WAV speech from text using one of 10 standard voices across 31 languages. Best for simple agent narration, status updates, alerts, and short spoken responses. Costs $0.001 for 1-500 chars or $0.003 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: BASE_VOICES, description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", enum: LANGUAGES, description: "Language code, default en" },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_controlled_voice",
    title: "Generate Controlled Voice",
    description: "Generate WAV speech with granular controls for speed and quality. Use this when an agent needs faster, slower, clearer, more polished, or more deliberate delivery. Costs $0.003 for 1-500 chars or $0.006 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: BASE_VOICES, description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", enum: LANGUAGES, description: "Language code, default en" },
        speed: { type: "number", minimum: 0.7, maximum: 2.0, description: "Speech speed, 0.7-2.0" },
        steps: { type: "integer", minimum: 1, maximum: 100, description: "Quality steps, 1-100" },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_persona_voice",
    title: "Generate Persona Voice",
    description: "Generate expressive WAV speech with persona voices such as Storyteller, Narrator, Announcer, Assistant, Urgent, Sage, Spark, Anchor, Velvet, or Echo. Best for branded agents, characters, demos, stories, alerts, and premium user experiences. Costs $0.005 for 1-500 chars or $0.01 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: ALL_VOICES, description: "Voice name; personas include Storyteller, Narrator, Announcer, Assistant, Urgent, Sage, Spark, Anchor, Velvet, Echo" },
        lang: { type: "string", enum: LANGUAGES, description: "Language code, default en" },
        speed: { type: "number", minimum: 0.7, maximum: 2.0, description: "Speech speed, 0.7-2.0" },
        steps: { type: "integer", minimum: 1, maximum: 100, description: "Quality steps, 1-100" },
      },
      required: ["text"],
    },
  },
  {
    name: "generate_openai_compatible_voice",
    title: "Generate OpenAI-Compatible Voice",
    description: "Generate speech using an OpenAI-shaped request with input, voice, model, and response_format fields. Use this for agents or apps already designed around /v1/audio/speech style payloads. Costs $0.001 for 1-500 chars or $0.003 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", maxLength: MAX_LONG_CHARS, description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", enum: BASE_VOICES, description: "Standard voice: M1-M5 or F1-F5" },
        model: { type: "string", description: "Optional model field; service uses ForgeMesh Voice" },
        response_format: { type: "string", enum: AUDIO_FORMATS, description: "wav, flac, or ogg" },
      },
      required: ["input"],
    },
  },
  {
    name: "generate_batch_voices",
    title: "Generate Batch Voices",
    description: "Generate WAV audio for up to 20 text items in one paid call using standard voices. Best for queues, notifications, scripted sequences, content batches, and multi-step agent workflows. Costs $0.002 for up to 500 total chars or $0.005 for 501-2000 total chars.",
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
    lang: z.enum(LANGUAGES).optional().describe("Language code, default en"),
  },
  generate_controlled_voice: {
    text: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(BASE_VOICES).optional().describe("Standard voice: M1-M5 or F1-F5"),
    lang: z.enum(LANGUAGES).optional().describe("Language code, default en"),
    speed: z.number().min(0.7).max(2.0).optional().describe("Speech speed, 0.7-2.0"),
    steps: z.number().int().min(1).max(100).optional().describe("Quality steps, 1-100"),
  },
  generate_persona_voice: {
    text: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(ALL_VOICES).optional().describe("Voice name; personas include Storyteller, Narrator, Announcer, Assistant, Urgent, Sage, Spark, Anchor, Velvet, Echo"),
    lang: z.enum(LANGUAGES).optional().describe("Language code, default en"),
    speed: z.number().min(0.7).max(2.0).optional().describe("Speech speed, 0.7-2.0"),
    steps: z.number().int().min(1).max(100).optional().describe("Quality steps, 1-100"),
  },
  generate_openai_compatible_voice: {
    input: z.string().min(1).max(MAX_LONG_CHARS).describe("Text to synthesize, max 2000 characters"),
    voice: z.enum(BASE_VOICES).optional().describe("Standard voice: M1-M5 or F1-F5"),
    model: z.string().optional().describe("Optional model field; service uses ForgeMesh Voice"),
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

function requireWalletClient() {
  const key = process.env.WALLET_PRIVATE_KEY;
  if (!key) throw new Error("WALLET_PRIVATE_KEY required for paid voice tools");
  const pk = key.startsWith("0x") ? key : "0x" + key;
  const account = privateKeyToAccount(pk);
  const coreClient = new x402Client().register("eip155:*", new ExactEvmScheme(toClientEvmSigner(account)));
  return { httpClient: new x402HTTPClient(coreClient), account };
}

async function createChainTimedPaymentPayload(httpClient, paymentRequired) {
  try {
    const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
    const block = await publicClient.getBlock();
    const chainNow = Number(block.timestamp);
    const originalNow = Date.now;
    const localNow = Math.floor(originalNow() / 1000);
    const timeout = Number(paymentRequired.accepts?.[0]?.maxTimeoutSeconds || 300);
    const lowerBound = localNow + 30 - timeout;
    const upperBound = chainNow + 600;
    const signingNow = Math.min(Math.max(chainNow, lowerBound), upperBound);
    Date.now = () => signingNow * 1000;
    try {
      return await httpClient.createPaymentPayload(paymentRequired);
    } finally {
      Date.now = originalNow;
    }
  } catch (_) {
    return httpClient.createPaymentPayload(paymentRequired);
  }
}

async function paidPost(path, body) {
  const { httpClient } = requireWalletClient();
  const url = BASE_URL + path;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const challengeRes = await fetch(url, init);
  if (challengeRes.status !== 402) {
    const text = await challengeRes.text().catch(() => "");
    throw new Error(`Expected x402 challenge, got ${challengeRes.status}: ${text.slice(0, 240)}`);
  }

  let challengeBody;
  try {
    challengeBody = await challengeRes.clone().json();
  } catch (_) {}
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => challengeRes.headers.get(name),
    challengeBody
  );
  const paymentPayload = await createChainTimedPaymentPayload(httpClient, paymentRequired);
  const paidRes = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      ...httpClient.encodePaymentSignatureHeader(paymentPayload),
    },
  });
  if (!paidRes.ok) {
    const text = await paidRes.text().catch(() => paidRes.statusText);
    throw new Error(`Paid TTS call failed: ${paidRes.status} ${text.slice(0, 240)}`);
  }

  const paymentReceipt = paidRes.headers.get("payment-response");
  const contentType = paidRes.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await paidRes.json();
    return { content_type: contentType, response: json, payment_response: paymentReceipt };
  }
  const audio = Buffer.from(await paidRes.arrayBuffer());
  return {
    content_type: contentType || "audio/wav",
    audio_base64: audio.toString("base64"),
    bytes: audio.length,
    payment_response: paymentReceipt,
  };
}

async function freeGet(path) {
  const res = await fetch(BASE_URL + path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function callTool(name, args = {}) {
  if (name === "list_voice_catalog") return freeGet("/v1/voices");

  if (name === "generate_standard_voice") {
    const text = String(args.text || "");
    const path = pickBucketEndpoint("/v1/tts/base", "/v1/tts/base-long", text.length);
    return paidPost(path, { text, voice: args.voice || "M1", lang: args.lang || "en" });
  }

  if (name === "generate_controlled_voice") {
    const text = String(args.text || "");
    const path = pickBucketEndpoint("/v1/tts/pro", "/v1/tts/pro-long", text.length);
    return paidPost(path, {
      text,
      voice: args.voice || "M1",
      lang: args.lang || "en",
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
      lang: args.lang || "en",
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
      model: args.model || "forgemesh-voice",
      response_format: args.response_format || "wav",
    });
  }

  if (name === "generate_batch_voices") {
    const path = pickBatchEndpoint(args.items);
    return paidPost(path, { items: args.items, defaults: args.defaults || { voice: "F2", lang: "en" } });
  }

  throw new Error(`Unknown tool: ${name}`);
}

const server = new McpServer({ name: "voice-mcp", version: "0.1.2" });
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
    },
    async (args) => {
      try {
        return textResult(await callTool(tool.name, args || {}));
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
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
