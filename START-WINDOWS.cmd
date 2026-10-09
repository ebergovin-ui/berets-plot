@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 LTS from https://nodejs.org/ then run this file again.
 pause
 exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<12)){console.error('Node.js 22.12 or newer is required.');process.exit(1)}"
if errorlevel 1 goto failed
if not exist node_modules\express\package.json (
 if exist dist\index.html (call npm ci --omit=dev) else (call npm ci)
 if errorlevel 1 goto failed
)
if not exist dist\index.html (
 call npm run build
 if errorlevel 1 goto failed
)
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo BERETS Plot could not start. See the error above.
pause
exit /b 1
