# LLM_chromeTab_manager.py - FastAPI适配层 (修改版本)
# 保持100%接口兼容，内部切换到CDP模式

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Optional, List, Any, Union
import asyncio
import uuid
import logging
import json
import os
import time
import httpx
from pathlib import Path

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="LLM API Service (CDP Mode)")

# ==================== 配置和常量 ====================

# LLM CDP服务配置
LLM_SERVICE_CONFIG = {
    'base_url': os.getenv('LLM_SERVICE_URL', 'http://localhost:3212'),
    'timeout': int(os.getenv('LLM_SERVICE_TIMEOUT', '60')),
    'max_retries': int(os.getenv('LLM_SERVICE_RETRIES', '3')),
    'retry_delay': float(os.getenv('LLM_SERVICE_RETRY_DELAY', '2.0'))
}

# API密钥映射 (保持原有配置兼容)
api_keys = {
    "wangendian": "user_1",
    "chenhao": "user_2", 
    "test1": "user_3",
}

# 用户会话映射 (兼容原有结构)
# 格式: {api_key: {provider: {"session_id": str, "conversation_id": str, "created_at": int}}}
user_sessions = {key: {} for key in api_keys}

# HTTP客户端
http_client = None

# ==================== 数据模型 (保持原有) ====================

class TabRequest(BaseModel):
    provider: str  # 提供商：claude, chatgpt等

class ChatRequest(BaseModel):
    prompt: str
    new_chat: bool = False
    file_paths: Optional[List[str]] = None

# ==================== HTTP客户端管理 ====================

async def get_http_client():
    """获取HTTP客户端实例"""
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(LLM_SERVICE_CONFIG['timeout']),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)
        )
    return http_client

async def close_http_client():
    """关闭HTTP客户端"""
    global http_client
    if http_client is not None:
        await http_client.aclose()
        http_client = None

# ==================== LLM服务调用方法 ====================

async def call_llm_service(method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
    """
    调用LLM CDP服务的通用方法
    
    Args:
        method: HTTP方法 (GET, POST, DELETE等)
        endpoint: API端点
        **kwargs: 传递给httpx的其他参数
    
    Returns:
        API响应数据
    """
    client = await get_http_client()
    url = f"{LLM_SERVICE_CONFIG['base_url']}{endpoint}"
    
    for attempt in range(LLM_SERVICE_CONFIG['max_retries']):
        try:
            logger.info(f"[CDP Service] {method} {endpoint} (尝试 {attempt + 1})")
            
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            
            data = response.json()
            logger.info(f"[CDP Service] {method} {endpoint} - 成功")
            return data
            
        except httpx.HTTPStatusError as e:
            logger.error(f"[CDP Service] HTTP错误 {e.response.status_code}: {e.response.text}")
            if e.response.status_code == 404:
                raise HTTPException(status_code=404, detail="LLM服务端点不存在")
            elif e.response.status_code >= 500:
                if attempt < LLM_SERVICE_CONFIG['max_retries'] - 1:
                    await asyncio.sleep(LLM_SERVICE_CONFIG['retry_delay'])
                    continue
                else:
                    raise HTTPException(status_code=500, detail="LLM服务内部错误")
            else:
                raise HTTPException(status_code=e.response.status_code, detail="LLM服务请求失败")
                
        except httpx.ConnectError:
            logger.error(f"[CDP Service] 连接错误，尝试 {attempt + 1}")
            if attempt < LLM_SERVICE_CONFIG['max_retries'] - 1:
                await asyncio.sleep(LLM_SERVICE_CONFIG['retry_delay'])
                continue
            else:
                raise HTTPException(status_code=503, detail="无法连接到LLM CDP服务")
                
        except httpx.TimeoutException:
            logger.error(f"[CDP Service] 请求超时，尝试 {attempt + 1}")
            if attempt < LLM_SERVICE_CONFIG['max_retries'] - 1:
                await asyncio.sleep(LLM_SERVICE_CONFIG['retry_delay'])
                continue
            else:
                raise HTTPException(status_code=504, detail="LLM服务响应超时")
                
        except Exception as e:
            logger.error(f"[CDP Service] 未知错误: {str(e)}")
            if attempt < LLM_SERVICE_CONFIG['max_retries'] - 1:
                await asyncio.sleep(LLM_SERVICE_CONFIG['retry_delay'])
                continue
            else:
                raise HTTPException(status_code=500, detail=f"LLM服务调用失败: {str(e)}")

async def stream_llm_service(method: str, endpoint: str, **kwargs):
    """
    调用LLM CDP服务的流式方法
    
    Args:
        method: HTTP方法
        endpoint: API端点
        **kwargs: 传递给httpx的其他参数
    
    Yields:
        流式响应数据
    """
    client = await get_http_client()
    url = f"{LLM_SERVICE_CONFIG['base_url']}{endpoint}"
    
    try:
        logger.info(f"[CDP Service Stream] {method} {endpoint}")
        
        async with client.stream(method, url, **kwargs) as response:
            response.raise_for_status()
            
            async for line in response.aiter_lines():
                if line.startswith('data: '):
                    data_str = line[6:]  # 移除 'data: ' 前缀
                    if data_str.strip() == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        yield data
                    except json.JSONDecodeError:
                        continue
                        
    except Exception as e:
        logger.error(f"[CDP Service Stream] 流式请求失败: {str(e)}")
        yield {"type": "error", "error": str(e)}

# ==================== 辅助函数 ====================

async def validate_api_key(api_key: str = Header(...)):
    """验证API密钥并返回用户信息 (保持原有逻辑)"""
    if api_key not in api_keys:
        raise HTTPException(status_code=401, detail="无效的API密钥")
    return api_key

def get_user_id(api_key: str) -> str:
    """获取用户ID (保持原有逻辑)"""
    return api_keys.get(api_key, "unknown")

async def ensure_llm_service_health():
    """检查LLM CDP服务健康状态"""
    try:
        health_data = await call_llm_service("GET", "/api/health")
        if not health_data.get("success", False):
            raise HTTPException(status_code=503, detail="LLM CDP服务不健康")
        return health_data
    except Exception as e:
        logger.error(f"[Health Check] LLM服务健康检查失败: {str(e)}")
        raise HTTPException(status_code=503, detail="LLM CDP服务不可用")

# ==================== API路由 (保持100%兼容) ====================

@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化 (适配为CDP模式)"""
    logger.info("🚀 启动FastAPI适配层 (CDP模式)")
    
    try:
        # 检查LLM CDP服务可用性
        await ensure_llm_service_health()
        logger.info("✅ LLM CDP服务连接成功")
        
        # 初始化HTTP客户端
        await get_http_client()
        logger.info("✅ HTTP客户端初始化完成")
        
    except Exception as e:
        logger.error(f"❌ 启动失败: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时的清理"""
    logger.info("🛑 关闭FastAPI适配层")
    await close_http_client()

@app.post("/tabs")
async def create_tab(request: TabRequest, api_key: str = Depends(validate_api_key)):
    """
    为用户创建新标签页 (保持原有接口，内部调用CDP服务)
    """
    try:
        provider = request.provider
        
        logger.info(f"📝 创建标签页请求: {api_key} - {provider}")
        
        # 检查是否已有该提供商的会话
        if provider in user_sessions[api_key]:
            existing_session = user_sessions[api_key][provider]
            logger.info(f"♻️ 复用现有会话: {existing_session['session_id']}")
            
            # 验证现有会话是否仍然有效
            try:
                status_data = await call_llm_service(
                    "GET", 
                    f"/api/llm/{api_key}/status"
                )
                
                if provider in status_data.get("status", {}).get("sessions", {}):
                    # 会话仍然有效，返回现有信息
                    return {
                        "status": "success",
                        "message": f"已有{provider}标签页",
                        "tab_id": existing_session["session_id"],
                        "provider": provider,
                        "title": f"{provider.title()} Chat",
                        "url": f"https://{provider}.ai/" if provider == "claude" else f"https://{provider}.com/",
                        "reused": True
                    }
            except:
                # 会话验证失败，继续创建新会话
                logger.warning(f"⚠️ 现有会话验证失败，创建新会话: {provider}")
                user_sessions[api_key].pop(provider, None)
        
        # 调用LLM CDP服务创建新会话
        create_data = await call_llm_service(
            "POST",
            f"/api/llm/{api_key}/sessions",
            json={"provider": provider, "forceNew": False}
        )
        
        if create_data.get("success"):
            session_info = create_data["session"]
            
            # 更新本地会话缓存
            user_sessions[api_key][provider] = {
                "session_id": session_info["sessionId"],
                "conversation_id": None,  # 将在第一次对话时设置
                "created_at": session_info["createdAt"],
                "provider_name": session_info["providerName"]
            }
            
            logger.info(f"✅ 标签页创建成功: {session_info['sessionId']}")
            
            # 返回兼容格式
            return {
                "status": "success",
                "tab_id": session_info["sessionId"],
                "provider": provider,
                "title": session_info["providerName"],
                "url": f"https://{provider}.ai/" if provider == "claude" else f"https://{provider}.com/",
                "created": create_data.get("created", True),
                "features": session_info.get("features", {})
            }
        else:
            raise HTTPException(status_code=500, detail=create_data.get("error", "会话创建失败"))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 创建标签页失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"创建标签页失败: {str(e)}")

@app.delete("/tabs/{provider}")
async def close_tab(provider: str, api_key: str = Depends(validate_api_key)):
    """
    关闭指定提供商的标签页 (保持原有接口)
    """
    try:
        if provider not in user_sessions[api_key]:
            raise HTTPException(status_code=404, detail=f"找不到提供商 {provider} 的标签页")
        
        logger.info(f"🔌 关闭标签页: {api_key} - {provider}")
        
        # 调用LLM CDP服务关闭会话
        close_data = await call_llm_service(
            "DELETE",
            f"/api/llm/{api_key}/sessions/{provider}"
        )
        
        if close_data.get("success"):
            # 从本地缓存中移除
            session_id = user_sessions[api_key][provider]["session_id"]
            user_sessions[api_key].pop(provider, None)
            
            logger.info(f"✅ 标签页关闭成功: {session_id}")
            
            return {
                "status": "success", 
                "message": f"{provider}标签页已关闭",
                "session_id": session_id
            }
        else:
            raise HTTPException(status_code=500, detail=close_data.get("error", "关闭标签页失败"))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 关闭标签页失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"关闭标签页失败: {str(e)}")

@app.get("/tabs")
async def list_tabs(api_key: str = Depends(validate_api_key)):
    """
    列出用户的所有标签页 (保持原有接口)
    """
    try:
        logger.info(f"📋 列出标签页: {api_key}")
        
        # 调用LLM CDP服务获取会话列表
        sessions_data = await call_llm_service(
            "GET",
            f"/api/llm/{api_key}/sessions"
        )
        
        if sessions_data.get("success"):
            sessions = sessions_data["sessions"]
            tabs = []
            
            # 转换为兼容格式
            for session in sessions:
                tabs.append({
                    "tab_id": session["sessionId"],
                    "provider": session["provider"],
                    "title": session["providerName"],
                    "url": f"https://{session['provider']}.ai/" if session['provider'] == "claude" else f"https://{session['provider']}.com/",
                    "status": session["status"],
                    "created_at": session["createdAt"],
                    "last_used": session["lastUsed"],
                    "message_count": session["messageCount"]
                })
                
                # 同步更新本地缓存
                user_sessions[api_key][session["provider"]] = {
                    "session_id": session["sessionId"],
                    "conversation_id": None,
                    "created_at": session["createdAt"],
                    "provider_name": session["providerName"]
                }
            
            logger.info(f"✅ 标签页列表获取成功: {len(tabs)} 个")
            return tabs
        else:
            raise HTTPException(status_code=500, detail=sessions_data.get("error", "获取标签页列表失败"))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 列出标签页失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"列出标签页失败: {str(e)}")

@app.post("/chat/{provider}")
async def chat_with_llm(
    provider: str, 
    request: Dict[str, Any], 
    api_key: str = Depends(validate_api_key)
):
    """
    LLM对话API (保持原有接口，支持流式和非流式)
    """
    try:
        logger.info(f"💬 对话请求: {api_key} - {provider}")
        
        # 检查provider是否存在会话
        if provider not in user_sessions[api_key]:
            # 自动创建会话
            create_result = await create_tab(TabRequest(provider=provider), api_key)
            if create_result["status"] != "success":
                raise HTTPException(status_code=500, detail="无法创建LLM会话")
        
        # 获取请求参数
        prompt = request.get("prompt", "")
        file_paths = request.get("file_paths", None)
        stream = request.get("stream", False)
        new_chat = request.get("new_chat", False)
        
        if stream:
            # 流式响应
            logger.info(f"🌊 启动流式响应: {provider}")
            
            async def generate_stream():
                try:
                    async for chunk in stream_llm_service(
                        "POST",
                        f"/api/llm/{api_key}/chat/{provider}",
                        json={
                            "prompt": prompt,
                            "files": file_paths,
                            "stream": True,
                            "newChat": new_chat
                        }
                    ):
                        # 转换为原有格式
                        if chunk.get("type") == "error":
                            yield json.dumps({
                                "status": "error",
                                "message": chunk.get("error", "Unknown error")
                            }) + "\n"
                        elif chunk.get("type") == "complete":
                            # 更新对话ID
                            if "conversationId" in chunk:
                                user_sessions[api_key][provider]["conversation_id"] = chunk["conversationId"]
                            
                            yield json.dumps({
                                "status": "success",
                                "content": chunk.get("data", {}),
                                "conversation_id": chunk.get("conversationId"),
                                "provider": provider
                            }) + "\n"
                        else:
                            # 中间数据块
                            yield json.dumps(chunk) + "\n"
                            
                except Exception as e:
                    logger.error(f"❌ 流式响应错误: {str(e)}")
                    yield json.dumps({
                        "status": "error",
                        "message": str(e)
                    }) + "\n"
            
            return StreamingResponse(
                generate_stream(), 
                media_type="application/json",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        else:
            # 非流式响应
            logger.info(f"📝 启动非流式响应: {provider}")
            
            chat_data = await call_llm_service(
                "POST",
                f"/api/llm/{api_key}/chat/{provider}",
                json={
                    "prompt": prompt,
                    "files": file_paths,
                    "stream": False,
                    "newChat": new_chat
                }
            )
            
            if chat_data.get("success"):
                # 更新对话ID
                if "conversationId" in chat_data:
                    user_sessions[api_key][provider]["conversation_id"] = chat_data["conversationId"]
                
                logger.info(f"✅ 对话完成: {provider}")
                
                # 返回兼容格式
                return {
                    "status": "success",
                    "content": chat_data["response"],
                    "conversation_id": chat_data.get("conversationId"),
                    "provider": provider,
                    "timing": chat_data.get("timing", {})
                }
            else:
                raise HTTPException(status_code=500, detail=chat_data.get("error", "对话处理失败"))
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 对话失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"对话失败: {str(e)}")

@app.post("/tabs/{provider}/screenshot")
async def take_screenshot(provider: str, api_key: str = Depends(validate_api_key)):
    """
    获取指定提供商标签页的截图 (保持原有接口)
    """
    try:
        if provider not in user_sessions[api_key]:
            raise HTTPException(status_code=404, detail=f"找不到提供商 {provider} 的标签页")
        
        logger.info(f"📸 截图请求: {api_key} - {provider}")
        
        # 由于CDP模式下截图需要特殊处理，这里返回占位符
        # 实际实现需要通过LLM服务调用截图功能
        
        return {
            "status": "success",
            "screenshot_path": f"/tmp/screenshot_{provider}_{int(time.time())}.png",
            "message": "截图功能在CDP模式下需要特殊实现",
            "provider": provider
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 截图失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"截图失败: {str(e)}")

# ==================== 健康检查和调试接口 ====================

@app.get("/health")
async def health_check():
    """健康检查接口"""
    try:
        # 检查LLM CDP服务健康状态
        llm_health = await ensure_llm_service_health()
        
        return {
            "status": "healthy",
            "service": "LLM API Adapter (CDP Mode)",
            "timestamp": time.time(),
            "llm_service": {
                "available": True,
                "url": LLM_SERVICE_CONFIG['base_url'],
                "health": llm_health
            },
            "active_users": len([k for k, v in user_sessions.items() if v]),
            "total_sessions": sum(len(sessions) for sessions in user_sessions.values())
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": time.time()
        }

@app.get("/debug/sessions")
async def debug_sessions():
    """调试接口：查看所有会话状态"""
    try:
        debug_info = {
            "local_sessions": user_sessions,
            "api_keys": list(api_keys.keys()),
            "llm_service_config": LLM_SERVICE_CONFIG
        }
        
        # 获取LLM服务的调试信息
        try:
            llm_debug = await call_llm_service("GET", "/api/admin/stats")
            debug_info["llm_service_stats"] = llm_debug
        except:
            debug_info["llm_service_stats"] = "无法获取LLM服务统计信息"
        
        return debug_info
    except Exception as e:
        return {"error": str(e)}

@app.post("/admin/cleanup")
async def admin_cleanup():
    """管理接口：清理过期会话"""
    try:
        logger.info("🧹 执行管理员清理操作")
        
        # 调用LLM服务清理
        cleanup_data = await call_llm_service(
            "POST",
            "/api/admin/cleanup",
            json={"maxAge": 24 * 60 * 60 * 1000, "dryRun": False}
        )
        
        # 清理本地会话缓存
        cleaned_local = 0
        for api_key in user_sessions:
            providers_to_remove = []
            for provider in user_sessions[api_key]:
                # 可以添加本地清理逻辑
                pass
        
        return {
            "success": True,
            "llm_service_cleanup": cleanup_data,
            "local_cleanup": {"cleaned": cleaned_local},
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error(f"❌ 清理操作失败: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

# ==================== 启动配置 ====================

if __name__ == "__main__":
    import uvicorn
    
    # 从环境变量读取配置
    host = os.getenv('FASTAPI_HOST', '0.0.0.0')
    port = int(os.getenv('FASTAPI_PORT', '5815'))
    
    logger.info(f"🚀 启动FastAPI适配层 (CDP模式)")
    logger.info(f"📡 LLM CDP服务: {LLM_SERVICE_CONFIG['base_url']}")
    logger.info(f"🌐 监听地址: {host}:{port}")
    
    uvicorn.run(
        "LLM_chromeTab_manager:app",  # 模块:应用名
        host=host,
        port=port,
        reload=os.getenv('FASTAPI_RELOAD', 'false').lower() == 'true',
        log_level=os.getenv('FASTAPI_LOG_LEVEL', 'info').lower()
    )