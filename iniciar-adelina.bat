@echo off
chcp 65001 >nul
title Adelina PMS - Dev Server

cd /d "%~dp0"

echo ================================================
echo   Adelina PMS - iniciando servidor de desenvolvimento
echo ================================================
echo.
echo   Web:  http://localhost:3000
echo   API:  http://localhost:3333/api
echo   Docs: http://localhost:3333/api/docs
echo.
echo   O navegador abrira em ~12 segundos.
echo   Para parar, feche esta janela ou pressione Ctrl+C.
echo.
echo ================================================
echo.

REM Abre o navegador em paralelo apos 12s (tempo do dev server subir)
start "" /B cmd /c "timeout /t 12 /nobreak >nul && start http://localhost:3000"

REM Roda o dev (API + Web em paralelo via pnpm)
call pnpm dev

REM Se o pnpm dev sair, pausa pra mostrar erro
echo.
echo ================================================
echo   Servidor parado.
echo ================================================
pause
