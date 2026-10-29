@echo off
title "Meridian Mission Bharat - Database Viewer and Exporter"
echo ========================================================
echo   MERIDIAN FAIRLEND AI - MISSION BHARAT
echo   Central Loan Application Database Viewer
echo ========================================================
echo.

set PYTHONHOME=C:\Program Files\MySQL\MySQL Workbench 8.0\python
"C:\Program Files\MySQL\MySQL Workbench 8.0\python.exe" "%~dp0view_db.py"

echo.
echo ========================================================
echo Opening exported CSV in Excel or Default Viewer...
echo (If you want to view the file directly, it is saved at:)
echo "%~dp0meridian_loan_applications_export.csv"
echo ========================================================
pause
