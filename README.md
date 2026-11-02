# 下节啥课

一款简洁的 Android 课表应用。它帮助学生快速查看下一节课和每周安排，不需要注册应用账号，也没有广告；课表和个人安排保存在手机本地，导入后可以离线查看。

项目最初为烟台大学开发，现支持通用文件导入，并尝试适配其他高校的教务系统。**本项目不是学校官方应用。**

## 主要功能

- 查看每周课表、下一节课和桌面小组件；在课表上方一键显示或隐藏非本周课程。
- 添加个人安排，设置课程和安排提醒；时间冲突会标出课程、周次和具体时间。
- 导入 Excel、CSV、TSV、HTML 或应用备份，也可通过烟台大学固定入口或自助输入学校网址尝试读取课表。
- 自定义背景，导出或恢复完整备份。

官网导入仍在测试，不保证兼容所有学校；自助输入网址后，已适配的课表页面（含嵌入页面）会自动使用对应学校的读取规则。导入后请核对课程、周次和学期日期。使用 HTTP 教务网址时，连接不加密，建议优先使用学校提供的 HTTPS 入口。

## 安装与使用

从 [GitHub Releases](https://github.com/wanglingcai/ytu-timetable/releases) 下载 APK，安装到 Android 8.0 或更高版本的手机。打开应用后点击“导入”，选择课表文件或学校官网，核对预览内容并确认保存。通用表格可参考 [示例模板](examples/)。

## 开发与构建

项目使用 Java、Android SDK 和 HTML/CSS/JavaScript。准备 JDK、Android SDK 和 Node.js，在项目根目录执行：

```powershell
npm.cmd ci
npm.cmd test
.\gradlew.bat :app:assembleDebug
```

Debug APK 生成在 `app/build/outputs/apk/debug/app-debug.apk`。项目当前源码版本为 **0.9.7（versionCode 25）**。配置本地签名后，可运行 `./scripts/build.ps1 -Release` 构建正式 APK 和校验文件。

## 项目结构

```text
app/src/main/java/     Android 应用、提醒与官网导入
app/src/main/assets/   课表界面、解析逻辑和学校配置
tests/                 自动化测试
examples/              课表导入示例
docs/                  项目图片与补充资料
scripts/               构建和开发脚本
```

## 许可证

本项目采用 [PolyForm Noncommercial 1.0.0](LICENSE)，可用于个人、学习等非商业用途；商业使用需取得作者书面许可。第三方组件许可详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
