# Voice MCP

[![npm version](https://img.shields.io/npm/v/@forgemeshlabs/voice-mcp)](https://www.npmjs.com/package/@forgemeshlabs/voice-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@forgemeshlabs/voice-mcp)](https://www.npmjs.com/package/@forgemeshlabs/voice-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![payments](https://img.shields.io/badge/payments-x402%20USDC-0052FF)](https://x402.org)
[![network](https://img.shields.io/badge/network-Base-0052FF)](https://base.org)

Give Your Agent A Voice: x402 pay-per-call speech with 20 voices, 10 personas, 31 languages, granular speed and quality controls, OpenAI-shaped requests, and batch audio.

This MCP wraps `https://voice.forgemesh.io`, an x402 Voice API with standard voices, persona voices, OpenAI-shaped speech requests, 31 languages, speed controls, quality controls, and batch generation. Payments are made per call in USDC on Base.

## Voice Coverage

- 10 standard voices: `M1`-`M5`, `F1`-`F5`
- 10 persona voices: `Storyteller`, `Narrator`, `Announcer`, `Assistant`, `Urgent`, `Sage`, `Spark`, `Anchor`, `Velvet`, `Echo`
- 31 languages: `en`, `ko`, `ja`, `ar`, `bg`, `cs`, `da`, `de`, `el`, `es`, `et`, `fi`, `fr`, `hi`, `hr`, `hu`, `id`, `it`, `lt`, `lv`, `nl`, `pl`, `pt`, `ro`, `ru`, `sk`, `sl`, `sv`, `tr`, `uk`, `vi`
- Granular control: speed `0.7x`-`2.0x`, quality steps `1`-`100`, persona selection, OpenAI-shaped audio format requests, and batch generation for up to 20 texts
- Voice samples are generated on demand by the paid speech tools and returned as `audio_base64` WAV output

## Voice Samples

- [Assistant sample](https://voice.forgemesh.io/samples/_expressive/combo_assistant.wav)
- [Urgent sample](https://voice.forgemesh.io/samples/_expressive/combo_urgent.wav)
- [Narrator sample](https://voice.forgemesh.io/samples/_expressive/combo_narrator.wav)
- [Storyteller sample](https://voice.forgemesh.io/samples/_expressive/combo_storyteller.wav)

## Tools

| Tool | Price | Purpose |
|------|-------|---------|
| `list_voice_catalog` | Free | Voices, personas, languages, pricing, buckets, and controls |
| `generate_standard_voice` | $0.001 / $0.003 | Low-cost speech with 10 standard voices |
| `generate_controlled_voice` | $0.003 / $0.006 | Speech with granular speed and quality controls |
| `generate_persona_voice` | $0.005 / $0.01 | Storyteller, Velvet, Narrator, Announcer, Assistant, Urgent, and more |
| `generate_openai_compatible_voice` | $0.001 / $0.003 | OpenAI-shaped `/v1/audio/speech` request |
| `generate_batch_voices` | $0.002 / $0.005 | Up to 20 texts per call |

Short prices apply to 1-500 characters. Long prices apply to 501-2000 characters.

The MCP validates voice names, language codes, audio formats, speed/quality ranges,
batch item count, and character limits locally before making a paid x402 call.

## Install

```bash
npm install -g @forgemeshlabs/voice-mcp
```

## Docker

Build:

```bash
docker build -t voice-mcp .
```

Run over stdio:

```bash
docker run --rm -i \
  -e WALLET_PRIVATE_KEY=0x... \
  voice-mcp
```

CMD arguments:

```json
["node", "index.js"]
```

## MCP Config

```json
{
  "mcpServers": {
    "voice": {
      "command": "voice-mcp",
      "env": {
        "WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Optional:

```json
{
  "X402_VOICE_BASE_URL": "https://voice.forgemesh.io",
  "BASE_RPC_URL": "https://mainnet.base.org"
}
```

## Notes

- Paid tools require a Base wallet private key with USDC.
- The server returns `audio_base64` for audio tools so MCP clients can store, play, or forward the WAV bytes.
- No API keys or subscriptions are required for the voice service itself.
