@echo off
echo DGUV V3 Pruefprotokoll wird gestartet...

:: Server im Hintergrund starten
start "DGUV Server" /MIN node "%~dp0server.js"

:: Kurz warten bis Server bereit ist
timeout /t 2 /nobreak >nul

:: Browser oeffnen
start http://localhost:3000
