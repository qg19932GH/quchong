# 视频去重工具 - 技术规范文件 (tech_spec.md)

本文件说明视频去重工具（quchong）的技术架构、核心模块接口（API）以及视频元数据读取策略。

## 1. 技术架构设计
本项目采用 **Electron 进程隔离模型** 运行：

*   **主进程 (Main Process)**: 拥有 Node.js 完整 API 权限。负责处理系统级窗口、本地文件系统递归扫描（I/O密集型任务）、调用 Windows API 移入回收站。
*   **预加载脚本 (Preload Script)**: 在沙盒环境中向渲染进程暴露安全的 IPC 接口，隔离 Node.js 直接调用。
*   **渲染进程 (Renderer Process)**: 纯前端运行环境，加载 `index.html`、`style.css`、`renderer.js`。处理 DOM 操作、拖拽事件与数据状态渲染。

---

## 2. 视频元数据 (Metadata) 提取策略

针对用户要求展示的“文件大小”、“分辨率”、“时长”等辅助信息，采取以下组合提取策略：

### 2.1 文件大小与修改时间 (基础元数据)
*   **方法**：使用 Node.js 的 `fs.promises.stat(filePath)` 异步获取。
*   **字段**：
    *   `size`: 返回字节数（Bytes），由前端转换成 `KB`, `MB`, `GB` 友好格式。
    *   `mtimeMs`: 文件最后修改时间戳，由前端转换为 `YYYY-MM-DD HH:mm`。

### 2.2 时长与分辨率 (高级元数据)
由于 Chromium（Electron 内核）对有些视频格式（如 `.mkv`、`.avi`、`.wmv`）不支持硬解码，无法通过前端 `<video>` 标签完美读取，因此采用以下分级读取方案：
1.  **分级方案 A（内置分析，轻量）**：
    *   通过主进程使用轻量级 Node 模块解析 MP4 等文件头数据，或者：
    *   在渲染进程中使用不可见的 Web 浏览器 `<video>` 标签尝试加载视频文件。如果视频格式为 `.mp4` 或 `.webm`（主流视频），监听 `loadedmetadata` 事件读取 `duration`、`videoWidth` 和 `videoHeight`。
2.  **分级方案 B（稳定降级）**：
    *   如无法提取（视频格式不支持或解码失败），分辨率/时长字段标记为 `--`，前台自动隐藏或显示为“未知”，不干扰去重运行。

---

## 3. 进程通信 (IPC) 接口规范

渲染进程与主进程之间的数据接口如下：

| 接口名称 | 调用方向 | 参数类型 | 返回值类型 | 描述 |
| :--- | :--- | :--- | :--- | :--- |
| `select-directory` | `invoke` (双向) | `void` | `Promise<string \|| null>` | 弹出系统选择目录窗口，返回所选文件夹绝对路径 |
| `start-scan` | `send` (单向) | `dirPath: string` | `void` | 开启异步递归文件夹检索 |
| `scan-progress` | `on` (主 ➡️ 渲染) | `data: { scannedCount, matchedCount, currentDir }` | `void` | 主进程实时推送扫描进度 |
| `scan-done` | `on` (主 ➡️ 渲染) | `results: { scannedCount, matchedCount, duplicates: [...] }` | `void` | 扫描完成，返回重聚类的文件包 |
| `scan-error` | `on` (主 ➡️ 渲染) | `errorMsg: string` | `void` | 检索出错推送 |
| `cancel-scan` | `send` (单向) | `void` | `void` | 渲染进程请求中途取消检索 |
| `open-folder` | `invoke` (双向) | `filePath: string` | `Promise<boolean>` | 在资源管理器中显示该文件并高亮选中 |
| `move-to-trash` | `invoke` (双向) | `filePath: string` | `Promise<boolean>` | 将文件移入系统回收站 |

---

## 4. 查重与广告聚合算法实现

扫描后，主进程与渲染进程协同按照以下算法对文件进行比对、清洗和组装：

1.  **特征码解析 (Parser)**：
    *   **优先号码匹配**：先运行正规 AV/Heyzo/FC2/无码日期码 正则捕获。若捕获成功，则通过 `extractSuffixes` 从号码后方的子串截取分段（PART/CD/DISC）与特典（SP/特典）后缀，格式化拼接后作为核心唯一 Key 返回。
    *   **次级广告过滤**：若非正规号码视频，但其全名包含预设广告词，直接映射至统一唯一 Key `[ADVERTISEMENT]`。
    *   **三级降级清洗 (Fallback)**：若不满足前两项，则使用正则剔除扩展名、中括号、质量指标以及特殊标点符号，提取纯净文件名核心为 Key，并同样附带后缀截取。
2.  **哈希分组**：
    *   使用 `Map<string, Array<FileInfo>>` 临时存储特征码与文件列表。若特征码不为 `null`，作为 Key 压入文件详情。
3.  **过滤去重**：
    *   遍历 Map，删除 `value.length < 2` 且键名不为 `[ADVERTISEMENT]` 的键值对（保留单广告文件的广告分组）。
4.  **组内排序 (内排序)**：
    *   在非 `[ADVERTISEMENT]` 分组内部，按照文件 `size` 大小从大到小降序排列（确保 `files[0]` 始终是最大/最佳文件，其余为重复待删件）。
5.  **列表排序 (外排序)**：
    *   广告分组 `[ADVERTISEMENT]` 在前端列表中优先置顶展示；其余重复组按 `files.length` (重复次数) 降序排列。

---

## 5. 编译与打包规范

为满足极简交付，项目的 Electron 打包任务遵循以下标准：

1.  **单目标构建 (Portable Only)**：
    *   在 [package.json](file:///c:/Users/5A5851/Desktop/git/quchong/package.json) 中配置 Windows 编译目标为单一 `portable` 便携单文件可执行程序，不再产出安装向导 (`nsis`) 等 setup.exe 文件。
2.  **产物命名**：
    *   设置 `artifactName` 为 `视频去重工具_便携版_${version}.${ext}`，确保构建输出见名知义。
3.  **GitHub Actions CI 编译**：
    *   配置于 [.github/workflows/build.yml](file:///c:/Users/5A5851/Desktop/git/quchong/.github/workflows/build.yml) 中，在 `windows-latest` 虚拟机下完成依赖挂载、自动构建和 Release/Artifact 附件附着分发。
