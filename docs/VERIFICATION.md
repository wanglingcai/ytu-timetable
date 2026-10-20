# 验证记录

验证日期：2026-10-20（Asia/Shanghai）。初版使用自造模拟课表；另在本机核对过一份图片型 PDF，经人工转换后验证了 CSV 导入。个人数据和专用核对记录不上传 GitHub。

## 0.1.2 更名检查

软件显示名称由“烟大随课”更名为“下节啥课”，页面标题、页眉页脚、备份文件名与错误提示同步更新。安装包为 `deliverables/next-class-0.1.2-debug.apk`，已核对 APK 的应用标签为“下节啥课”、版本号 0.1.2、versionCode 3。

应用 ID、签名、私有文件名、浏览器存储键和 JSON schemaVersion 均保持原值。从已保存课表的 0.1.1 模拟器覆盖安装 0.1.2 后，4 项升级检查通过；安装前后私有课表文件内容完全一致。5 项通用手机尺寸浏览器测试通过，截图已同步为新名称。构建与 Lint 通过。

## 交付状态

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| 可安装的安卓应用 | debug APK 已生成，Android 15 模拟器安装成功，APK v2 签名验证通过 | 已验证 |
| Excel / CSV / HTML 文件导入 | 实际生成并读取模拟 XLSX、二进制 XLS、HTML、UTF-8 CSV 文件；浏览器文件选择测试通过 | 已验证这些示例 |
| 原生系统文件导入 | 模拟器通过系统 Downloads 文件选择器选择 `ytu-example.xlsx`，预览 5 条课程，确认后私有文件保存 5 条 | 已验证 |
| 周次切换 | 自动测试连续周、单双周、指定周和离散周；安卓第 2 周仅双周课、第 3 周含指定周课 | 已验证 |
| 手机本地保存并直接查看 | `AtomicFile` 写入私有文件；Activity 销毁重建恢复；强制停止进程后冷启动仍显示课程 | 已验证模拟器 |
| 备份恢复 | 浏览器下载 JSON 再导入，包含课程修改和设置；原生系统保存选择器导出 JSON，实际文件含完整 5 条课程 | 已验证 |
| 无广告、无运行时联网依赖 | APK 权限清单无申请权限，随包脚本无远程加载；网络请求测试无外部请求 | 已验证当前 APK |
| 一份实际图片型 PDF 的转换文件 | 本机人工核对后转换 CSV，通过实际导入界面保存、周次筛选和刷新恢复测试；原文件与个人课表不随仓库分发 | **本次转换文件已验证；直接 PDF 导入未实现** |
| 用户实体安卓手机 | 未连接设备 | **未验证** |

## 自动测试

### 解析、日期与数据校验：17 项通过

```powershell
npm.cmd test
```

覆盖周次、无效输入、星期节次、URP 单元格、同一单元格多条课程、清单表头、重复去重、合并单元格、偏移工作表范围、真实格式的模拟文件读取、跨年日期、时间冲突、冲突链布局、备份结构和设置校验。

0.1.1 新增非本周课程的视图标记、原数据不变、同一时段本周/非本周卡片上下排列与本周优先、单双周不误报冲突的校验。

### 手机尺寸浏览器测试：仓库通用测试 5 项通过

```powershell
npm.cmd run test:ui
```

使用 Edge，视口 393 × 852，中文环境，Asia/Shanghai 时区。覆盖空态、选择文件、导入预览确认、周次筛选、刷新恢复、列表与详情、各格式导入、设置校验、手动修改、JSON 下载恢复、坏文件不覆盖原数据、文本安全和无外部请求。

0.1.1 新增对灰色实际样式、非本周课程可点击、上下卡片不遮挡、本周计数不包含灰色安排、列表灰色状态、无课周仍保留参考安排的测试。截图已人工查看。

此外，本机针对一份实际 PDF 转换文件的专用导入测试已通过，并已更新为区分本周与非本周卡片。该测试和输入文件保留在本机，不列入仓库可复现的通用测试；克隆仓库后运行测试不需要个人文件。

### Android 原生 Instrumentation：10 项通过，覆盖安装检查 4 项通过

使用 Android 15（API 35）、x86_64、Pixel 6 模拟器和系统 WebView。测试验证首次空态、原生流读取 CSV、私有目录写入、单双/指定周、非本周灰色卡片与详情标记、Activity 重建恢复、详情对话框和手机布局。

另从 0.1.0 覆盖安装 0.1.1，确认原有 5 条模拟课程加载成功、私有课表文件内容逐字节不变、灰色参考安排正常显示且可点击。覆盖安装测试在常规测试清空专用模拟器数据之前执行。

以下命令仅用于无真实数据的专用模拟器（示例序列号 `emulator-5554`）。`pm clear` 会清空该模拟器上本应用的数据，禁止直接照搬到已有真实课表的手机。

```powershell
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
$taskAdb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
& $taskAdb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
& $taskAdb -s emulator-5554 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
& $taskAdb -s emulator-5554 shell pm clear cn.ytu.timetable.personal
& $taskAdb -s emulator-5554 shell am instrument -w cn.ytu.timetable.personal.test/cn.ytu.timetable.SmokeInstrumentation
```

成功输出：`PASS: 10 Android checks`。覆盖安装后可额外执行 `adb shell am instrument -w -e verifyExisting true cn.ytu.timetable.personal.test/cn.ytu.timetable.SmokeInstrumentation`，成功输出 `PASS: 4 Android upgrade checks`，要求模拟器已保存含非本周安排的课表，不能先清空数据。此自定义 Instrumentation 不依赖 JUnit/AndroidX Test，不使用 `connectedDebugAndroidTest` 的 JUnit 结果发现机制。

## 构建与交付检查

- 已实际运行 `scripts/build.ps1`，Gradle Wrapper 9.1.0 构建和 `lintDebug` 通过。
- Lint 无错误；保留 1 条 `OldTargetApi` 提醒：当前 compile SDK 36、target SDK 35，Android 16 行为尚未完整测试。
- 已核对 APK 签名、权限清单和交付文件 SHA-256。当前校验值以 `deliverables/SHA256SUMS.txt` 为准；任何代码或打包变化后应重新生成。
- 已视觉检查手机浏览器周视图、空态、安卓原生周视图和原生导入预览；没有横向页面溢出。手机网格较窄，长课程名称通过详情/列表查看。
- 已使用模拟器的系统文件选择器完整导入 XLSX，随后用系统保存位置选择器导出 JSON，拉取文件确认 5 条记录、学期起始日期与来源名称保留。

界面截图（均为模拟数据）：

- [首次打开空态](empty-phone.png)
- [周视图](schedule-phone.png)
- [安卓原生文件导入预览（初版历史截图）](android-import-preview.png)
- [非本周课程灰色显示（当前名称）](inactive-courses-phone.png)

## PDF 后续范围

实际图片型 PDF 可在人工识别、核对并转换为 CSV 后导入现有 APK。直接选择 PDF 自动导入、安卓端自动 OCR，以及用户实体手机上的实际体验仍未验证或实现，不用一次转换结果声称这些功能已经完成。
