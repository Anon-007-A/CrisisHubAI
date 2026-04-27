# Aegis CrisisHub — Start All Services

Write-Host "🚀 Starting Aegis CrisisHub services..." -ForegroundColor Cyan

# 1. Start Backend
Write-Host " Starting Backend (FastAPI)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command 'cd backend; .\venv\Scripts\python -m uvicorn main:app --reload --port 8000'"

# 2. Wait for backend to initialize
Write-Host "⏳ Waiting for backend to warm up..."
Start-Sleep -Seconds 2

# 3. Start Frontend
Write-Host " Starting Frontend (Vite)..." -ForegroundColor Green
Set-Location frontend
npm run dev
