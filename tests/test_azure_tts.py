#!/usr/bin/env python3
"""
Test Azure Cognitive Services TTS
Make sure .env has AZURE_SPEECH_KEY and AZURE_SPEECH_REGION
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION")

print("=" * 60)
print("Testing Azure Cognitive Services TTS")
print("=" * 60)

# Check if credentials are configured
if not AZURE_SPEECH_KEY:
    print("❌ AZURE_SPEECH_KEY not found in .env file")
    print("\nPlease add to .env:")
    print("AZURE_SPEECH_KEY=your_key_here")
    print("AZURE_SPEECH_REGION=your_region_here")
    print("\nSee AZURE_TTS_SETUP.md for instructions")
    exit(1)

if not AZURE_SPEECH_REGION:
    print("❌ AZURE_SPEECH_REGION not found in .env file")
    print("\nPlease add to .env:")
    print("AZURE_SPEECH_REGION=your_region_here")
    print("(e.g., eastasia, southeastasia, eastus)")
    exit(1)

print(f"✅ Azure Speech Key: {AZURE_SPEECH_KEY[:10]}...{AZURE_SPEECH_KEY[-4:]}")
print(f"✅ Azure Region: {AZURE_SPEECH_REGION}")
print()

try:
    import azure.cognitiveservices.speech as speechsdk

    # Configure speech service
    speech_config = speechsdk.SpeechConfig(
        subscription=AZURE_SPEECH_KEY,
        region=AZURE_SPEECH_REGION
    )

    # Use HiuGaai voice (Cantonese female)
    speech_config.speech_synthesis_voice_name = "zh-HK-HiuGaaiNeural"

    # Configure audio output to file
    audio_config = speechsdk.audio.AudioOutputConfig(filename="/tmp/azure_tts_test.wav")

    # Create synthesizer
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=audio_config
    )

    # Test text (Cantonese)
    test_text = "您好！需要咩護理服務嗎？"

    print(f"🎤 Testing synthesis with HiuGaai voice...")
    print(f"📝 Text: {test_text}")
    print()

    # Synthesize
    result = synthesizer.speak_text_async(test_text).get()

    # Check result
    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        audio_data = result.audio_data
        print(f"✅ Success! Generated {len(audio_data)} bytes")
        print(f"💾 Saved to: /tmp/azure_tts_test.wav")
        print()
        print("🎧 Play the audio file to verify Cantonese voice:")
        print("   aplay /tmp/azure_tts_test.wav")
        print("   (or open in your media player)")
        print()
        print("=" * 60)
        print("✅ Azure TTS is working correctly!")
        print("=" * 60)

    elif result.reason == speechsdk.ResultReason.Canceled:
        cancellation = result.cancellation_details
        print(f"❌ Synthesis failed: {cancellation.reason}")

        if cancellation.reason == speechsdk.CancellationReason.Error:
            print(f"❌ Error details: {cancellation.error_details}")
            print()

            if "401" in str(cancellation.error_details) or "Unauthorized" in str(cancellation.error_details):
                print("🔑 Authentication error - check your API key")
                print("   Make sure AZURE_SPEECH_KEY in .env is correct")

            elif "region" in str(cancellation.error_details).lower():
                print("🌍 Region error - check your region setting")
                print("   Make sure AZURE_SPEECH_REGION in .env matches your resource")
                print("   Common regions: eastasia, southeastasia, eastus")

            else:
                print("💡 Common issues:")
                print("   1. Check .env file has correct AZURE_SPEECH_KEY")
                print("   2. Check .env file has correct AZURE_SPEECH_REGION")
                print("   3. Verify your Azure subscription is active")
                print("   4. Check you haven't exceeded free tier quota")

except ImportError:
    print("❌ Azure Speech SDK not installed")
    print("\nInstall with:")
    print("   pip3 install azure-cognitiveservices-speech")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
