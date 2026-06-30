# Voice MCP

Give AI agents a voice with x402 pay-per-call speech.

This MCP wraps `https://voice.forgemesh.io`, an x402 Voice API with standard voices, persona voices, OpenAI-shaped speech requests, 31 languages, speed controls, quality controls, and batch generation. Payments are made per call in USDC on Base.

## Tools

| Tool | Price | Purpose |
|------|-------|---------|
| `list_tts_voices` | Free | Voices, personas, languages, pricing |
| `speak_standard` | $0.001 / $0.003 | Standard voices |
| `speak_pro` | $0.003 / $0.006 | Speed and quality controls |
| `speak_persona` | $0.005 / $0.01 | Storyteller, Velvet, Narrator, Announcer, Assistant, Urgent, and more |
| `openai_speech` | $0.001 / $0.003 | OpenAI-shaped `/v1/audio/speech` request |
| `batch_speak` | $0.002 / $0.005 | Up to 20 texts per call |

Short prices apply to 1-500 characters. Long prices apply to 501-2000 characters.

## Install

```bash
npm install -g voice-mcp
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
