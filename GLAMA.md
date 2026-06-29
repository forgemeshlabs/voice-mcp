# Glama Release Build

Use this repository's Dockerfile for the Glama Dockerfile admin page:

```text
https://glama.ai/mcp/servers/forgemeshlabs/x402-tts-mcp/admin/dockerfile
```

If the admin page asks for build steps, use:

```text
npm ci --omit=dev
```

CMD arguments:

```json
["node", "index.js"]
```

Environment variables schema:

```json
{
  "type": "object",
  "properties": {
    "WALLET_PRIVATE_KEY": {
      "description": "Base wallet private key for x402 micropayments",
      "type": "string"
    },
    "X402_TTS_BASE_URL": {
      "description": "Optional x402 TTS API base URL",
      "type": "string",
      "default": "https://tts.forgemesh.io"
    },
    "BASE_RPC_URL": {
      "description": "Optional Base mainnet RPC URL",
      "type": "string",
      "default": "https://mainnet.base.org"
    }
  },
  "required": ["WALLET_PRIVATE_KEY"]
}
```

Runtime notes:

- Transport: stdio
- Authentication: wallet environment variable for paid x402 calls
- No inbound HTTP port is required
- Free discovery tool works without payment; paid tools return Base64 audio and payment receipt metadata
