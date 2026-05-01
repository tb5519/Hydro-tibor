# Hydro-tibor 终极交接文档（Codex 接手专用）

> **本文档状态**：整合 `FINAL_CODEX_HANDOFF.md`、`CODEX_HANDOFF.md`、`SERVER_PRE_MIGRATION_INSPECTION.md`、`SERVER_DEPLOY_COMMAND_PLAN.md`、`PRODUCTION_MIGRATION_RUNBOOK.md`、`JUDGE_RUNBOOK.md`、`JUDGE_INTEGRATION_PLAN.md`、`DATA_MIGRATION_PLAN.md`、`PROJECT_PROGRESS_SUMMARY.md` 等材料后的**总览**；细节仍以各专项文档为准。  
> **安全**：本文不含真实密码、Token、私钥、`.env` 内容、`judge.yaml` 明文。  
> **接手原则（强制）**：Codex 接手**第一步只能只读检查**——确认目录、git、容器、磁盘、服务 HTTP 码；**禁止**在未理解限制前执行 `down -v`、`system prune`、数据导入、服务器重型构建或删除镜像/卷。

---

## 文档索引（深度细节去哪找）

| 主题 | 仓库内文档 |
|------|------------|
| 服务器迁移前只读核查（历史基线） | `SERVER_PRE_MIGRATION_INSPECTION.md` |
| 部署命令规划草案 | `SERVER_DEPLOY_COMMAND_PLAN.md` |
| 正式迁移执行清单 | `PRODUCTION_MIGRATION_RUNBOOK.md` |
| 旧数据迁移规划 | `DATA_MIGRATION_PLAN.md` |
| Judge 专项 | `JUDGE_RUNBOOK.md`、`JUDGE_INTEGRATION_PLAN.md` |
| 较早 Codex 摘要 | `CODEX_HANDOFF.md`、`FINAL_CODEX_HANDOFF.md` |
| **注意** | `PROJECT_PROGRESS_SUMMARY.md` 中百分比与 commit **已过期**，请以本文「总进度」与 `git log` 为准。 |

---

## 〇、Git 快照（撰写本文时的机器记录）

下列命令在交接文档整理时执行，**后续接手请以服务器 / 本地当场输出为准**：

```bash
git log --oneline -12
git status --short
git diff --name-only
git diff --stat
```

**当时记录（示例）**：

- `git log --oneline -12` 含：`81f50136`、`ab23e618`、`550342a6` 等（见下文「关键 commit」）。
- `git status --short`：**干净**（无未提交改动）。
- `git diff --name-only` / `git diff --stat`：**无输出**。

若接手时工作区不干净，必须逐个文件归类：**A** 登录弹窗 UI、**B** 排行榜 badge、**C** 其它、**D** 敏感文件（勿提交）。

---

## 一、当前总进度与阶段结论

**当前总进度约 79%。**

### 状态图例（文中统一用语）

| 标记 | 含义 |
|------|------|
| **已完成** | 事项在技术或运维上已达成 |
| **已提交** | 已进入 Git `master`（具体见 commit） |
| **服务器已执行** | 曾在阿里云目标机上实际操作 |
| **本地已验证** | 开发机或演练环境验证过 |
| **暂缓** | 刻意延后，等有前置条件 |
| **未完成** | 尚未做 |
| **接手后只读确认** | Codex 应先查询现状再决定是否改动 |

### 已完成（摘要）

1. **阿里云** Hydro-tibor 基础部署（**服务器已执行**）。
2. 服务器内存 **2GB → 4GB**（**服务器已执行**）。
3. **Hydro Web** 跑通（**服务器已执行 + 历史验收**）。
4. **Mongo** 跑通、`healthy`（**服务器已执行**）。
5. **badge 插件**加载成功（**服务器已执行 + 日志曾验证**）。
6. **轻量 judge** 跑通（**服务器已执行**）。
7. **P1000** 判题跑通（**本地/服务器链路曾验证**）。
8. 题库页工具条 **服务器 inline hotfix**（**服务器已执行**；非 Git 正式方案，见第十六节）。
9. **登录页 UI** 已定稿并提交 **ab23e618**（**已提交**）。
10. **FINAL_CODEX_HANDOFF.md** 已提交 **550342a6**（**已提交**）。
11. Docker 容器 **`restart=unless-stopped`**（**服务器已执行**，见第四节）。
12. Docker **开机启动 enabled**（**服务器已执行**）。
13. 无用 `<none>` **悬空镜像已删除**（**服务器已执行**；删除前须核对无容器引用）。
14. **磁盘空间**健康（用户给定最近一次结论：**约 40G，已用约 15G，可用约 23G，使用率约 40%**——接手后 **只读确认** `df -h`）。
15. 服务器当前意图：**仅保留必要 3 个镜像**（`hydro-dev-judge-lite:latest`、`hydro-dev-hydro:latest`、`mongo:7-jammy`）——接手后用 `docker images` **只读确认**。
16. **ClassFlow** 同机运行未受 Hydro 上线阻断（**需注意资源争用**，重型操作仍禁忌）。
17. **登录弹窗 UI + 排行榜 badge 解析修复 + ranking 样式** 已提交 **81f50136**（**已提交**；若你阅读的副本较旧，请以 `git log` 为准）。

### 未完成 / 暂缓 / 接手后只读确认

1. **正式域名** + **阿里云接入备案**（**未完成**）。
2. **旧 Mongo** 数据导入（**暂缓**；须备份与窗口）。
3. **旧 `/data/file/hydro`** 文件体恢复（**未完成**）。
4. **`hydro-home.tar.gz`** 内 static 等资源恢复（**未完成**）。
5. 导入后 **judge 用户**重建/校验、`judge.yaml` 一致（**未完成**，见第十二、二十三节）。
6. **正式旧题** AC/WA 全量验证（**未完成**）。
7. **对学生正式开放**（**未完成**）。
8. 服务器 **admin 是否超级管理员** — **接手后只读确认**（mongo `priv` / CLI `setSuperAdmin`，见第十二节）。
9. ~~登录弹窗 & 排行榜 badge 若未提交~~ → **已随 81f50136 提交**；若接手时无该 commit，须 **git pull** 或核对分支。
10. 服务器 **public / template 热修复回收到源码** 并统一部署（**未完成**）。
11. **`ranking.page.styl`**：样式进入打包 CSS 需 **`build:ui:production`（本地）**（**本地流程**，服务器不做）。

---

## 二、Git 当前关键 commit

| 说明 | commit | message |
|------|--------|---------|
| 最终 Codex 交接（上一版主文档） | `550342a6` | `docs: add final codex handoff` |
| 登录页 UI（全页） | `ab23e618` | `ui: polish training platform login page` |
| 登录弹窗 + 排行榜 badge + ranking 样式 + 登录页平台名动态化 | `81f50136` | `ui: improve login dialog and ranking badges` |

**81f50136 涉及文件（预期）**：

- `packages/ui-default/templates/partials/login_dialog.html`
- `packages/ui-default/templates/user_login.html`
- `packages/ui-default/templates/components/user.html`
- `packages/ui-default/pages/ranking.page.styl`

**说明**：用户口述路径可能是 `login_dialog.html`；仓库内实际路径为 **`templates/partials/login_dialog.html`**。

接手时请重新执行：

```bash
git log --oneline -12
git status --short
git diff --name-only
git diff --stat
```

---

## 三、服务器当前真实状态（接手后须只读复核）

- **项目路径**：`/www/hydro-tibor`
- **容器（命名约定）**：`hydro-dev-hydro-1`、`hydro-dev-mongo-1`、`hydro-dev-judge-1`
- **镜像（意图保留三类）**：`hydro-dev-judge-lite:latest`、`hydro-dev-hydro:latest`、`mongo:7-jammy`
- **已删除**：无用 `<none>` 悬空镜像（**仅限未被容器使用**者）。

### 最近一次用户给定快照（接手务必自行再跑一次）

- **`docker ps -a`**：`hydro-dev-judge-1` Up；`hydro-dev-hydro-1` Up，`127.0.0.1:8888->8888/tcp`；`hydro-dev-mongo-1` Up **healthy**。
- **`docker images`**：上述三镜像。
- **`df -h`**：`/dev/vda3` **40G**，已用约 **15G**，可用约 **23G**，使用率约 **40%**。

**结论**：磁盘空间健康；**不要**为「清理」去动 Docker volume 或执行 prune。**不要清理 Docker volume。**

---

## 四、自动重启策略

已在服务器执行（接手后用 `docker inspect` **只读确认**）：

```bash
docker update --restart unless-stopped hydro-dev-hydro-1
docker update --restart unless-stopped hydro-dev-mongo-1
docker update --restart unless-stopped hydro-dev-judge-1
```

**预期**：上述容器 `RestartPolicy.Name` 为 `unless-stopped`。

**Docker 服务**：

- `systemctl is-enabled docker` → **enabled**
- `systemctl status docker` → **active (running)**

**结论**：宿主机重启后，若 Docker 正常，Hydro / Mongo / Judge **应**自动拉起。

### 重启后验收命令

```bash
cd /www/hydro-tibor

docker ps -a

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/p
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/ranking

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml exec judge sh -lc 'pm2 list'

free -h
```

---

## 五、严禁操作清单（醒目）

**严禁**：

- `docker compose down -v`
- `docker system prune`
- `docker system prune -a --volumes`
- `docker volume rm`（及等价删除卷）
- 宝塔「清理卷」、宝塔「系统清理」中涉及 **Docker 卷**的选项
- `rm -rf /data/file/hydro`、`rm -rf /data/hydro`（无备份、无变更批准）
- 服务器上 **`build:ui:production`**
- 服务器上 **重型** `yarn install`
- 服务器上 **`docker compose up -d --build`**（整体镜像重建）
- 删除正在使用的镜像：`hydro-dev-hydro:latest`、`hydro-dev-judge-lite:latest`、`mongo:7-jammy`
- 删除正在使用的容器
- **提交** `.env`、`judge.yaml`、任意 tar 包、任意凭证
- 将**真实**密码 / Token / 私钥写入 Git 或交接文档
- **未备份**就导入旧数据
- **未确认 ClassFlow** 负载就做重型操作

**允许（仍需审慎）**：

- 删除 `<none>` **且未被容器引用**的悬空镜像；**必须先** `docker images` + `docker ps -a`。

---

## 六、服务器资源与运维限制

- **配置**：**2 核 4GB**（用户给定）。
- **历史**：2GB 时完整 judge build、`apt-get`、ghc 下载等曾导致卡死并牵连 ClassFlow；升级到 4GB 后**仍不建议**在服务器做重型构建。
- **服务器适合**：运行容器、`git pull`、替换模板、替换 `public`、`docker compose restart hydro`、轻量检查命令。
- **不适合**：完整 judge 镜像 build、Hydro 全量 build、`yarn install`、前端生产构建、`docker system prune`。
- **原则**：**前端 `public` 在本地构建**，上传到服务器替换（见第十七节）。

---

## 七、Hydro Web / Mongo / badge 当前状态

- **Hydro Web**：已运行（接手 **curl** 确认）。
- **Mongo**：**healthy**（接手 `docker ps` 确认）。
- **badge 插件**：已加载；日志曾出现 `Model init`、`apply plugin`、`Template init` 等到 `addons/badge-for-hydrooj`。
- **历史 HTTP**：`/`、`/p`、`/ranking` → **200**；`/mybadge` → **302**（登录相关，属常见现象）。
- **说明**：`module require via hydrooj/src/model/user is deprecated` 为**警告**，非当前阻断错误。

---

## 八、轻量 judge 最终状态

官方完整 judge 会安装多语言栈（gcc、g++、python、fp-compiler、jdk、php、rust、ghc、go、ruby、mono 等）。完整构建在弱配置机上易卡住（例如 **ghc** 下载）。

**当前轻量 judge**：

- **保留**：gcc、g++、python3、ca-certificates、wget、pm2、`@hydrooj/hydrojudge`、`go-judge` sandbox  
- **剔除**：fp-compiler、openjdk、php、rustc、ghc、golang、ruby、mono  
- **主要语言**：**Python 3**、**C / C++**

---

## 九、Dockerfile.lite 关键内容

核心逻辑（与仓库 `docker/judge/Dockerfile.lite` 一致；版本号以现场文件为准）：

```dockerfile
FROM node:22

COPY ./install/docker/judge/entrypoint.sh /root/entrypoint.sh

RUN apt-get -qq update && \
    apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    python3 \
    ca-certificates \
    wget && \
    chmod +x /root/entrypoint.sh && \
    ln -sf /usr/local/bin/node /usr/bin/node && \
    rm -rf /var/lib/apt/lists/*

RUN yarn global add pm2 @hydrooj/hydrojudge && \
    wget https://github.com/criyle/go-judge/releases/download/v1.12.0/go-judge_1.12.0_linux_amd64v3 -O /usr/bin/sandbox && \
    chmod +x /usr/bin/sandbox

ENTRYPOINT ["/root/entrypoint.sh"]
```

**坑**：早期 **go-judge v1.9.4** 会提示 symlink escape，**hydrojudge 可能不消费任务**；已升级到 **v1.12.0** 路线解决（具体以服务器二进制为准）。

---

## 十、judge.yaml 关键坑

**错误**：顶层直接写 `server_url` / `uname` / `password`（无 `hosts`）。

**原因**：`hydrojudge` 读取 `getConfig('hosts')`。

**正确结构（示意，密码用.secret，勿写入 Git）**：

```yaml
hosts:
  local:
    type: hydro
    server_url: http://hydro:8888/
    uname: judge
    password: <secret>
    concurrency: 1
```

- **路径**：`/www/hydro-tibor/docker/judge/judge.yaml`
- **禁止提交 Git**。
- **导入旧 Mongo** 后 judge 用户可能被覆盖 → 须重建/对齐密码并重启 judge。

---

## 十一、judge 验证方式

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml ps

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml exec judge sh -lc 'pm2 list'
```

期望：`sandbox` **online**，`hydrojudge` **online**。

查最近评测：

```bash
docker compose exec mongo mongosh hydro --quiet --eval '
db.record.find({}, {_id:1,status:1,lang:1,pid:1,score:1,judgeTexts:1,compilerTexts:1}).sort({_id:-1}).limit(5).toArray()
'
```

- **`status` 长期为 0**：Waiting，judge 未消费任务。  
- **历史根因**：go-judge 过旧；`judge.yaml` 缺少 `hosts` 结构。

---

## 十二、admin / judge 用户说明

- **本地 `localhost:8888` 与服务器（如 `8.147.68.249`）是两套环境**，权限与数据**不共享**。
- 服务器曾观测：admin 在域角色等界面表现像 **非全局超管**（缺「管理域 / 控制面板」等）—— **接手后只读确认**。

### 只读 / 修复流程（修复须负责人批准）

```bash
cd /www/hydro-tibor

docker compose exec mongo mongosh hydro --quiet --eval '
db.user.find(
  {uname:"admin"},
  {_id:1, uname:1, mail:1, priv:1}
).toArray().forEach(printjson)
'
```

必要时（**谨慎**）：

```bash
docker compose exec hydro sh -lc 'corepack yarn hydrooj cli user setSuperAdmin <UID>'
docker compose restart hydro
```

**导入旧数据后**必须重新确认 **admin / judge**。

---

## 十三、登录页 UI 改动

- **commit**：`ab23e618` — `ui: polish training platform login page`
- **主要文件**：`packages/ui-default/templates/user_login.html`
- **边界**：仅前端展示；未改登录逻辑、auth/session、Docker/judge/Mongo/ClassFlow。
- **平台名**：须读后台设置（`handler.domain.ui.name` / `model.system.get('server.name')` 等），**勿写死「编程训练平台」**；空则 fallback **Hydro**。  
  **81f50136** 已在登录页/弹窗侧做了动态化；若仍有硬编码，接手后 **只读搜索** 再最小修复。

---

## 十四、登录弹窗 UI 当前状态

- **模板路径**：`packages/ui-default/templates/partials/login_dialog.html`（由 `layout/basic.html` include）。
- **交互**：`components/signin/signInDialog.page.js` + `DomDialog`（勿在未理解前改逻辑）。
- **方向**：单卡片、桌面弹窗尺寸、复选框可见、底部注册链接、无右侧大注册栏。
- **必须保留字段**：`method="post"`、`uname`、`password`、`rememberme`、`tfa`、`authnChallenge`、`login_submit`、OAuth、`user_lostpass` / `data-lostpass`、注册链接、`dialog--signin__close`。
- **已提交**：见 **81f50136**。

---

## 十四点五、前端隐藏注册入口（最新）

当前已做“注册入口前端隐藏”（仅展示层）：

- `packages/ui-default/templates/partials/nav.html`
- `packages/ui-default/templates/partials/login_dialog.html`

效果：

- 未登录状态下顶部导航不再显示“注册”按钮。
- 登录弹窗底部不再显示“还没有账户？现在注册”。
- 保留登录按钮。
- 保留 Language。
- 保留“Forgot password or username?”链接。
- 保留登录表单字段与提交按钮。
- 保留关闭按钮。
- 保留 remember me 复选框。
- 不影响已登录用户菜单。

重要说明：

- 这次只是**前端隐藏注册入口**。
- 没有禁用后端注册接口。
- 没有修改 `auth/session/user`。
- 没有修改注册后端逻辑。
- 后续若要彻底禁止 `/register` 注册，需单独做后端或系统配置层面的关闭。
- 不要将“前端隐藏注册入口”等同于“安全禁用注册”。

---

## 十五、排行榜 badge 显示 bug 与修复

**现象**：`/ranking` 中「暗影骑士」类徽章只显示 **`2`**；用户详情页正常。

**结论**：数据正常；**`user.render_inline` 与 `user_detail.html` 对 `udoc.badge` 的 `#` 分段语义不一致**。

| 位置 | 格式 | 展示字段 |
|------|------|----------|
| `user_detail.html` | `slug#显示名#背景#前景#tooltip` | `_badge[1]` |
| 旧 `components/user.html` | `显示名#背景#前景` | `_badge[0]` → slug `2` 被当成文案 |

**修复（已进 81f50136）**：

- `packages/ui-default/templates/components/user.html`：`length >= 4` 走新格式；`length == 3` 用「第二段是否纯 hex」区分新旧；自定义徽章加 `user-profile-badge--custom`。
- `packages/ui-default/pages/ranking.page.styl`：`.col--user` 内 flex + 自定义徽章 `max-width` + ellipsis（**须本地 build 后更新服务器 `public`** 才生效于打包 CSS）。

**验收**：排行榜显示「暗影骑士」或合理省略；LV3 / SU 正常；详情页不变；不改排名算法与 badge 数据结构。

---

## 十六、题库页工具条 inline hotfix

- **问题**：服务器 `/p` 出现「搜索框独占一行，题数/排序/按钮在下一行」。
- **最终目标**：
  - 搜索框、默认排序、搜索按钮在桌面端同一行；
  - 题目数量提示可按运营需求显示/隐藏（当前版本为隐藏）；
  - 桌面端第二行保持：`输入框 + 默认排序 + 搜索按钮` 同一行；
  - 输入框边界清晰、浅色、焦点柔和蓝色光圈；
  - 移动端允许换行，避免挤压。
- **方案**：在 `packages/ui-default/templates/problem_main.html` 使用模板级  
  `<style id="hotfix-problem-toolbar-inline">...</style>` 进行修复。
- **部署特性**：模板改动，服务器 **不需要 build:ui**。
- **服务器最小发布命令**：

```bash
cd /www/hydro-tibor
git pull --ff-only origin master
docker compose restart hydro
```

- **禁止**：不要服务器 build；不要 `docker compose up -d --build`；不要 `down -v`；不要 `system prune`；不要动 Mongo/judge/ClassFlow。

### 当前已落实（最新）

- `packages/ui-default/templates/problem_main.html`
  - 搜索工具条改为桌面端同一行布局（输入框 + 排序 + 搜索按钮）。
  - 搜索按钮使用更清晰的浅蓝主色（非过深蓝色），hover 为略深蓝。
  - 移除题数提示渲染（不再显示 `X 道题` 文案）。
- `packages/ui-default/templates/partials/problem_list.html`
  - 去掉表格默认 `hide-problem-tag`，改为**默认显示标签列**。
  - 仍保留“显示标签/隐藏标签”切换能力（仅默认态从隐藏改为显示）。

---

## 十七、前端 public 更新流程

**服务器不构建。** 本地：

```bash
cd /Users/tangbo/Desktop/hydro-tibor
git checkout master
git pull --ff-only origin master
corepack yarn install --inline-builds
corepack yarn build:ui:production
```

检查 **非 dev HMR**：

```bash
find packages/ui-default/public \( -name 'default.theme.js' -o -name 'default-api_ts*.js' \) -type f -print0 \
  | xargs -0 grep -n "module.hot.data" \
  | head -20 || true
```

无输出为合格。

打包与上传（示例路径）：

```bash
tar -czf ~/Desktop/hydro-public-assets-latest.tar.gz -C packages/ui-default public
# 上传到服务器 /www/hydro-tibor/hydro-public-assets-latest.tar.gz
```

服务器替换（先备份）：

```bash
cd /www/hydro-tibor
mkdir -p /root/hydro-deploy-backup
tar -czf /root/hydro-deploy-backup/public-before-latest-replace-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C packages/ui-default public 2>/dev/null || true
rm -rf packages/ui-default/public
tar -xzf hydro-public-assets-latest.tar.gz -C packages/ui-default
docker compose restart hydro
```

**禁止**：服务器 `build:ui`、服务器重型 `yarn install`、`docker compose up -d --build`（作为常规更新手段）。

---

## 十八、服务器同步代码流程（防覆盖 hotfix）

```bash
cd /www/hydro-tibor

git status --short
git log --oneline -5

mkdir -p /root/hydro-deploy-backup
git diff > /root/hydro-deploy-backup/server-local-before-ui-sync-$(date +%Y%m%d-%H%M%S).patch || true

git stash push -u -m "server local hotfix before ui sync $(date +%Y%m%d-%H%M%S)" || true
git pull --ff-only origin master
git stash pop || true

git status --short
```

- 若出现 **UU / CONFLICT**：**停止**，把输出交给负责人。
- 无冲突：`docker compose restart hydro`，再 `curl` 验证 `/`、`/p`、`/ranking`、`/login`。

### 本次“隐藏注册入口”部署说明（模板级）

本次改动属于模板级（`nav.html`、`partials/login_dialog.html`），**不需要** `build:ui`。

服务器同步可最小执行：

```bash
cd /www/hydro-tibor
git pull --ff-only origin master
docker compose restart hydro
```

禁止：

- 不要服务器 build。
- 不要 `docker compose up -d --build`。
- 不要 `docker compose down -v`。
- 不要 `docker system prune`。
- 不要动 Mongo / judge / ClassFlow。

---

## 十九、域名与备案状态

- **`onebyone.run`**：腾讯云个人备案；若解析到**阿里云内地机房**且**未做阿里云接入备案**，会被拦截。
- **选项**：A 阿里云新增接入备案；B 使用已在阿里云备案域名；C **临时 IP**。
- **临时访问**：`http://8.147.68.249`（以 DNS 实际为准）；宝塔站点需绑定该 IP，否则 Host 不匹配。
- **调试**：`curl -H "Host: onebyone.run" http://127.0.0.1/p`

---

## 二十、宝塔 / Nginx 反代说明

- Hydro 监听 **`127.0.0.1:8888`**（不对公网直连）。
- 公网依赖宝塔 Nginx **反代**。
- **建议**：`/` → `http://127.0.0.1:8888`；**发送域名** `$host`；**WebSocket** 开启；**缓存**关闭。
- 若用 **IP 访问**，站点列表须包含 **`8.147.68.249`**（与现场一致）。

---

## 二十一、旧数据迁移状态

- **暂缓**正式导入；待域名/访问策略稳定。
- **备份包角色（典型命名）**：
  - `hydro-mongo.archive.gz` — Mongo
  - `hydro.zip` — `/data/file/hydro` 文件体
  - `hydro-home.tar.gz` — static 等补充资源  
- **禁止只导 Mongo**：必须同步文件体，否则附件、头像、样例、题面资源大量损坏。

---

## 二十二、正式数据迁移步骤摘要

1. 上传备份到 `/www/hydro-tibor/migration-import`（或约定目录）。  
2. **备份当前空库**与当前 `/data/hydro`、`/data/file`。  
3. 恢复 `hydro.zip` → `/data/file/hydro`。  
4. 恢复 `hydro-home.tar.gz` 内 `.hydro/static` 等。  
5. **停止 hydro**，保留 mongo（顺序以 `PRODUCTION_MIGRATION_RUNBOOK.md` 为准）。  
6. `mongorestore --gzip --archive --drop`（参数以现场为准）。  
7. 启动 hydro。  
8. 验证 `/`、`/p`、`/ranking`、`/mybadge`。  
9. 登录旧账号；抽查题库、附件、头像、样例、badge。  
10. **judge 用户**与 `judge.yaml`。  
11. **P1001** 或真实旧题 AC/WA。  
12. 再开放学生。

---

## 二十三、旧数据导入后必须重新检查

导入会覆盖空系统：**admin、judge、P1000 记录、badge 初始状态** 等。

建议 **mongosh** 抽查：`user`（`judge`）、`badge`、`userBadge`、`storage`、`record`、`document` 等计数与样例文档。

若 judge 不存在：重建 → `setJudge` → 密码与 `judge.yaml` 一致 → `restart judge` → 实测提交。

---

## 二十四、Codex 接手工作方式

**第一句话建议**：

> 请先阅读 `ULTIMATE_CODEX_HANDOFF.md`，并严格遵守限制。当前不要服务器 build，不要 `down -v`，不要 `system prune`，不要导入旧数据，不要动 ClassFlow。先只读确认 Web + Mongo + badge + 轻量 judge + P1000 判题状态。

**每次任务前先只读**：

`pwd`、`git status --short`、`git log --oneline -5`、`docker ps -a`、`docker images`、`df -h`、`free -h`。

**涉及服务器时输出**（当事人自查清单）：当前目录、分支、git 状态、改动文件、是否动 Docker/Mongo/judge/ClassFlow、验证命令与结果、是否建议继续、**总进度约 79%**（若发生重大里程碑再修订）。

---

## 二十五、当前成功状态验收命令

```bash
cd /www/hydro-tibor

docker ps -a
docker images

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml ps

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/p
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/ranking
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/mybadge

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml exec judge sh -lc 'pm2 list'

free -h
df -h
docker stats --no-stream
```

---

## 二十六、本文档的 Git 提交说明（给负责人）

- **意图**：仓库仅新增/更新 **`ULTIMATE_CODEX_HANDOFF.md`** 时，仍属**文档**；**勿**夹带 `.env`、`judge.yaml`、tar、凭证。
- **负责人确认后再提交**；提交信息示例：`docs: add ultimate codex handoff`

---

## 附录 A：本地开发路径（参考）

- 本地仓库（示例）：`/Users/tangbo/Desktop/hydro-tibor`
- ClassFlow（服务器）：`/www/wwwroot/classflow`
- Hydro `public`：`/www/hydro-tibor/packages/ui-default/public`
- Compose：`docker-compose.yml`、`docker-compose.judge.yml`、`docker-compose.judge-lite.yml`
- 备份目录：`/root/hydro-deploy-backup`

---

**文档结束。**  
**当前撰写完成后：未执行 `git commit`（按负责人要求，确认后再提交）。**
