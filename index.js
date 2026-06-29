#!/usr/bin/env node
"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { x402Client, x402HTTPClient } = require("@x402/core/client");
const { ExactEvmScheme } = require("@x402/evm/exact/client");
const { toClientEvmSigner } = require("@x402/evm");
const { privateKeyToAccount } = require("viem/accounts");
const { createPublicClient, http } = require("viem");
const { base } = require("viem/chains");

const BASE_URL = (process.env.X402_TTS_BASE_URL || "https://tts.forgemesh.io").replace(/\/+$/, "");
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const TOOLS = [
  {
    name: "list_tts_voices",
    description: "List x402 TTS voices, persona voices, languages, prices, and character buckets. Free.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "speak_standard",
    description: "Give an agent a standard voice using 10 voices and 31 languages. Costs $0.001 for <=500 chars or $0.003 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", description: "Language code, default en" },
      },
      required: ["text"],
    },
  },
  {
    name: "speak_pro",
    description: "Generate tuned agent speech with speed and quality controls. Costs $0.003 for <=500 chars or $0.006 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", description: "Standard voice: M1-M5 or F1-F5" },
        lang: { type: "string", description: "Language code, default en" },
        speed: { type: "number", description: "Speech speed, 0.7-2.0" },
        steps: { type: "integer", description: "Quality steps, 1-100" },
      },
      required: ["text"],
    },
  },
  {
    name: "speak_persona",
    description: "Give an agent a persona voice such as Storyteller, Velvet, Narrator, Announcer, Assistant, or Urgent. Costs $0.005 for <=500 chars or $0.01 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", description: "Persona voice name, default Storyteller" },
        lang: { type: "string", description: "Language code, default en" },
        speed: { type: "number", description: "Speech speed, 0.7-2.0" },
        steps: { type: "integer", description: "Quality steps, 1-100" },
      },
      required: ["text"],
    },
  },
  {
    name: "openai_speech",
    description: "OpenAI-shaped speech request for agents already wired to /v1/audio/speech. Costs $0.001 for <=500 chars or $0.003 for 501-2000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Text to synthesize, max 2000 characters" },
        voice: { type: "string", description: "Standard voice: M1-M5 or F1-F5" },
        model: { type: "string", description: "Optional model field; service uses Supertonic 3" },
        response_format: { type: "string", description: "wav, flac, or ogg" },
      },
      required: ["input"],
    },
  },
  {
    name: "batch_speak",
    description: "Generate audio for up to 20 standard-voice texts in one paid call. Costs $0.002 for <=500 total chars or $0.005 for 501-2000 total chars.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Array of text items: { text, voice?, lang? }",
          items: { type: "object" },
        },
        defaults: { type: "object", description: "Default standard voice and language" },
      },
      required: ["items"],
    },
  },
];

function pickBucketEndpoint(shortPath, longPath, length) {
  if (length > 2000) throw new Error("Text is over the 2000 character maximum");
  return length > 500 ? longPath : shortPath;
}

function requireWalletClient() {
  const key = process.env.WALLET_PRIVATE_KEY;
  if (!key) throw new Error("WALLET_PRIVATE_KEY required for paid x402 TTS tools");
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
      "X-Payment": httpClient.encodePayment(paymentPayload),
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
  if (name === "list_tts_voices") return freeGet("/v1/voices");

  if (name === "speak_standard") {
    const text = String(args.text || "");
    const path = pickBucketEndpoint("/v1/tts/base", "/v1/tts/base-long", text.length);
    return paidPost(path, { text, voice: args.voice || "M1", lang: args.lang || "en" });
  }

  if (name === "speak_pro") {
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

  if (name === "speak_persona") {
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

  if (name === "openai_speech") {
    const input = String(args.input || "");
    const path = pickBucketEndpoint("/v1/audio/speech", "/v1/audio/speech-long", input.length);
    return paidPost(path, {
      input,
      voice: args.voice || "M1",
      model: args.model || "supertonic-3",
      response_format: args.response_format || "wav",
    });
  }

  if (name === "batch_speak") {
    if (!Array.isArray(args.items) || args.items.length === 0) throw new Error("items must be a non-empty array");
    const totalChars = args.items.reduce((sum, item) => sum + String(item?.text || "").length, 0);
    const path = pickBucketEndpoint("/v1/tts/batch", "/v1/tts/batch-long", totalChars);
    return paidPost(path, { items: args.items, defaults: args.defaults || { voice: "F2", lang: "en" } });
  }

  throw new Error(`Unknown tool: ${name}`);
}

const server = new Server(
  { name: "x402-tts-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return textResult(await callTool(name, args || {}));
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
