# No necesitas cambiar permanentemente la política de ejecución de PowerShell.
$ErrorActionPreference = 'Stop'
$ManageScript = Join-Path $PSScriptRoot 'manage.py'
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $ManageScript @args
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python $ManageScript @args
} else {
    throw 'Instala Python 3.12+ antes de ejecutar este script.'
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
