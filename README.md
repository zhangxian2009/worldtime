# WorldTime

全球时间可视化工具 — 4 个 TAB（地图 / 时间轴 / 对照表 / 24h 时钟）共享同一套城市数据 + 时区/天文计算工具。

## 启动

```bash
# 开发服务器（推荐）
npm start
# 或：npx http-server . -p 8080 -c-1

# 然后访问 http://localhost:8080
```

> **注意**：因为代码是 ES module + 异步 fetch JSON 数据，**不能直接 file:// 双击打开**，必须通过 HTTP 服务器访问。

### 壁纸模式
访问 `http://localhost:8080/?wallpaper=1` 进入全屏壁纸。多个标签页共享同一 localStorage，自动跨窗同步。

## 开发命令

```bash
npm start         # 启动开发服务器（端口 8080）
npm run typecheck # TypeScript 类型检查（@ts-check + JSDoc）
npm test          # 跑 vitest 单元测试
npm run test:watch # 监听模式
```

## 项目结构

```
WorldTime/
├── index.html              # 469 行 HTML/CSS 骨架
├── src/
│   ├── main.js             # 主入口（256 行）
│   ├── globals.d.ts        # d3 / topojson 全局声明
│   ├── core/               # 纯函数工具
│   │   ├── astro.js          天文计算（太阳/月亮位置/月相/节气）
│   │   ├── time-utils.js     时区/时间工具
│   │   ├── color-utils.js    颜色 / 渐变工具
│   │   ├── state.js          应用状态聚合
│   │   ├── storage.js        localStorage 持久化
│   │   ├── cities.js         城市数据加载
│   │   └── dom-keys.js       DOM ID / storage key 常量
│   ├── ui/                 # 通用 UI 组件
│   │   ├── modal.js          城市选择模态框
│   │   └── local-clock.js    顶部时间显示
│   ├── tabs/               # 4 个 TAB 模块
│   │   ├── map.js            世界地图（D3 + SVG）
│   │   ├── timeline.js       时间轴
│   │   ├── comp-table.js     对照表
│   │   └── clock.js          24h 表盘（Canvas）
│   └── __tests__/          # 单元测试（vitest）
├── data/cities.json        # 122 城市 / 6 大洲（异步加载）
├── lib/                    # D3 v7 / topojson（vendored）
├── jsconfig.json           # TS 检查配置
└── package.json
```

## 架构要点

- **零构建链**：纯 ES module + `<script type="module">`，浏览器原生支持
- **依赖注入**：每个 TAB 模块导出 `configure(deps)` 接收 state 和回调，避免循环依赖
- **状态聚合**：所有 mutable 状态归为 `state.{selection|map|comp|clock}`
- **类型护栏**：`// @ts-check` + JSDoc，VS Code 自动检查，`npm run typecheck` 跑 CI
- **节能设计**：Clock TAB 5 分钟无操作自动从 1Hz 降为 60s 刷新

## TAB 速览

| TAB | 渲染方式 | 主要内容 |
|---|---|---|
| 世界地图 | D3 + SVG | Natural Earth/Braun 投影 + 晨昏线 + 子日/子月点 + IDL/子夜线 + 城市 |
| 时间轴 | DOM | 6×5 天 24h 色带 + 协作窗口标记 |
| 对照表 | DOM 表格 | 城市 × 24h 矩阵，按参考城市对齐 |
| Clock | Canvas | 24h 表盘 + 太阳/月亮 + 时分秒针 + 置顶城市时针 |

## 优化历程

详见 git tags:
- `v1.0.0` — 优化前基线（单 HTML 2696 行）
- `v1.1.0` — Phase 1：P0 隐患修复（去重 / 单一数据源）
- `v1.2.0` — Phase 2-3：数据外置 + 状态聚合
- `v1.3.0` — Phase 4：类型检查（ts-check + JSDoc）
- `v1.4.0` — Phase 6：完整 ES module 拆分

## 浏览器要求

- 支持 ES2022 + ES modules + top-level await
- Chrome 89+, Safari 15+, Firefox 89+
