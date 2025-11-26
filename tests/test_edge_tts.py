#!/usr/bin/env python3
import asyncio
import edge_tts

async def test_tts():
    tests = [
        ("Hello", "en-US-AriaNeural"),  # English voice
        ("你好", "zh-CN-XiaoxiaoNeural"),  # Mainland Chinese
        ("您好", "zh-HK-HiuGaaiNeural"),  # HK Cantonese
        ("測試", "zh-HK-HiuMaanNeural"),  # Another HK voice
    ]

    for text, voice in tests:
        print(f"\n Testing: {voice} | Text: {text}")
        try:
            communicate = edge_tts.Communicate(text, voice)
            chunk_count = 0
            audio_size = 0

            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    chunk_count += 1
                    audio_size += len(chunk["data"])

            print(f"  ✅ Success! Chunks: {chunk_count}, Size: {audio_size} bytes")

        except Exception as e:
            print(f"  ❌ Error: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(test_tts())
