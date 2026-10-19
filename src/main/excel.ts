import { spawn } from 'node:child_process'
import { shell } from 'electron'
import { log } from './log'

/**
 * PowerShell (Windows PowerShell 5.1, always present on Windows 10/11) script that opens the
 * workbook in Excel through COM and selects the row. Values arrive through environment
 * variables, so nothing from the file name is ever interpreted as code.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$path = $env:FF_PATH; $sheet = $env:FF_SHEET; $row = [int]$env:FF_ROW
try { $xl = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application') }
catch { $xl = New-Object -ComObject Excel.Application }
$xl.Visible = $true
$wb = $null
foreach ($w in $xl.Workbooks) { if ($w.FullName -eq $path) { $wb = $w } }
if ($wb -eq $null) { $wb = $xl.Workbooks.Open($path) }
$ws = $wb.Worksheets.Item($sheet)
$ws.Activate()
$ws.Rows($row).Select() | Out-Null
$xl.ActiveWindow.ScrollRow = [Math]::Max(1, $row - 3)
$xl.WindowState = -4137
Add-Type -Namespace FF -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);'
[FF.Win]::SetForegroundWindow([System.IntPtr]$xl.Hwnd) | Out-Null
`

function runPowerShell(env: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { env: { ...process.env, ...env }, windowsHide: true }
    )
    let err = ''
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    const timer = setTimeout(() => {
      child.kill()
      resolve(false)
    }, 25_000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) log.warn('open in Excel via COM failed', err.trim().slice(0, 500))
      resolve(code === 0)
    })
  })
}

/** Open the file in Excel at the given sheet/row when possible, else just open the file. */
export async function openInExcel(filePath: string, sheet: string, row: number): Promise<'selected' | 'opened' | 'failed'> {
  const isCsv = filePath.toLowerCase().endsWith('.csv')
  if (process.platform === 'win32' && !isCsv) {
    const ok = await runPowerShell({ FF_PATH: filePath, FF_SHEET: sheet, FF_ROW: String(row) })
    if (ok) return 'selected'
  }
  const err = await shell.openPath(filePath)
  if (err) {
    log.warn('openPath failed', filePath, err)
    return 'failed'
  }
  return 'opened'
}
