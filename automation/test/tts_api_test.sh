curl -X POST "http://localhost:8000/tts_with_character"   -H "Content-Type: application/json"   -d '{

    "text": "高阶的思维方式可以让我们成就无限可能性",

    "character_id": "JackMa",

    "gender": "male",

    "pitch": "moderate",

    "speed": "moderate"

  }'
#{"message":"Speech generated successfully with character","audio_id":"1a75ea77-d95c-4903-9f9c-050f4cf3d041","audio_path":"api_results/20250626123546_1a75ea77-d95c-4903-9f9c-050f4cf3d041_JackMa.wav","timestamp":"2025-06-26T12:35:51.925575","character_used":"JackMa"}

#真实地址是：/oper/ch/git/Spark-TTS/api_results/20250626123546_1a75ea77-d95c-4903-9f9c-050f4cf3d041_JackMa.wav


