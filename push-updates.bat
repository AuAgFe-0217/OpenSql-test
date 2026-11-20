@echo off
setlocal
cd /d "%~dp0"

set "GIT_EXE="
for /f "delims=" %%G in ('where git 2^>nul') do if not defined GIT_EXE set "GIT_EXE=%%G"
if not defined GIT_EXE if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT_EXE=%ProgramFiles%\Git\cmd\git.exe"
if not defined GIT_EXE if exist "%LocalAppData%\Programs\Git\cmd\git.exe" set "GIT_EXE=%LocalAppData%\Programs\Git\cmd\git.exe"
if not defined GIT_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe" set "GIT_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"

if not defined GIT_EXE (
  echo Git was not found on this computer.
  echo Install Git for Windows from https://git-scm.com/download/win, then reopen this file.
  pause
  exit /b 1
)

for %%I in ("%GIT_EXE%") do set "GIT_BIN_DIR=%%~dpI"
set "PATH=%GIT_BIN_DIR%;%GIT_BIN_DIR%..\..\mingw64\bin;%GIT_BIN_DIR%..\..\usr\bin;%PATH%"

echo Checking Git status...
"%GIT_EXE%" status --short
if errorlevel 1 goto git_error

set "HAS_CHANGES="
for /f "delims=" %%A in ('"%GIT_EXE%" status --porcelain') do set "HAS_CHANGES=1"
if not defined HAS_CHANGES (
  echo.
  echo No changes to commit.
  pause
  exit /b 0
)

echo.
set /p COMMIT_MSG=Enter commit message: 
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Update Open SQL Lab"

echo.
echo Staging changes...
"%GIT_EXE%" add -A
if errorlevel 1 goto git_error

"%GIT_EXE%" diff --cached --quiet
if not errorlevel 1 (
  echo No staged changes to commit.
  pause
  exit /b 0
)

"%GIT_EXE%" commit -m "%COMMIT_MSG%"
if errorlevel 1 goto git_error

echo.
echo Pushing to origin main...
"%GIT_EXE%" push origin main
if errorlevel 1 goto git_error

echo.
echo Push complete. GitHub Pages will update automatically.
pause
exit /b 0

:git_error
echo.
echo Git command failed. Check the message above and try again.
pause
exit /b 1

