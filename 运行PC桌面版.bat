@echo off
chcp 65001 >nul
pushd "%~dp0"
echo 极客工具箱 - 从当前源码构建并启动 Windows 桌面窗口
call npm run electron:dev
popd
pause
