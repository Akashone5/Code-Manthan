@echo off
title RinDristi FairLend - Credit Decision Server
echo ========================================================
echo   RINDRISTI FAIRLEND - CREDIT UNDERWRITING API
echo   Starting Production FastAPI REST Server...
echo   Runtime: Python 3.11
echo   Swagger UI: http://localhost:5000/docs
echo   Web Client: http://localhost:5000
echo ========================================================
echo.

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    "%LocalAppData%\Programs\Python\Python311\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 5000 --reload
) else (
    uvicorn main:app --host 0.0.0.0 --port 5000 --reload
)
pause
