import asyncio
import edge_tts
import aiohttp
import ssl

async def main():
    print("Testing Edge TTS with SSL bypass...")
    
    # Disable SSL verification (Microsoft cert expired Oct 16)
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    
    async with aiohttp.ClientSession(connector=connector) as session:
        communicate = edge_tts.Communicate("測試", "zh-HK-HiuGaaiNeural")
        communicate.session = session
        await communicate.save("test_output.mp3")
        print("✅ SUCCESS! TTS file created: test_output.mp3")

if __name__ == "__main__":
    asyncio.run(main())
