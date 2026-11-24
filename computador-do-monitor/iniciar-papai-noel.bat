@echo off
rem Abre o Papai Noel em tela cheia no Microsoft Edge, ja com camera, microfone e voz liberados.
rem Troque o endereco abaixo pelo endereco da pagina no seu site.
set ENDERECO=https://seusite.com.br/papai-noel.html

rem Fecha o Edge se estiver aberto, para os ajustes valerem
taskkill /IM msedge.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE% set EDGE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

start "" %EDGE% --kiosk %ENDERECO% --edge-kiosk-type=fullscreen --no-first-run --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream
