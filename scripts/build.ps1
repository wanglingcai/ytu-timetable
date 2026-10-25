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
    if (-not (Test-Path -LiteralPath 'local.properties')) { throw 'Android SDK is required. Pass -SdkPath or set ANDROID_HOME.' }

    $taskGradleTask = ':app:assembleDebug'
    $taskVariant = 'debug'
    if ($Release) {
        if (-not (Test-Path -LiteralPath 'keystore.properties')) {
            throw 'Release build requires keystore.properties. Copy the example and fill in local signing values.'
        }
        $taskGradleTask = ':app:assembleRelease'
        $taskVariant = 'release'
    }

    $taskVersion = [regex]::Match((Get-Content -LiteralPath 'app\build.gradle' -Raw), "versionName\s+'([0-9]+\.[0-9]+\.[0-9]+)'").Groups[1].Value
    if (-not $taskVersion) { throw 'Unable to read versionName from app/build.gradle.' }
    & '.\gradlew.bat' $taskGradleTask ':app:lintDebug' '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }

    New-Item -ItemType Directory -Path 'dist' -Force | Out-Null
    $taskApkName = 'next-class-'+$taskVersion+'-'+$taskVariant+'.apk'
    Copy-Item -LiteralPath ('app\build\outputs\apk\'+$taskVariant+'\app-'+$taskVariant+'.apk') -Destination (Join-Path 'dist' $taskApkName) -Force
    $taskChecksum = (Get-FileHash -LiteralPath (Join-Path 'dist' $taskApkName) -Algorithm SHA256).Hash.ToLower()+'  '+$taskApkName
    Set-Content -LiteralPath 'dist\SHA256SUMS.txt' -Value $taskChecksum -Encoding ascii
    Write-Output ('APK: ' + (Join-Path $taskRoot ('dist\'+$taskApkName)))
} finally { Pop-Location }
