# Hydro-tibor 项目阶段进度总结

## 一、当前总进度

当前总进度：99%

## 二、当前 master 状态

- master 稳定
- 工作区干净
- 最新 commit：`eec0f602f8366ba43e7c8a0eac142d652317d911`
- 已完成本地 Web + Mongo
- 已完成本地 judge
- 已完成首页安全 Hero
- 尚未服务器部署

## 三、已完成阶段

- 阶段 1：Docker Web + MongoDB 开发环境
- 阶段 2：本地 hydrojudge 接入 + AC/WA 验证
- 阶段 3A：服务器部署预案
- 阶段 3B：服务器实机信息收集清单
- 阶段 4A：UI 改造调研
- 阶段 4B-fix：前端构建模式修复
- 阶段 4C：首页安全 Hero 最小改造

## 四、关键提交记录

`410efd443adae811a97f9065b3eb7a4f1906bf5a`  
chore: add docker development environment

`f5fbffef28aa47781a61676da89a20656e38a962`  
docs: add docker development handoff

`6b9f1811de62502023bbb786e34d36a7bd33795e`  
docs: add hydrojudge integration plan

`27ddc6df30e809392f5fffe246d9a8934258b647`  
merge judge branch

`aba9d01e1794878cfed1d5d641fa5985ed1e192e`  
docs: add server deployment plan

`0c9258218232b40801e9fcb50e68993af7a191a6`  
docs: add server inspection checklist

`273d6b2717b358da55b1ffe85d4a2a19739fd652`  
docs: add UI polish plan

`c217631e1625c7024e55f59bb7f562af96826f2f`  
chore: build production UI assets in Docker dev when needed

`eec0f602f8366ba43e7c8a0eac142d652317d911`  
ui: add safe homepage training hero

## 五、本地启动方式

Web + Mongo：

`docker compose up -d --build`

Web + Mongo + Judge：

`docker compose -f docker-compose.yml -f docker-compose.judge.yml up -d --build`

## 六、已验证能力

- 首页可访问
- 题库页 `/p` 可访问
- 题目详情 `/p/P1000` 可访问
- 静态资源 200
- `module.hot.data` 问题已解决
- judge 可启动
- judge 可认证
- judge 可连接 Hydro
- A+B 正确代码 AC
- A+B 错误代码 WA

## 七、当前重要约束

- 不要提交 `.env`
- 不要提交 `docker/judge/judge.yaml`
- 不要执行 `docker compose down -v`
- 不要执行 `docker system prune -a --volumes`
- 不要直接动服务器
- 不要影响 ClassFlow
- 不要把个人备案 `onebyone.run` 直接用于商业公司业务，除非备案主体处理清楚

## 八、下一阶段建议

阶段 4D：题库页轻量优化

- 只优化 `/p` 页面展示
- 不改评测逻辑
- 不改数据库
- 不改 judge

或者：

阶段 3C：服务器实机信息收集

- 先收集服务器只读信息
- 再决定是否部署

## 九、Cursor / Codex 接手提醒

- 先读 `DOCKER_HANDOFF.md`
- 再读 `JUDGE_RUNBOOK.md`
- 再读 `SERVER_DEPLOYMENT_PLAN.md`
- 再读 `UI_POLISH_PLAN.md`
- 不要直接改业务代码
- 每次改动新建分支
- 小步提交
- 先本地验证再合并 master
