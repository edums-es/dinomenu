$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = if ($env:PYTHON) { $env:PYTHON } else { "python" }

Push-Location $Root
try {
    & $Python -m pip install -r requirements-build.txt
    & $Python -m PyInstaller `
        --noconfirm `
        --clean `
        --windowed `
        --onefile `
        --name "EG-Delivery-Print-Agent" `
        app.py
} finally {
    Pop-Location
}
