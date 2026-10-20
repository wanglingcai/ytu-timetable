param([string]$SdkPath, [string]$JavaPath)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    if ($JavaPath) { $env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaPath).Path }
    if (-not $SdkPath) { $SdkPath = $env:ANDROID_HOME }
    if (-not $SdkPath) { $SdkPath = $env:ANDROID_SDK_ROOT }
    if (-not $SdkPath -and (Test-Path -LiteralPath '.tools\android-sdk')) { $SdkPath = Join-Path $taskRoot '.tools\android-sdk' }
    if ($SdkPath) {
        $taskSdkResolved = (Resolve-Path -LiteralPath $SdkPath).Path.Replace('\','/').Replace(':','\:')
        Set-Content -LiteralPath 'local.properties' -Value ('sdk.dir=' + $taskSdkResolved) -Encoding ascii
    }
    if (-not (Test-Path -LiteralPath 'local.properties')) { throw '请安装 Android SDK，并通过 -SdkPath 参数或 ANDROID_HOME 指定位置。' }
    & '.\gradlew.bat' ':app:assembleDebug' ':app:lintDebug' '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw 'Android 构建或 Lint 检查失败。' }
    New-Item -ItemType Directory -Path 'deliverables' -Force | Out-Null
    Copy-Item -LiteralPath 'app\build\outputs\apk\debug\app-debug.apk' -Destination 'deliverables\ytu-timetable-0.1.0-debug.apk' -Force
    $taskApkHash = (Get-FileHash -LiteralPath 'deliverables\ytu-timetable-0.1.0-debug.apk' -Algorithm SHA256).Hash.ToLower()
    Set-Content -LiteralPath 'deliverables\SHA256SUMS.txt' -Value ($taskApkHash+'  ytu-timetable-0.1.0-debug.apk') -Encoding ascii
    Write-Output ('安装包：' + (Join-Path $taskRoot 'deliverables\ytu-timetable-0.1.0-debug.apk'))
} finally { Pop-Location }
