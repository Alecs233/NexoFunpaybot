@echo off
title NexoBot FunPay Monitor

echo =========================================
echo        NexoBot FunPay Monitor
echo =========================================
echo.

if not exist node_modules (
    echo Dependentele nu sunt instalate.
    echo Ruleaza mai intai: npm install
    pause
    exit /b 1
)

if not exist .env (
    echo Fisierul .env lipseste.
    echo Copiaza .env.example in .env si completeaza webhook-ul.
    pause
    exit /b 1
)

node src/index.js

echo.
echo Botul s-a oprit.
pause
