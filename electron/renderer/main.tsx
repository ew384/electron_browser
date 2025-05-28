/**
 * React应用入口文件
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 开发环境错误边界
if (process.env.NODE_ENV === 'development') {
  // 可以添加错误报告工具
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);