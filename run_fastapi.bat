@echo off
title Meridian FairLend - FastAPI REST Server
echo ========================================================
echo   MERIDIAN FAIRLEND - CREDIT DECISION SYSTEM
echo   Starting Production FastAPI Server...
echo   Runtime: Python 3.11
echo   Swagger UI: http://localhost:5000/docs
echo   ReDoc Spec: http://localhost:5000/redoc
echo   Web Client: http://localhost:5000
echo ========================================================
echo.

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
    "%LocalAppData%\Programs\Python\Python311\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 5000 --reload
) else (
    uvicorn main:app --host 0.0.0.0 --port 5000 --reload
)
pause
