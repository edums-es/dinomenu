# EG Delivery Print Link PY

Aplicativo local em Python puro para impressao automatica.

- Sem Electron.
- Sem instalador.
- Sem dependencias no runtime.
- Interface HTML local em `127.0.0.1`, aberta automaticamente no navegador.
- Impressao via PowerShell `Out-Printer`.
- Configuracao em `%APPDATA%\EG Delivery Print Link PY\config.json`.

## Gerar executavel

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install pyinstaller
.\.venv\Scripts\pyinstaller.exe --clean --onefile --noconsole --name "EG Delivery Print Link PY 1.0.0" --distpath dist --workpath build --specpath . eg_print_link_py.py
```

Saida:

```text
print-agent-python/dist/EG Delivery Print Link PY 1.0.0.exe
```
