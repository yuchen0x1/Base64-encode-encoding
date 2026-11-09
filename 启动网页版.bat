@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================================
echo   极客工具箱 - 网页版更新服务器
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本。
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo [1/2] 未找到构建产物，正在执行构建...
  call npm run build
  if errorlevel 1 (
    echo [错误] 构建失败，请检查上方日志。
    pause
    exit /b 1
  )
) else (
  echo [1/2] 检测到 dist 构建产物
)

echo [2/2] 启动本地服务器...
echo.
echo   本机访问:   http://127.0.0.1:4173/
echo   更新源目录: updates\web
echo   停止服务:   在本窗口按 Ctrl+C
echo.
echo   提示: 将新版本的 version.json 与 zip 放入 updates\web
echo         即可在页面中点击版本号检查并一键更新。
echo.

node server\serve.js --root dist --feed updates\web
pause
