param(
    [string]$SdkPath,
    [string]$JavaPath,
    [switch]$Release
)
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

    $taskGradleTask = ':app:assembleDebug'
    $taskVariant = 'debug'
    if ($Release) {
        if (-not (Test-Path -LiteralPath 'keystore.properties')) {
            throw '发布构建需要 keystore.properties；请复制 keystore.properties.example 并填写本机签名信息。不要提交该文件或 .jks 密钥。'
        }
        $taskGradleTask = ':app:assembleRelease'
        $taskVariant = 'release'
    }

    $taskVersion = [regex]::Match((Get-Content -LiteralPath 'app\build.gradle' -Raw), "versionName\s+'([0-9]+\.[0-9]+\.[0-9]+)'").Groups[1].Value
    if (-not $taskVersion) { throw '无法读取应用版本号。' }
    & '.\gradlew.bat' $taskGradleTask ':app:lintDebug' '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw 'Android 构建或 Lint 检查失败。' }

    New-Item -ItemType Directory -Path 'dist' -Force | Out-Null
    $taskApkName = 'next-class-'+$taskVersion+'-'+$taskVariant+'.apk'
    Copy-Item -LiteralPath ('app\build\outputs\apk\'+$taskVariant+'\app-'+$taskVariant+'.apk') -Destination (Join-Path 'dist' $taskApkName) -Force
    $taskChecksum = (Get-FileHash -LiteralPath (Join-Path 'dist' $taskApkName) -Algorithm SHA256).Hash.ToLower()+'  '+$taskApkName
    Set-Content -LiteralPath 'dist\SHA256SUMS.txt' -Value $taskChecksum -Encoding ascii
    Write-Output ('安装包：' + (Join-Path $taskRoot ('dist\'+$taskApkName)))
} finally { Pop-Location }
