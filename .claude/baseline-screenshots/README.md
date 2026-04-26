# 基线截图

在每个优化阶段完成后，对比这些截图来检测视觉回归。

## 如何捕获基线（v1.0.0 状态）

1. 启动服务器：
   ```bash
   npx http-server . -p 8080
   ```
   或使用现有的 Python 服务器。

2. 浏览器访问 `http://localhost:8080`

3. 依次切换到每个 TAB，按下面的命名截图保存到本目录：

   - `01-map-natural.png` — 世界地图 TAB（Natural Earth + 自然过渡）
   - `02-map-braun.png` — 世界地图 TAB（Braun + 简单过渡）
   - `03-timeline.png` — 时间轴 TAB
   - `04-comp-table.png` — 对照表 TAB
   - `05-clock-light.png` — Clock TAB（浅色主题）
   - `06-clock-dark.png` — Clock TAB（深色主题）
   - `07-modal.png` — 城市选择模态框打开状态
   - `08-wallpaper.png` — `?wallpaper=1` 壁纸模式

4. 完成后提交：
   ```bash
   git add .claude/baseline-screenshots/*.png
   git commit -m "chore: capture v1.0.0 baseline screenshots"
   ```

## 如何对比

每完成一个 Phase 后：
1. 重新截图（同样的 TAB / 同样的状态）
2. 用图像对比工具或肉眼比对
3. 任何**非预期**的视觉差异 → 回滚或调查原因

> 注意：时间相关的 UI（时针位置、太阳/月亮位置）会因截图时间不同而不同，这是预期的，不算回归。
