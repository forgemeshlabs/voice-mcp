# Changelog

## 0.1.2

- Added MCP-side voice, language, audio format, speed, quality, item-count, and character-limit validation so invalid paid calls are rejected before x402 payment.
- Matched server long-route behavior: 1-500 chars use short endpoints, 501-2000 chars use long endpoints, and over-limit requests fail locally.
- Added total batch character validation for `generate_batch_voices`.

## 0.1.1

- Renamed MCP tools for clearer agent routing and Glama discovery.
- Expanded tool descriptions with stronger intent, use cases, pricing, and control details.

## 0.1.0

- Initial x402 Voice MCP release.
- Added free voice discovery and paid standard, pro, persona, OpenAI-shaped, and batch speech tools.
- Added Glama registry metadata and Docker build files.
