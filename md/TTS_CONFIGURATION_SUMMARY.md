# TTS Configuration Summary

This document outlines the Text-to-Speech (TTS) configuration and priority as implemented in `server_qwen.py`.

## TTS Provider Priority

The system uses a multi-layered fallback strategy to ensure a high level of availability for TTS services. The priority is as follows:

1.  **Primary (Server-Side): Microsoft Edge TTS**
    - The system first attempts to synthesize speech using the high-quality, streaming `edge-tts` library. This is managed by a connection pool for low latency.

2.  **Secondary (Client-Side): Browser-Based TTS**
    - If the primary Edge TTS service fails, the server responds with a `503 Service Unavailable` error.
    - This response includes a special header: `X-TTS-Fallback: browser`.
    - This header instructs the client-side application to attempt synthesis using the user's own browser-based TTS engine (e.g., Chrome's built-in speech synthesis).
    - This client-side fallback can be skipped if the initial request includes `"skip_browser": true`.

3.  **Tertiary (Server-Side): Microsoft Azure TTS**
    - If the client-side fallback is skipped (via `skip_browser: true`) and Edge TTS has failed, the server will then attempt to use Azure Cognitive Services TTS.
    - This is a high-quality alternative for Cantonese voices.

4.  **Quaternary (Server-Side): Google Translate TTS (gTTS)**
    - If all previous providers (Edge and Azure) fail, the system makes a final attempt using the `gTTS` library.
    - This service uses a standard Mandarin voice as a last resort.

## Configuration

The main TTS logic is located in the `tts_stream_optimized` function. The order of operations and fallback logic is explicitly defined within this function.

The `TTSRequest` model now includes a `skip_browser` boolean field, which allows the client to force the server to proceed directly to its own fallback chain (Azure, gTTS) instead of instructing a client-side fallback.

```python
class TTSRequest(BaseModel):
    text: str
    voice: str = 'zh-HK-HiuGaaiNeural'
    rate: int = 160
    pitch: int = 100
    skip_browser: bool = False  # When true, skip browser TTS and use server fallback directly
```
