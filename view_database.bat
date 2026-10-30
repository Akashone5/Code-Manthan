@echo off
title Meridian Mission Bharat - Database Viewer and Exporter
echo ========================================================
echo   MERIDIAN FAIRLEND AI - MISSION BHARAT
echo   Central Loan Application Database Viewer
echo   Runtime: Python 3.11
echo ========================================================
echo.

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    "%LocalAppData%\Programs\Python\Python311\python.exe" "%~dp0view_db.py"
) else (
    python "%~dp0view_db.py"
)

echo.
echo ========================================================
echo Opening exported CSV in Excel or Default Viewer...
start "" "%~dp0meridian_loan_applications_export.csv"
echo ========================================================
pause
