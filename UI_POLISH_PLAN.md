# Hydro-tibor 前端 UI 改造调研与方案

## 一、当前阶段说明

- 本文只是前端结构调研和 UI 改造方案。
- 本轮不修改任何前端代码。
- 本轮不修改业务逻辑。
- 本轮不提交。
- 本轮不影响 Docker / judge / 部署配置。

## 二、当前前端结构调研

以下为基于只读扫描得到的关键入口（重点在 `packages/ui-default`）。

### 首页相关

- 文件路径：`packages/ui-default/templates/main.html`
  - 作用推测：首页模板主入口（`page_name = "homepage"`），按 `contents` 动态拼装 `partials/homepage/*.html` 模块。
  - 是否适合修改：适合（首页模块顺序/文案/卡片样式优先在这里及子 partial 调整）。
  - 修改风险：中（改错模块名会触发模板不存在提示，影响首页渲染）。
- 文件路径：`packages/ui-default/templates/partials/homepage/*.html`
  - 作用推测：首页各区块（题目、训练、排行榜、比赛等）子模块。
  - 是否适合修改：适合（最适合做“训练营/闯关/进步”视觉改造）。
  - 修改风险：低到中（主要是展示层风险）。

### 导航栏相关

- 文件路径：`packages/ui-default/templates/partials/nav.html`
  - 作用推测：桌面端主导航；核心菜单来自 `ui.getNodes('Nav')`，支持 `overrideNav`。
  - 是否适合修改：适合（文案、入口顺序、视觉简化可在此做）。
  - 修改风险：中（误改权限判断或 URL 可能导致菜单入口缺失）。
- 文件路径：`packages/ui-default/templates/partials/header_mobile.html`
  - 作用推测：移动端顶部栏与汉堡入口。
  - 是否适合修改：适合（移动端最小可用体验改造切入点）。
  - 修改风险：低（主要样式和结构风险）。

### 布局相关

- 文件路径：`packages/ui-default/templates/layout/basic.html`
  - 作用推测：大多数页面公共布局（导航、移动头、主内容、footer）。
  - 是否适合修改：谨慎适合（全站布局统一能力强）。
  - 修改风险：中到高（改动会影响全站页面）。
- 文件路径：`packages/ui-default/templates/layout/html5.html`
  - 作用推测：最底层 HTML 壳，负责加载 `theme-*.css`、`hydro-*.js`、多语言资源。
  - 是否适合修改：不建议第一阶段修改。
  - 修改风险：高（可能导致全站白屏或资源加载异常）。
- 文件路径：`packages/ui-default/templates/layout/home_base.html`
  - 作用推测：用户中心类页面双栏基底（主内容 + 侧栏）。
  - 是否适合修改：适合小幅调整（间距、卡片感）。
  - 修改风险：中（会影响 home 系列页面）。

### 主题样式相关

- 文件路径：`packages/ui-default/theme/dark.styl`
  - 作用推测：暗色主题覆盖。
  - 是否适合修改：适合（后续若做主题一致性可调整）。
  - 修改风险：中（主题特异性回归成本较高）。
- 文件路径：`packages/ui-default/common/variables.inc.styl`
  - 作用推测：全局变量（颜色、尺寸等）候选位置。
  - 是否适合修改：适合小步改（设计 token 级别）。
  - 修改风险：中（变量变动会全站扩散）。
- 文件路径：`packages/ui-default/pages/*.styl`、`packages/ui-default/components/**/*.styl`
  - 作用推测：页面级/组件级样式定义。
  - 是否适合修改：适合（第一阶段推荐优先做页面级覆盖）。
  - 修改风险：低到中（局部影响可控）。

### 题目列表相关

- 文件路径：`packages/ui-default/templates/problem_main.html`
  - 作用推测：题目列表页结构（搜索、排序、分类区、列表区、侧栏）。
  - 是否适合修改：适合（标签/难度/通过状态展示优化主战场）。
  - 修改风险：中（兼顾管理员编辑模式与普通浏览模式）。
- 文件路径：`packages/ui-default/templates/partials/problem_list.html`
  - 作用推测：题目列表具体行渲染。
  - 是否适合修改：适合（字段与视觉密度优化点）。
  - 修改风险：中（列表可读性和性能需回归）。
- 文件路径：`packages/ui-default/pages/problem_main.page.tsx`
  - 作用推测：题目检索/筛选交互逻辑（分类、难度、query parser、PJAX）。
  - 是否适合修改：第一阶段不建议动逻辑，只做模板+样式。
  - 修改风险：中到高（可能误伤筛选行为）。

### 题目详情页相关

- 文件路径：`packages/ui-default/templates/problem_detail.html`
  - 作用推测：题目详情主结构（标题、标签、难度、统计、题面、多语言、侧栏）。
  - 是否适合修改：适合（阅读层级、标签醒目度、提交入口视觉优化）。
  - 修改风险：中（需避免影响 contest/homework 场景分支）。
- 文件路径：`packages/ui-default/templates/partials/problem_sidebar*.html`
  - 作用推测：详情页侧栏（提交、scratchpad、统计入口等）。
  - 是否适合修改：适合轻改样式与信息层级。
  - 修改风险：中（交互入口较多，需回归）。
- 文件路径：`packages/ui-default/pages/problem_detail.page.tsx`
  - 作用推测：详情页交互逻辑（scratchpad、objective 提交、语言切换等）。
  - 是否适合修改：第一阶段不建议动。
  - 修改风险：高（容易误伤提交/评测相关流程）。

### 排行榜相关

- 文件路径：`packages/ui-default/templates/ranking.html`
  - 作用推测：域排行榜主模板（rank、user、RP、AC、bio）。
  - 是否适合修改：适合（成就感增强的首选页面之一）。
  - 修改风险：低到中（主要展示层）。
- 文件路径：`packages/ui-default/pages/ranking.page.styl`
  - 作用推测：排行榜页面样式（含移动端列裁剪策略）。
  - 是否适合修改：适合（移动端可读性与视觉提升）。
  - 修改风险：低。
- 文件路径：`packages/ui-default/templates/contest_scoreboard.html`、`packages/ui-default/pages/contest_scoreboard.page.ts`
  - 作用推测：比赛榜单模板与交互（星标、过滤、定时刷新）。
  - 是否适合修改：适合轻样式；交互逻辑暂不改。
  - 修改风险：中（赛时行为敏感）。

### 用户页相关

- 文件路径：`packages/ui-default/templates/user_detail.html`
  - 作用推测：用户主页（头像、统计、角色徽章 SU/MOD、已通过题、标签等）。
  - 是否适合修改：适合（“学习成长感”改造核心页面）。
  - 修改风险：中（信息密度高，需保证权限展示正确）。
- 文件路径：`packages/ui-default/templates/partials/user_detail/*.html`
  - 作用推测：用户页扩展区块，可通过子模块注入。
  - 是否适合修改：适合（渐进增强空间好）。
  - 修改风险：低到中。

### 构建脚本相关

- 文件路径：`package.json`
  - 作用推测：前端构建命令入口：
    - `build:ui`
    - `build:ui:dev`
    - `build:ui:production`
    - `docker:dev`（`docker compose up --build`）
  - 是否适合修改：本轮不修改。
  - 修改风险：高（影响整体开发链路）。
- 文件路径：`packages/ui-default/build/*`
  - 作用推测：`ui-default` webpack/esbuild 构建实现。
  - 是否适合修改：第一阶段不建议改构建。
  - 修改风险：高。

## 三、前端技术栈判断

- TypeScript / JavaScript：是。`ui-default` 同时存在 `.tsx/.ts/.js/.jsx`。
- Vue / React / 模板系统：
  - React：存在（例如 `problem_main.page.tsx`、`problem_detail.page.tsx` 局部 React 渲染）。
  - 模板系统：存在（Nunjucks 模板，大量 `templates/*.html`）。
  - Vue：本轮未确认是主栈，暂不判断为核心。
- SCSS / CSS：主要是 Stylus（`.styl`）+ 构建后 CSS。
- UI 包：可见 `@mantine/*`、jQuery 生态、自定义组件系统并存。
- 构建工具：webpack + esbuild（`packages/ui-default/build`），根脚本可直接触发 UI 构建。
- `ui-default` 主题机制：存在并且是当前核心默认 UI（`@hydrooj/ui-default`）。
- 是否支持插件/主题覆盖：
  - 已确认支持“模板覆盖”机制：`TemplateService` 会加载各 addon 的 `template/templates` 目录并注册模板。
  - 已确认导航支持节点扩展：`ui.getNodes('Nav')`。
  - 结论：不一定必须改 Hydro 核心源码，存在通过插件/模板覆盖做定制的路径。
- 不确定项（需下一轮确认）：
  - 完整“官方推荐主题覆盖流程”细节（是否有固定约定目录与优先级文档化说明）。
  - `ui-next` 在当前实例中的启用策略与替代关系（本轮只发现代码存在，未确认是否实际启用）。

## 四、低风险 UI 改造策略

### 1、低风险改造

- 文案调整：首页与导航文案从“系统功能导向”改为“学生训练导向”。
- 首页模块顺序调整：把“开始刷题 / 题单 / 排行榜 / 最近训练”前置。
- 样式微调：卡片圆角、阴影、留白、字号层级、按钮视觉统一。
- 颜色优化：降低技术感，增加训练平台感（温和主色 + 成就色点缀）。
- 标签展示优化：L1/L2/入门/数组/循环等标签更直观。

### 2、中风险改造

- 首页结构重组：新增“训练入口区 + 学习进度区”版块布局。
- 题目列表字段重排：难度/标签/通过状态优先于管理入口。
- 排行榜成就化：新增徽章位（先前端展示占位，不引入新业务逻辑）。
- 用户页学习统计强化：提交数、通过数、连续活跃等可视化展示（先用已有字段）。

### 3、高风险改造

- 改路由。
- 改权限逻辑。
- 改提交流程/评测交互。
- 改数据库结构。
- 深度改 Hydro 核心组件或构建系统。

明确建议：先做低风险，再做中风险，暂不做高风险。

## 五、推荐第一阶段 UI 改造范围

第一阶段只建议做：

1. 首页视觉优化（`main.html` + `partials/homepage/*` + 对应样式）。
2. 导航栏文案与入口优化（`partials/nav.html`、`header_mobile.html`）。
3. 题目列表标签和难度展示优化（`problem_main.html`、`partials/problem_list.html`）。
4. 题目详情页阅读体验优化（`problem_detail.html` 及相关样式）。
5. 排行榜轻微样式优化（`ranking.html` + `ranking.page.styl`）。

不要第一阶段就做：

- 新数据库字段。
- 新权限系统。
- 复杂徽章系统（先做展示占位）。
- 深度重写前端。
- 大规模改业务逻辑。

## 六、建议的新分支策略

后续真正改 UI 时，建议从 `master` 新建：

- `feat/ui-polish`

每个页面单独小 commit：

- `ui: polish homepage`
- `ui: simplify navigation`
- `ui: improve problem list`
- `ui: polish problem detail`
- `ui: polish ranking page`

## 七、本地验证方式

后续改 UI 后建议按以下流程验证：

- 执行：`docker compose up --build`
- 浏览器访问：`http://localhost:8888`
- 检查首页：首页模块顺序、按钮与训练入口是否符合预期。
- 检查题目列表：筛选、标签、难度、通过状态显示是否正确。
- 检查题目详情：题面可读性、样例块、提交入口可见性。
- 检查提交代码不受影响：正常提交并返回记录页。
- 检查 judge AC/WA 不受影响：复测一组已验证样例。

可选补充（非必须）：

- 本地 UI 构建命令：`yarn build:ui` / `yarn build:ui:dev`

## 八、风险点

- 改错模板导致页面白屏或模板渲染失败。
- 改错全局样式导致全站布局串位。
- 改动 `ui-default` 后未来同步上游更新可能冲突。
- Hydro 前端构建缓存导致“改了看不到变化”。
- 移动端样式被破坏（尤其导航和表格页）。
- 改 UI 时误伤提交/评测流程入口。
- 过早做复杂徽章/等级系统导致范围膨胀。

## 九、下一阶段建议

下一阶段是：阶段 4B：打开关键前端文件，做首页和导航栏最小 UI 改造（本轮不执行）。

阶段 4B 建议：

- 新建 `feat/ui-polish` 分支。
- 只改首页和导航栏。
- 不动提交流程逻辑。
- 不动 judge。
- 不动数据库。
- 每次改完本地验证。

## 十、Cursor 下一轮执行边界

下一轮允许：

- 新建 `feat/ui-polish` 分支。
- 修改首页/导航/样式相关文件。
- 小步改动，逐页验证。
- 本地验证（含 `localhost:8888` 页面检查）。

下一轮不允许：

- 修改 judge。
- 修改 Docker。
- 修改数据库。
- 修改权限。
- 修改提交逻辑。
- 修改 `install/*`。
- 上服务器。
- 碰 ClassFlow。
