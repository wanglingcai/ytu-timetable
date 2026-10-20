# 第三方组件

## SheetJS Community Edition 0.20.3

- 用途：在手机本地读取 Excel、CSV 与 HTML 表格，不加载远程脚本。
- 来源：https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- 版权与许可：SheetJS LLC；Apache License 2.0。完整许可随应用打包于 `app/src/main/assets/vendor/SHEETJS-LICENSE.txt`，源文件头也保留原始版权说明。
- 本项目保存的 `xlsx.full.min.js` SHA-256：`cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`。

## 构建和测试工具

Gradle Wrapper 9.1.0 用于构建，分发包使用官方 SHA-256 校验。Android Gradle Plugin 9.0.1、Android SDK 与 Playwright 均只用于开发、构建或验证，不作为远程运行服务接入应用。对应许可和发布方条款分别适用。
