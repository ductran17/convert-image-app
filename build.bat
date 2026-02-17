@echo off
echo ========================================
echo Building Image Converter...
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Clean previous build
echo Cleaning previous build...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist

REM Build the exe
echo Building executable...
pyinstaller image_converter.spec

echo.
echo ========================================
if exist "dist\ImageConverter.exe" (
    echo Build successful!
    echo Executable location: dist\ImageConverter.exe
) else (
    echo Build failed! Check the output above for errors.
)
echo ========================================

pause
