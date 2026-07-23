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

## 4. 查重与排序算法实现

扫描后，主进程按照以下算法对文件进行比对和组装：

1.  **哈希分组**：
    *   使用 `Map<string, Array<FileInfo>>` 临时存储特征码与文件列表。
    *   对于每个检索到的视频文件，提取番号，如果番号有效，作为 Map 的 Key 将文件属性压入 Array。
2.  **过滤去重**：
    *   遍历 Map，删除 `value.length < 2` 的键值对（即非重复文件）。
3.  **内排序**：
    *   在每个重复 Array 内部，以 `size` 从大到小降序排列（确保首个文件是“最佳保留选项”）。
4.  **外排序**：
    *   重复组列表按 `files.length` (重复次数) 降序排列；如果重复次数一致，则以番号名称字母序排列。
