$f = 'd:\FASHIONFIT AI\src\components\Mannequin3DView.tsx'
$lines = Get-Content $f
$keep = $lines[0..258] + @('') + $lines[700..($lines.Length-1)]
$keep | Set-Content $f -Encoding UTF8
Write-Host "Done. New line count: $($keep.Length)"
