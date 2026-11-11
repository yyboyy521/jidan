@echo off
rem One-click deploy launcher for Windows double-click.
rem Keeps ASCII-only to avoid codepage garbling.
setlocal
set "SCRIPT_DIR=%~dp0"

rem -- find bash.exe that ships next to git.exe --
set "BASH_EXE="
for /f "delims=" %%i in ('where git 2^>nul') do (
  if not defined BASH_EXE (
    for %%j in ("%%~dpi..\usr\bin\bash.exe") do (
      if exist "%%~fj" set "BASH_EXE=%%~fj"
    )
  )
)

rem -- fallback: WorkBuddy portable git --
if not defined BASH_EXE (
  if exist "D:\workbuddy\resources\vendor\PortableGit\usr\bin\bash.exe" set "BASH_EXE=D:\workbuddy\resources\vendor\PortableGit\usr\bin\bash.exe"
)

if not defined BASH_EXE (
  echo [ERROR] bash.exe not found. Please run deploy.sh inside Git Bash manually.
  pause
  exit /b 1
)

"%BASH_EXE%" "%SCRIPT_DIR%deploy.sh" %*
pause
