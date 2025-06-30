# automation_service.py - Python微服务包装器
# 基于 social-auto-upload 功能的HTTP服务

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import asyncio
import json
import os
import uuid
from datetime import datetime
import uvicorn
from pathlib import Path

# 导入原有的上传器模块
try:
    from uploader.douyin_uploader.main import douyin_setup, DouYinVideo, cookie_auth as douyin_cookie_auth
    from uploader.tencent_uploader.main import weixin_setup, TencentVideo, cookie_auth as wechat_cookie_auth
    from uploader.xiaohongshu_uploader.main import xiaohongshu_setup, XiaoHongShuVideo, cookie_auth as xhs_cookie_auth
    from uploader.ks_uploader.main import ks_setup, KSVideo, cookie_auth as ks_cookie_auth
except ImportError as e:
    print(f"Warning: Failed to import uploaders: {e}")

app = FastAPI(title="Automation Service", version="1.0.0")

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 数据模型 ====================

class LoginRequest(BaseModel):
    account_id: str
    platform: str
    debug_port: Optional[int] = None

class LoginSession(BaseModel):
    session_id: str
    account_id: str
    platform: str
    status: str  # pending, waiting_user, completed, failed
    start_time: datetime
    end_time: Optional[datetime] = None
    error_message: Optional[str] = None

class CookieValidationRequest(BaseModel):
    account_id: str
    platform: str
    cookie_file: str

class UploadRequest(BaseModel):
    account_id: str
    platform: str
    video_file: str
    title: str
    description: str
    tags: List[str]
    publish_time: Optional[str] = None

class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None

# ==================== 全局状态管理 ====================

class ServiceState:
    def __init__(self):
        self.active_sessions: Dict[str, LoginSession] = {}
        self.platform_configs = {
            'douyin': {
                'name': '抖音',
                'setup_func': douyin_setup,
                'video_class': DouYinVideo,
                'cookie_auth_func': douyin_cookie_auth,
                'cookie_dir': './cookies/douyin_uploader'
            },
            'wechat': {
                'name': '微信视频号',
                'setup_func': weixin_setup,
                'video_class': TencentVideo,
                'cookie_auth_func': wechat_cookie_auth,
                'cookie_dir': './cookies/tencent_uploader'
            },
            'xiaohongshu': {
                'name': '小红书',
                'setup_func': xiaohongshu_setup,
                'video_class': XiaoHongShuVideo,
                'cookie_auth_func': xhs_cookie_auth,
                'cookie_dir': './cookies/xiaohongshu_uploader'
            },
            'kuaishou': {
                'name': '快手',
                'setup_func': ks_setup,
                'video_class': KSVideo,
                'cookie_auth_func': ks_cookie_auth,
                'cookie_dir': './cookies/ks_uploader'
            }
        }
        
        # 确保cookie目录存在
        for platform_config in self.platform_configs.values():
            os.makedirs(platform_config['cookie_dir'], exist_ok=True)

service_state = ServiceState()

# ==================== 辅助函数 ====================

def get_cookie_file_path(account_id: str, platform: str) -> str:
    """获取cookie文件路径"""
    platform_config = service_state.platform_configs.get(platform)
    if not platform_config:
        raise ValueError(f"Unsupported platform: {platform}")
    
    cookie_dir = platform_config['cookie_dir']
    return os.path.join(cookie_dir, f"{account_id}.json")

async def run_in_background(coro):
    """在后台运行协程"""
    try:
        return await coro
    except Exception as e:
        print(f"Background task failed: {e}")
        return None

# ==================== API路由 ====================

@app.get("/health")
async def health_check():
    """健康检查"""
    return ApiResponse(
        success=True,
        data={
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "supported_platforms": list(service_state.platform_configs.keys())
        }
    )

@app.get("/platforms")
async def get_platforms():
    """获取支持的平台列表"""
    platforms = []
    for platform_id, config in service_state.platform_configs.items():
        platforms.append({
            "id": platform_id,
            "name": config["name"],
            "cookie_dir": config["cookie_dir"]
        })
    
    return ApiResponse(success=True, data={"platforms": platforms})

@app.post("/login/start")
async def start_login(request: LoginRequest, background_tasks: BackgroundTasks):
    """开始登录流程"""
    try:
        platform_config = service_state.platform_configs.get(request.platform)
        if not platform_config:
            raise HTTPException(status_code=400, detail=f"Unsupported platform: {request.platform}")
        
        # 创建登录会话
        session_id = str(uuid.uuid4())
        session = LoginSession(
            session_id=session_id,
            account_id=request.account_id,
            platform=request.platform,
            status="pending",
            start_time=datetime.now()
        )
        
        service_state.active_sessions[session_id] = session
        
        # 获取cookie文件路径
        cookie_file = get_cookie_file_path(request.account_id, request.platform)
        
        # 在后台启动登录流程
        background_tasks.add_task(
            execute_login_flow,
            session_id,
            platform_config,
            cookie_file
        )
        
        return ApiResponse(
            success=True,
            data={"session_id": session_id},
            message=f"Login flow started for {request.account_id}@{request.platform}"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def execute_login_flow(session_id: str, platform_config: dict, cookie_file: str):
    """执行登录流程（后台任务）"""
    session = service_state.active_sessions.get(session_id)
    if not session:
        return
    
    try:
        # 更新状态为等待用户操作
        session.status = "waiting_user"
        
        # 调用原有的setup函数，这会打开浏览器等待用户登录
        setup_func = platform_config['setup_func']
        success = await setup_func(cookie_file, handle=True)
        
        if success:
            session.status = "completed"
            session.end_time = datetime.now()
        else:
            session.status = "failed"
            session.error_message = "Login setup failed"
            session.end_time = datetime.now()
            
    except Exception as e:
        session.status = "failed"
        session.error_message = str(e)
        session.end_time = datetime.now()

@app.get("/login/status/{session_id}")
async def get_login_status(session_id: str):
    """获取登录状态"""
    session = service_state.active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return ApiResponse(
        success=True,
        data={
            "session": {
                "session_id": session.session_id,
                "account_id": session.account_id,
                "platform": session.platform,
                "status": session.status,
                "start_time": session.start_time.isoformat(),
                "end_time": session.end_time.isoformat() if session.end_time else None,
                "error_message": session.error_message
            }
        }
    )

@app.post("/login/cancel/{session_id}")
async def cancel_login(session_id: str):
    """取消登录流程"""
    session = service_state.active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.status = "failed"
    session.error_message = "Cancelled by user"
    session.end_time = datetime.now()
    
    return ApiResponse(success=True, message="Login cancelled")

@app.post("/cookie/validate")
async def validate_cookie(request: CookieValidationRequest):
    """验证cookie是否有效"""
    try:
        platform_config = service_state.platform_configs.get(request.platform)
        if not platform_config:
            raise HTTPException(status_code=400, detail=f"Unsupported platform: {request.platform}")
        
        cookie_file = get_cookie_file_path(request.account_id, request.platform)
        
        if not os.path.exists(cookie_file):
            return ApiResponse(
                success=True,
                data={"is_valid": False, "reason": "Cookie file not found"}
            )
        
        # 调用对应平台的cookie验证函数
        cookie_auth_func = platform_config['cookie_auth_func']
        is_valid = await cookie_auth_func(cookie_file)
        
        return ApiResponse(
            success=True,
            data={
                "is_valid": is_valid,
                "account_id": request.account_id,
                "platform": request.platform,
                "cookie_file": cookie_file
            }
        )
        
    except Exception as e:
        return ApiResponse(
            success=False,
            error=str(e)
        )

@app.post("/cookie/delete")
async def delete_cookie(request: CookieValidationRequest):
    """删除cookie文件"""
    try:
        cookie_file = get_cookie_file_path(request.account_id, request.platform)
        
        if os.path.exists(cookie_file):
            os.remove(cookie_file)
            return ApiResponse(
                success=True,
                message=f"Cookie deleted for {request.account_id}@{request.platform}"
            )
        else:
            return ApiResponse(
                success=True,
                message="Cookie file not found"
            )
            
    except Exception as e:
        return ApiResponse(
            success=False,
            error=str(e)
        )

@app.post("/upload")
async def upload_video(request: UploadRequest, background_tasks: BackgroundTasks):
    """上传视频"""
    try:
        platform_config = service_state.platform_configs.get(request.platform)
        if not platform_config:
            raise HTTPException(status_code=400, detail=f"Unsupported platform: {request.platform}")
        
        cookie_file = get_cookie_file_path(request.account_id, request.platform)
        
        if not os.path.exists(cookie_file):
            raise HTTPException(status_code=400, detail="Cookie file not found. Please login first.")
        
        if not os.path.exists(request.video_file):
            raise HTTPException(status_code=400, detail="Video file not found")
        
        # 创建上传任务ID
        task_id = str(uuid.uuid4())
        
        # 在后台执行上传
        background_tasks.add_task(
            execute_upload_task,
            task_id,
            request,
            platform_config,
            cookie_file
        )
        
        return ApiResponse(
            success=True,
            data={"task_id": task_id},
            message=f"Upload task started for {request.account_id}@{request.platform}"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def execute_upload_task(task_id: str, request: UploadRequest, platform_config: dict, cookie_file: str):
    """执行上传任务（后台任务）"""
    try:
        # 解析发布时间
        publish_date = 0  # 立即发布
        if request.publish_time:
            try:
                publish_date = datetime.fromisoformat(request.publish_time)
            except:
                publish_date = 0
        
        # 创建视频上传实例
        video_class = platform_config['video_class']
        
        if request.platform == 'wechat':
            # 微信视频号需要特殊处理
            video_instance = video_class(
                title=request.title,
                file_path=request.video_file,
                tags=request.tags,
                publish_date=publish_date,
                account_file=cookie_file,
                category=None  # 可以根据需要设置分类
            )
        else:
            # 其他平台
            video_instance = video_class(
                title=request.title,
                file_path=request.video_file,
                tags=request.tags,
                publish_date=publish_date,
                account_file=cookie_file
            )
        
        # 执行上传
        await video_instance.main()
        
        print(f"Upload task {task_id} completed successfully")
        
    except Exception as e:
        print(f"Upload task {task_id} failed: {e}")

@app.get("/sessions")
async def get_active_sessions():
    """获取活跃的登录会话"""
    sessions = []
    for session in service_state.active_sessions.values():
        sessions.append({
            "session_id": session.session_id,
            "account_id": session.account_id,
            "platform": session.platform,
            "status": session.status,
            "start_time": session.start_time.isoformat(),
            "end_time": session.end_time.isoformat() if session.end_time else None
        })
    
    return ApiResponse(
        success=True,
        data={"sessions": sessions, "count": len(sessions)}
    )

@app.delete("/sessions/cleanup")
async def cleanup_sessions():
    """清理已完成的会话"""
    completed_sessions = [
        session_id for session_id, session in service_state.active_sessions.items()
        if session.status in ["completed", "failed"]
    ]
    
    for session_id in completed_sessions:
        del service_state.active_sessions[session_id]
    
    return ApiResponse(
        success=True,
        data={"cleaned_count": len(completed_sessions)},
        message=f"Cleaned up {len(completed_sessions)} completed sessions"
    )

# ==================== 批量操作 ====================

@app.post("/batch/login")
async def batch_login(request: dict, background_tasks: BackgroundTasks):
    """批量登录"""
    account_ids = request.get("account_ids", [])
    platform = request.get("platform")
    
    if not account_ids or not platform:
        raise HTTPException(status_code=400, detail="account_ids and platform are required")
    
    session_ids = []
    for account_id in account_ids:
        login_request = LoginRequest(account_id=account_id, platform=platform)
        response = await start_login(login_request, background_tasks)
        if response.success:
            session_ids.append(response.data["session_id"])
    
    return ApiResponse(
        success=True,
        data={"session_ids": session_ids, "count": len(session_ids)}
    )

@app.post("/batch/validate")
async def batch_validate_cookies(request: dict):
    """批量验证cookie"""
    account_ids = request.get("account_ids", [])
    platform = request.get("platform")
    
    if not account_ids or not platform:
        raise HTTPException(status_code=400, detail="account_ids and platform are required")
    
    results = []
    for account_id in account_ids:
        validation_request = CookieValidationRequest(
            account_id=account_id,
            platform=platform,
            cookie_file=""  # 会在函数内部计算
        )
        
        try:
            response = await validate_cookie(validation_request)
            results.append({
                "account_id": account_id,
                "is_valid": response.data.get("is_valid", False) if response.success else False,
                "error": response.error if not response.success else None
            })
        except Exception as e:
            results.append({
                "account_id": account_id,
                "is_valid": False,
                "error": str(e)
            })
    
    return ApiResponse(
        success=True,
        data={"results": results, "count": len(results)}
    )

# ==================== 启动服务 ====================

if __name__ == "__main__":
    uvicorn.run(
        "automation_service:app",
        host="127.0.0.1",
        port=5678,
        reload=True,
        log_level="info"
    )