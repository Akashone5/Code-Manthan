@echo off
title Meridian Mission Bharat Backend Server
echo ========================================================
echo   MERIDIAN FAIRLEND AI - MISSION BHARAT
echo   Starting Explainable Loan Decision Backend Server...
echo   Runtime: Python 3.11
echo ========================================================
echo.

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    "%LocalAppData%\Programs\Python\Python311\python.exe" server.py
) else (
    python server.py
)
pause
