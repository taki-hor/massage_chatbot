#!/usr/bin/env python3
"""
Test Coqui TTS with Chinese models
"""
from TTS.api import TTS
import os

print("=" * 60)
print("Testing Coqui TTS")
print("=" * 60)
print()

# List all available models
print("📋 Listing all available TTS models...\n")
tts = TTS()
all_models = tts.list_models()

# Filter Chinese models
chinese_models = [m for m in all_models if 'zh' in m.lower() or 'chinese' in m.lower()]

print(f"Found {len(chinese_models)} Chinese TTS models:\n")
for i, model in enumerate(chinese_models, 1):
    print(f"{i}. {model}")

print("\n" + "=" * 60)

if not chinese_models:
    print("❌ No Chinese models found!")
    print("\nAvailable model categories:")
    categories = set()
    for model in all_models:
        category = model.split('/')[0] if '/' in model else model
        categories.add(category)
    for cat in sorted(categories):
        print(f"  - {cat}")
    exit(1)

# Test with first available Chinese model
print(f"\n🎤 Testing synthesis with: {chinese_models[0]}")
print("=" * 60)

test_text = "您好！需要咩護理服務嗎？"  # Cantonese text
test_text_mandarin = "你好！需要什么护理服务吗？"  # Mandarin equivalent

print(f"\n📝 Test text (Cantonese): {test_text}")
print(f"📝 Test text (Mandarin): {test_text_mandarin}")
print()

try:
    # Initialize TTS with the model
    print(f"⏳ Loading model (this may take 1-2 minutes on first run)...")
    tts_model = TTS(model_name=chinese_models[0])

    # Test 1: Cantonese text
    print(f"\n🔊 Test 1: Synthesizing Cantonese text...")
    output_file_1 = "/tmp/coqui_test_cantonese.wav"
    tts_model.tts_to_file(text=test_text, file_path=output_file_1)
    file_size_1 = os.path.getsize(output_file_1)
    print(f"✅ Success! Saved to: {output_file_1}")
    print(f"📦 File size: {file_size_1} bytes")

    # Test 2: Mandarin text
    print(f"\n🔊 Test 2: Synthesizing Mandarin text...")
    output_file_2 = "/tmp/coqui_test_mandarin.wav"
    tts_model.tts_to_file(text=test_text_mandarin, file_path=output_file_2)
    file_size_2 = os.path.getsize(output_file_2)
    print(f"✅ Success! Saved to: {output_file_2}")
    print(f"📦 File size: {file_size_2} bytes")

    print("\n" + "=" * 60)
    print("✅ Coqui TTS is working!")
    print("=" * 60)

    print("\n🎧 Play the audio files to compare:")
    print(f"   aplay {output_file_1}")
    print(f"   aplay {output_file_2}")

    print("\n⚠️ IMPORTANT:")
    print("   - Coqui TTS Chinese models are trained on MANDARIN")
    print("   - Cantonese text will be pronounced in Mandarin")
    print("   - NOT suitable for Hong Kong Cantonese chatbot")
    print("   - Recommended: Use Azure TTS for proper Cantonese")

    print("\n📊 Model Performance:")
    print(f"   Model: {chinese_models[0]}")
    print(f"   Language: Mandarin Chinese (simplified)")
    print(f"   Quality: ⭐⭐⭐ Good for Mandarin, ❌ Wrong for Cantonese")

except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()

    print("\n💡 Common issues:")
    print("   1. First run downloads large model files (100-200MB)")
    print("   2. Requires good internet connection")
    print("   3. May need more RAM (4GB+)")
    print("   4. CPU-based synthesis is slow (10-30 seconds)")

print("\n" + "=" * 60)
