# Hydro-tibor 最终交接文档（给 Codex 接手用）

## 一、当前总进度

当前总进度约 **75%**。

已经完成：

1. 阿里云服务器部署 Hydro-tibor 基础环境；
2. 服务器已从 2GB 升级到 4GB；
3. ClassFlow 与 Hydro 同机运行；
4. Hydro Web 已跑通；
5. Mongo 已跑通；
6. badge 插件已加载；
7. 轻量 judge 已跑通；
8. P1000 判题已验证成功；
9. 题库页工具条样式已用服务器 inline hotfix 临时修复；
10. 服务器当前可以通过 IP / 宝塔反代访问 Hydro。

未完成：

1. 正式域名备案/接入备案；
2. 旧 Mongo 数据导入；
3. 旧文件体 `/data/file/hydro` 恢复；
4. `hydro-home.tar.gz` 中 static 等资源恢复；
5. 迁移后 judge 用户重建/校验；
6. 迁移后 P1001 或真实旧题 AC/WA 验证；
7. 正式开放给学生使用。

## 二、关键背景

这是 Hydro-tibor 项目，用于 OJ / 题库 / 学员训练。

当前服务器同时运行：

- ClassFlow
- 宝塔
- Nginx
- MySQL
- Hydro Web
- Mongo
- Judge

ClassFlow 是现有业务，不能被 Hydro 部署影响。

之前服务器 2GB 时，Hydro 构建导致 ClassFlow 卡死；后来升到 4GB，但仍然不适合在服务器上做重型 build。

重要原则：

- 服务器只运行，不做重型构建。
- 前端 public 产物应该在本地构建后上传服务器替换。
- 不要在服务器上执行 `docker compose up -d --build`。
- 不要在服务器上跑 `build:ui:production`。
- 不要在服务器上跑重型 `yarn install`。

## 三、路径信息

本地项目路径：

- `/Users/tangbo/Desktop/hydro-tibor`

服务器项目路径：

- `/www/hydro-tibor`

ClassFlow 路径：

- `/www/wwwroot/classflow`

Hydro public 路径：

- `/www/hydro-tibor/packages/ui-default/public`

Hydro 模板路径：

- `/www/hydro-tibor/packages/ui-default/templates`

关键 Docker 文件：

- `/www/hydro-tibor/docker-compose.yml`
- `/www/hydro-tibor/docker-compose.judge.yml`
- `/www/hydro-tibor/docker-compose.judge-lite.yml`

Judge 文件：

- `/www/hydro-tibor/docker/judge/Dockerfile.lite`
- `/www/hydro-tibor/docker/judge/judge.yaml`
- `/www/hydro-tibor/docker/judge/mount.yaml`

备份目录：

- `/root/hydro-deploy-backup`

## 四、当前 Docker 服务状态

当前服务：

- `hydro-dev-hydro-1`
- `hydro-dev-mongo-1`
- `hydro-dev-judge-1`

端口：

- Hydro Web：宿主机 `127.0.0.1:8888`
- Mongo：Docker 内部使用，不对公网开放
- Judge：不暴露端口
- ClassFlow：`5050`
- Nginx：`80 / 443`
- 宝塔面板：`40404`

常用检查命令：

```bash
cd /www/hydro-tibor

docker compose ps

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml ps

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/p
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/ranking

free -h
docker stats --no-stream
```

## 五、服务器资源与限制

- 服务器已升级为 **2核 4GB**。
- 升级费用约 **278 元**，剩余 **11 个月**，约 **25 元/月**。
- 4GB 对运行有帮助，但仍不适合现场构建 Hydro / Judge 完整镜像。

服务器曾经因为以下操作卡住 ClassFlow：

- `docker compose up -d --build`
- `yarn install`
- `build:ui:production`
- 完整 judge build，尤其 apt-get 安装 ghc/rust/mono/go/ruby 等重语言环境。

严格禁止：

- `docker compose down -v`
- `docker system prune`
- `docker system prune -a --volumes`
- `rm -rf` 数据目录
- 删除 Docker volume
- 无备份导入数据
- 服务器上重型 build

## 六、Web + Mongo + badge 状态

- Hydro Web 已正常启动。
- Mongo 已 healthy。
- badge 插件已加载。

验证结果曾经是：

- `/` -> `200`
- `/p` -> `200`
- `/ranking` -> `200`
- `/mybadge` -> `302`

badge 插件日志中出现过：

- `Model init: /workspace/addons/badge-for-hydrooj`
- `apply plugin addons/badge-for-hydrooj/index.ts`
- `Template init: /workspace/addons/badge-for-hydrooj`

注意：

- `module require via hydrooj/src/model/user is deprecated` 是警告，不是当前阻断错误。

## 七、轻量 judge 最终方案

官方完整 judge 太重，会安装：

- gcc
- python3
- g++
- fp-compiler
- openjdk
- php
- rustc
- ghc
- golang
- ruby
- mono

服务器构建完整 judge 卡在 ghc 下载，耗时超过 40 分钟，不适合继续。

最终采用轻量 judge：

只保留：

- gcc
- g++
- python3
- ca-certificates
- wget
- pm2
- @hydrooj/hydrojudge
- go-judge sandbox

删除：

- fp-compiler
- openjdk
- php
- rustc
- ghc
- golang
- ruby
- mono

当前轻量 judge 主要支持：

- Python 3
- C / C++

## 八、轻量 judge Dockerfile 关键内容

当前 `Dockerfile.lite` 核心逻辑：

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

重要坑：

- 一开始用 `go-judge v1.9.4`，会触发：
  - `Your sandbox version is vulnerable to symlink escape issue, please upgrade!`
- hydrojudge 会不消费任务。
- 已升级到 `v1.12.0` 后解决。

## 九、judge.yaml 关键坑

一开始错误写法是：

```yaml
server_url: http://hydro:8888/
uname: judge
password: xxx
```

这是错误的，因为 hydrojudge 源码 `daemon.ts` 读取的是：

```ts
const _hosts = getConfig('hosts');
```

所以必须写成 `hosts` 结构。

正确结构：

```yaml
hosts:
  local:
    type: hydro
    server_url: http://hydro:8888/
    uname: judge
    password: <secret>
    concurrency: 1
```

当前路径：

- `/www/hydro-tibor/docker/judge/judge.yaml`

注意：

- `judge.yaml` 不允许提交 Git。
- 密码不能写入交接文档。
- 如果旧数据导入后覆盖了 judge 用户，需要重新创建 judge 用户并 `setJudge`，同时保证 `judge.yaml` 密码一致。

## 十、judge 验证过程和结论

最终 P1000 判题已经成功。

关键验证命令：

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml ps

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml exec judge sh -lc 'pm2 list'
```

应看到：

- `sandbox online`
- `hydrojudge online`

P1000 测试代码（Python 3）：

```python
a, b = map(int, input().split())
print(a + b)
```

判断是否消费任务：

```bash
docker compose exec mongo mongosh hydro --quiet --eval '
db.record.find({}, {_id:1,status:1,lang:1,pid:1,score:1,judgeTexts:1,compilerTexts:1}).sort({_id:-1}).limit(5).toArray()
'
```

如果 `status` 一直是 `0`，说明 Waiting，judge 没消费任务。
最终已经调通，不再是 Waiting。

## 十一、admin / judge 用户说明

- 空系统里创建过临时 admin 用户用于测试。
- 空系统里创建过 judge 用户，uid 曾经是 3，并执行过 `setJudge`。

但是正式导入旧 Mongo 时，如果使用 `mongorestore --drop`，会覆盖当前空系统数据。

所以导入旧数据后：

1. 当前 admin 可能消失；
2. 当前 judge 用户可能消失；
3. 需要重新检查旧数据里是否有 judge；
4. 如果没有，需要重新创建 judge 用户并 `setJudge`；
5. `judge.yaml` 密码必须和数据库中的 judge 用户密码一致。

## 十二、题库页工具条样式问题

问题表现：

- 服务器上 `/p` 题库页中，“1道题 / 默认排序 / 搜索按钮”挤在一起。
- 本地 Mac 的 8888 页面是正常的。
- 服务器替换 public 后仍然不完全正常。
- 直接追加 theme CSS 没生效。
- 后来通过在服务器模板 `problem_main.html` 里插入 inline style 热修复解决。

真实服务器 HTML 结构：

```html
<form method="get" id="searchForm" action="/p">
  <div class="ui-v2-problem-toolbar">
    <div class="search">
      <input name="q" type="text" value="" placeholder="搜索">
      <div data-fragment-id="problem_stat" class="ui-v2-problem-stat">
        <p>1 道题</p>
      </div>
      <select name="sort" class="search-sort">...</select>
      <button type="submit">...</button>
    </div>
  </div>
</form>
```

最终临时热修复：

在服务器文件：

- `/www/hydro-tibor/packages/ui-default/templates/problem_main.html`

插入了：

- `<style id="hotfix-problem-toolbar-inline"> ... </style>`

marker：

- `hotfix-problem-toolbar-inline`

备份文件在：

- `/root/hydro-deploy-backup/problem_main-before-inline-toolbar-hotfix-*.html`

注意：

- 这是服务器临时 hotfix。
- 后续正式应该回收到源码的 `ui-v2-foundation.styl` 或模板里，并重新构建 public。
- 但在正式数据迁移前，不建议继续大改。

## 十三、前端 public 更新流程

标准流程：本地构建，不在服务器构建。

本地：

```bash
cd /Users/tangbo/Desktop/hydro-tibor
git checkout master
git pull --ff-only origin master
corepack yarn install --inline-builds
corepack yarn build:ui:production
```

检查：

```bash
find packages/ui-default/public \( -name 'default.theme.js' -o -name 'default-api_ts*.js' \) -type f -print0 \
  | xargs -0 grep -n "module.hot.data" \
  | head -20 || true
```

无输出才是合格。

打包：

```bash
tar -czf ~/Desktop/hydro-public-assets-latest.tar.gz -C packages/ui-default public
```

上传到服务器：

- `/www/hydro-tibor/hydro-public-assets-latest.tar.gz`

服务器替换：

```bash
cd /www/hydro-tibor
mkdir -p /root/hydro-deploy-backup
tar -czf /root/hydro-deploy-backup/public-before-latest-replace-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C packages/ui-default public 2>/dev/null || true
rm -rf packages/ui-default/public
tar -xzf hydro-public-assets-latest.tar.gz -C packages/ui-default
docker compose restart hydro
```

禁止：

- 不要 `docker compose up -d --build`。
- 不要在服务器 build。

## 十四、域名和备案问题

- `onebyone.run` 是腾讯云个人备案。
- 解析到阿里云中国内地服务器会被阿里云拦截，提示备案状态不符合访问要求。
- 原因是域名备案未接入阿里云。

解决方式：

- 方案 A：`onebyone.run` 做阿里云新增接入备案；
- 方案 B：使用已经在阿里云备案接入的域名；
- 方案 C：临时用 IP 访问。

当前临时可用：

- `http://8.147.68.249`

注意：

- 如果用 IP 访问，需要宝塔 Nginx 反代的 `server_name` / 域名管理里包含 IP，否则 Host 不匹配。
- 之前 `curl http://127.0.0.1/p` 404，是因为没有带 Host，不代表 `onebyone.run` 反代一定坏。
- 测试域名反代时要用：

```bash
curl -H "Host: onebyone.run" http://127.0.0.1/p
```

## 十五、宝塔 / Nginx 反代说明

- Hydro 只监听：`127.0.0.1:8888`。
- 公网访问依赖宝塔 Nginx 反向代理。

反代配置：

- 代理目录：`/`
- 目标 URL：`http://127.0.0.1:8888`
- 发送域名：`$host`
- WebSocket：开启
- 缓存：关闭

如果通过 IP 访问，要确保宝塔反代项目绑定：

- `8.147.68.249`

否则访问 `http://8.147.68.249/p` 可能不会命中 Hydro。

## 十六、旧数据迁移暂缓

当前用户明确决定：

- 先不导入数据。
- 等域名备案/访问方式解决后，再导入旧数据。

正式迁移需要的文件：

- `hydro-mongo.archive.gz`
- `hydro-home.tar.gz`
- `hydro.zip`

作用：

- `hydro-mongo.archive.gz`：旧 Mongo 数据
- `hydro.zip`：`/data/file/hydro` 文件体
- `hydro-home.tar.gz`：static 等补充资源

正式迁移不能只导 Mongo，必须同步恢复文件体，否则：

- 题目附件
- 测试数据
- 头像
- 图片
- 样例文件

都会异常。

## 十七、正式数据迁移步骤摘要

1. 上传备份文件到 `/www/hydro-tibor/migration-import`；
2. 备份当前空库；
3. 备份当前 `/data/hydro` 和 `/data/file`；
4. 恢复 `hydro.zip` 到 `/data/file/hydro`；
5. 恢复 `hydro-home.tar.gz` 中 `.hydro/static`；
6. 停止 hydro，保留 mongo；
7. `mongorestore --gzip --archive --drop`；
8. 启动 hydro；
9. 验证 `/`、`/p`、`/ranking`、`/mybadge`；
10. 登录旧账号；
11. 检查题库、题面、附件、头像、样例；
12. 检查 badge；
13. 检查 judge 用户；
14. 重新跑 P1001 或旧题 AC/WA；
15. 确认无误后再开放使用。

## 十八、正式迁移注意事项

导入旧 Mongo 会覆盖当前空系统：

- admin 用户
- judge 用户
- P1000 提交记录
- badge 空系统状态

导入后必须重新验证：

```js
db.user.find({uname:"judge"})
db.badge.countDocuments()
db.userBadge.countDocuments()
db.storage.countDocuments()
db.record.countDocuments()
db.document.countDocuments()
```

如果 judge 用户不存在，需要重新创建并 `setJudge`。

## 十九、不能做的事

- 不要 `docker compose down -v`
- 不要 `docker system prune`
- 不要 `docker system prune -a --volumes`
- 不要删除 Docker volume
- 不要 `rm -rf /data/file/hydro`
- 不要 `rm -rf /data/hydro`
- 不要服务器 build
- 不要服务器 `yarn install`
- 不要服务器 `build:ui:production`
- 不要提交 `.env`
- 不要提交 `judge.yaml`
- 不要提交 tar 包
- 不要把密码写入文档
- 不要在未备份前导旧数据
- 不要在 ClassFlow 高峰期做迁移
- 不要释放/重置服务器

## 二十、当前建议下一步

1. 先保留当前可运行状态；
2. 把域名备案/接入备案问题解决；
3. 把 `onebyone.run` 接入阿里云备案，或者确定其它正式域名；
4. 备案前不要正式开放给学生；
5. 等域名稳定后再导入旧数据；
6. 导入后重新验证 judge；
7. 最后再开放。

## 二十一、给 Codex 的工作方式建议

后续给 Codex 任务时，要遵守：

1. 每次先只读检查；
2. 明确不能 `down -v`；
3. 明确不能 `system prune`；
4. 明确不能服务器 build；
5. 明确不能动 ClassFlow；
6. 涉及数据迁移必须先备份；
7. 每次改动后输出：
   - 当前目录
   - 当前分支
   - git status
   - 修改文件
   - 是否动 Docker
   - 是否动 Mongo
   - 是否动 judge
   - 是否动 ClassFlow
   - 验证命令和结果
   - 是否建议继续
8. 每次阶段汇报要包含总进度百分比。

## 二十二、当前成功状态验收命令

```bash
cd /www/hydro-tibor

docker compose ps

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml ps

curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/p
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/ranking
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/mybadge

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml exec judge sh -lc 'pm2 list'

free -h
docker stats --no-stream
```

## 二十三、Git 提交要求

请只新增/更新 `FINAL_CODEX_HANDOFF.md`。

不要提交：

- `hydro-public-assets-latest.tar.gz`
- `.env`
- `judge.yaml`
- Docker volume
- 任何密码
- 任何 token
- 任何私钥

如果文档写完后，先不要提交，输出：

1. 当前分支
2. `git status --short`
3. 是否只新增/修改 `FINAL_CODEX_HANDOFF.md`
4. 是否包含敏感信息
5. 文档目录结构
6. 是否建议提交

等用户确认后再提交。
