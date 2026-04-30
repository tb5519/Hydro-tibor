# Hydro-tibor Codex 接手文档

## 一、项目当前总状态

- 当前已部署到阿里云服务器。
- ClassFlow 与 Hydro 同机运行。
- Hydro Web + Mongo 已成功。
- badge 插件已成功。
- 轻量 judge 已成功。
- P1000 判题已跑通。
- 旧数据还未正式导入。
- `onebyone.run` 因腾讯云备案未接入阿里云，暂不适合绑定阿里云服务器。
- 当前临时使用 IP / 宝塔反代访问。

## 二、关键路径

本地：
- `/Users/tangbo/Desktop/hydro-tibor`

服务器：
- `/www/hydro-tibor`

ClassFlow：
- `/www/wwwroot/classflow`

Hydro public：
- `/www/hydro-tibor/packages/ui-default/public`

Docker：
- `/www/hydro-tibor/docker-compose.yml`
- `/www/hydro-tibor/docker-compose.judge.yml`
- `/www/hydro-tibor/docker-compose.judge-lite.yml`

judge：
- `/www/hydro-tibor/docker/judge/Dockerfile.lite`
- `/www/hydro-tibor/docker/judge/judge.yaml`
- `/www/hydro-tibor/docker/judge/mount.yaml`

## 三、当前 Docker 服务

当前核心容器：
- `hydro-dev-hydro-1`
- `hydro-dev-mongo-1`
- `hydro-dev-judge-1`

当前端口策略：
- Hydro 只监听宿主机 `127.0.0.1:8888`
- Mongo 只在 Docker 内部用
- Judge 不暴露端口
- ClassFlow 用 `5050`
- Nginx 用 `80/443`

## 四、重要限制

- 服务器不要再跑 `docker compose up -d --build`。
- 服务器不要跑 `build:ui:production`。
- 服务器不要跑重型 `yarn install`。
- 服务器不要执行 `docker compose down -v`。
- 服务器不要执行 `docker system prune`。
- 服务器不要删除 volume。
- 不要在 ClassFlow 高峰期做重型操作。
- 前端更新必须：本地构建 `public` -> 上传服务器替换 `public` -> `docker compose restart hydro`。

## 五、前端更新流程

1. 本地 `pull master`。
2. 本地执行 `corepack yarn build:ui:production`（推荐在本地容器内执行）。
3. 检查 `module.hot.data`（确保不是 dev-HMR 产物）。
4. 打包 `hydro-public-assets-latest.tar.gz`。
5. 宝塔上传到 `/www/hydro-tibor`。
6. 服务器先备份旧 `public`。
7. 服务器替换 `packages/ui-default/public`。
8. `docker compose restart hydro`。
9. `curl` 验证 `/`、`/p`、`/ranking`（必要时 `/p/P1001`）。

## 六、轻量 judge 现状

- 官方完整 judge 太重，会安装 ghc/rust/mono/go/ruby 等语言链。
- 服务器现场 build 完整 judge 不可取。
- 当前使用轻量 judge。
- 轻量 judge 只支持 Python / C++。
- `Dockerfile.lite` 删除了 ghc/rust/mono/go/ruby 等重语言。
- 但保留 `pm2`、`@hydrooj/hydrojudge`、`go-judge` sandbox。
- `judge.yaml` 必须使用 `hosts` 结构：

```yaml
hosts:
  local:
    type: hydro
    server_url: http://hydro:8888/
    uname: judge
    password: <secret>
    concurrency: 1
```

## 七、judge 关键坑

1. 顶层 `server_url/uname/password` 是错误结构。
2. 必须放到 `hosts.local` 下面。
3. 旧 `go-judge 1.9.4` 可能触发 symlink escape 警告，hydrojudge 不消费任务。
4. 需要使用更新版本 `go-judge`（例如 `v1.12.0`）。
5. `pm2` 日志有时看不到 hydrojudge 真实输出。
6. `task.status=0` 且 `record.status=0` 表示 judge 没消费任务。
7. `P1000` 可作为最小验证题。

## 八、当前 judge 验证方式

```bash
docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml ps

docker compose -f docker-compose.yml -f docker-compose.judge.yml -f docker-compose.judge-lite.yml exec judge sh -lc 'pm2 list'

docker compose exec mongo mongosh hydro --quiet --eval 'db.record.find({}, {_id:1,status:1,lang:1,pid:1,score:1}).sort({_id:-1}).limit(5).toArray()'
```

## 九、旧数据迁移暂缓

- 当前暂不导入旧数据。
- 等域名/备案/访问方式稳定后再导入。
- 导入旧数据会覆盖空系统 `admin / judge` 用户。
- 导入后需要重新检查 judge 用户。
- 需要恢复 `hydro-mongo.archive.gz`、`hydro.zip`、`hydro-home.tar.gz`。
- 文件体 `/data/file/hydro` 必须和 Mongo `storage` 元数据匹配。
- 不允许只导 Mongo 不恢复文件体。

## 十、正式数据迁移步骤摘要

1. 备份当前空库。
2. 备份当前 `/data/hydro` 和 `/data/file`。
3. 恢复 `hydro.zip` 到 `/data/file/hydro`。
4. 恢复 `hydro-home.tar.gz` 里的 static。
5. 停止 hydro。
6. `mongorestore --drop`。
7. 启动 hydro。
8. 验证题库、头像、附件、样例。
9. 重新确认 judge 用户。
10. `P1001` AC/WA 验证。

## 十一、域名备案说明

- `onebyone.run` 是腾讯云个人备案。
- 解析到阿里云中国内地服务器会被阿里云拦截。
- 需要做阿里云新增接入备案。
- 没完成前不要继续用 `onebyone.run` 正式访问。
- 可以临时用 IP 或已接入阿里云备案的域名。

## 十二、当前不能做的事

- 不要导数据。
- 不要 `down -v`。
- 不要 `system prune`。
- 不要重型 build。
- 不要删除 volume。
- 不要改 ClassFlow。
- 不要在未备份前恢复旧数据。
- 不要把 `.env` / `judge.yaml` / 密码提交 Git。

## 十三、当前建议下一步

1. 先修复服务器 `public` 产物旧样式问题（用本地新构建产物替换）。
2. 确认题库工具条样式正常。
3. 保留当前可判题状态。
4. 等备案或域名方案确定。
5. 再导入旧数据。
