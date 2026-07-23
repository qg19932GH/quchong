# 视频去重工具 - 开发指引 (CLAUDE.md)

本文件作为智能助手（Antigravity/Claude）在本项目中的工作规范与操作指南。

## 1. 常用开发命令

| 命令 | 描述 |
| :--- | :--- |
| `npm install` | 安装 Electron 等本地开发环境依赖 |
| `npm start` | 启动 Electron 桌面客户端窗口进行调试 |
| `node src/test_parser.js` | 运行番号解析器断言单元测试 |
| `node src/create_mock_files.js` | 在工作区下生成含有重复文件的 `mock_videos` 测试目录 |

---

## 2. 项目文档与日志指引

*   **开发日志目录**：[dev_logs/](file:///c:/Users/5A5851/Desktop/git/quchong/dev_logs/)
    *   每次开发交互或提交变动前，需在当前日期命名的日志文件（如 `dev_logs/YYYY-MM-DD.md`）中自动记录已完成事项、设计变更及下一步待办清单。
*   **开发标准文档**：[docs/](file:///c:/Users/5A5851/Desktop/git/quchong/docs/)
    *   [requirements.md](file:///c:/Users/5A5851/Desktop/git/quchong/docs/requirements.md): 存放核心开发需求与判定规则。
    *   [tech_spec.md](file:///c:/Users/5A5851/Desktop/git/quchong/docs/tech_spec.md): 架构、通信接口及视频元数据提取细节规范。
    *   [design_guide.md](file:///c:/Users/5A5851/Desktop/git/quchong/docs/design_guide.md): 极简淡蓝色系视觉与微动画交互细节设计标准。

---

## 3. 代码风格与设计规则

1.  **技术选型约束**：
    *   使用 Vanilla JS 与 Vanilla CSS，禁止在未征得同意的情况下使用 TailwindCSS 或 React 等重度框架，确保项目极速轻巧。
    *   仅依赖 Electron 原生模块和 Node.js 标准库，若需引入第三方 NPM 包必须先确认其稳定性与跨平台兼容性。
2.  **核心安全规则**：
    *   **禁止使用物理物理物理物理物理删除**（如 `fs.unlinkSync` 等），必须使用 Electron 官方的 `shell.trashItem(path)`，确保视频在被移除时被放入系统回收站，用户可人工找回。
3.  **UI/UX 规范**：
    *   必须使用 **淡蓝色系** 配色，遵照 [design_guide.md](file:///c:/Users/5A5851/Desktop/git/quchong/docs/design_guide.md)。
    *   必须提供双重去重按钮：即“单个文件删除”及重复组首部的“一键清理其他重复项（保留最大文件）”。
    *   支持文件夹拖拽响应。
