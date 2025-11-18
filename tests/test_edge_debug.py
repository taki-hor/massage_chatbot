#!/usr/bin/env python3
import asyncio
import edge_tts
import logging

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)

async def test_tts():
    text = "Hello"
    voice = "en-US-AriaNeural"

    print(f"Testing with: {voice} | {text}")

    try:
        communicate = edge_tts.Communicate(text, voice)

        # Try to access the underlying websocket connection
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                print(f"Got audio chunk: {len(chunk['data'])} bytes")
                break

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_tts())
