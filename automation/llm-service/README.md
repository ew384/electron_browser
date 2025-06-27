方式1：基本测试
bashcurl -s -X POST "$BASE_URL/api/llm/$API_KEY/chat/$PROVIDER" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "hi"}'
方式2：包含所有参数
bashcurl -s -X POST "$BASE_URL/api/llm/$API_KEY/chat/$PROVIDER" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "hi", "newChat": true, "stream": false}'
方式3：流式响应测试
bashcurl -s -X POST "$BASE_URL/api/llm/$API_KEY/chat/$PROVIDER" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "hi", "stream": true}'
方式4：包含文件的测试
bashcurl -s -X POST "$BASE_URL/api/llm/$API_KEY/chat/$PROVIDER" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "请分析这个文件", "files": ["file1.txt"], "newChat": true}'
API 接口的完整格式要求
根据代码分析，该接口支持以下参数：
参数类型必需默认值说明promptstring是*-要发送的消息内容filesarray否-文件列表streamboolean否false是否使用流式响应newChatboolean否false是否开始新的对话
*注意：prompt 或 files 至少需要提供一个
