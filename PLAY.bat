@echo off
setlocal
title AdventureForge Launcher
pushd "%~dp0" >nul || (
  echo.
  echo   Could not open the AdventureForge folder.
  echo.
  pause
  exit /b 1
)

rem One-click launcher: rebuilds the game from the current code, then opens
rem the self-contained ui\dist\index.html in the default browser. No terminal
rem knowledge needed - double-click this file to play.

where node >nul 2>nul
if errorlevel 1 goto :nodefail

set "NODE_MAJOR="
for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto :nodefail
if %NODE_MAJOR% LSS 22 goto :nodefail

echo Checking engine dependencies...
call npm ls --depth=0 >nul 2>nul
if errorlevel 1 (
  echo Installing engine dependencies. This may take a minute...
  call npm ci --no-audit --no-fund || goto :fail
)
echo Checking UI dependencies...
call npm --prefix ui ls --depth=0 >nul 2>nul
if errorlevel 1 (
  echo Installing UI dependencies. This may take a minute...
  call npm --prefix ui ci --no-audit --no-fund || goto :fail
)

echo Building the current version of the game...
call npm run ui:build || goto :buildfail

rem Internal smoke mode verifies the full launcher path without opening a browser.
if /i "%ADVENTUREFORGE_BUILD_ONLY%"=="1" (
  popd
  exit /b 0
)

popd
start "" "%~dp0ui\dist\index.html"
exit /b 0

:buildfail
echo.
echo   The game was not opened because the current build failed.
echo   Fix the error above, then run PLAY.bat again.
goto :failpause

:nodefail
echo.
echo   Node.js 22 or newer is required but was not found.
echo   Install it from https://nodejs.org and run PLAY.bat again.
goto :failpause

:fail
echo.
echo   Something went wrong - see the messages above.

:failpause
popd >nul 2>nul
echo.
pause
exit /b 1
