# Hydro-tibor 服务器部署前实机信息收集清单

## 一、当前阶段说明

- 本文只是部署前信息收集清单。
- 当前不连接服务器。
- 当前不部署 Hydro。
- 当前不修改 ClassFlow。
- 当前不修改服务器配置。
- 当前目标是收集服务器现状，为后续部署做准备。

## 二、需要确认的基础信息

- 服务器厂商：阿里云
- 服务器公网 IP
- 操作系统版本
- CPU 核数
- 内存大小
- 磁盘容量
- 剩余磁盘空间
- 当前是否安装 Docker
- 当前是否安装 Docker Compose
- 当前是否安装 Git
- 当前是否安装 Nginx / Caddy / 宝塔
- 当前是否已有 Node / Python / Mongo / Redis
- 当前是否有防火墙 / 安全组限制

## 三、ClassFlow 当前运行情况收集

- ClassFlow 项目目录
- ClassFlow 使用什么方式运行：nohup / pm2 / systemd / 宝塔 / 其他
- ClassFlow 使用哪个端口
- ClassFlow 使用哪个数据库
- ClassFlow 日志在哪里
- ClassFlow 是否有自动重启
- ClassFlow 是否有备份
- ClassFlow 是否由 Nginx / Caddy 反代
- 当前 classflow.top 的反向代理配置在哪里
- 当前 SSL / HTTPS 证书由谁管理
- ClassFlow 当前资源占用情况

## 四、域名与备案信息收集

- classflow.top 当前解析到哪里
- classflow.top 是否公司备案
- onebyone.run 当前解析到哪里
- onebyone.run 当前是否个人备案
- onebyone.run 是否已做阿里云接入备案
- 未来 Hydro 推荐使用 oj.onebyone.run 还是 onebyone.run
- 如果用于公司业务，onebyone.run 个人备案是否需要调整
- 阿里云安全组是否放行 80 / 443
- DNS 是否已经可以添加 oj.onebyone.run

## 五、服务器只读命令清单

以下命令仅用于读取信息，不修改配置、不重启服务、不删除文件、不影响 ClassFlow。后续可按需复制到服务器执行。

### 1) 查看系统

```bash
uname -a
cat /etc/os-release
hostname
whoami
uptime
```

### 2) 查看 CPU / 内存

```bash
nproc
free -h
lscpu | head -40
```

### 3) 查看磁盘

```bash
df -h
lsblk
```

### 4) 查看端口

```bash
ss -lntp
ss -lntp | grep -E ':80|:443|:5050|:8888'
```

### 5) 查看进程

```bash
ps aux --sort=-%mem | head -30
ps aux --sort=-%cpu | head -30
```

### 6) 查看 Docker

```bash
docker --version
docker compose version
docker ps
docker images
docker volume ls
```

### 7) 查看 Git

```bash
git --version
```

### 8) 查看 Nginx / Caddy

```bash
nginx -v
caddy version
systemctl status nginx --no-pager
systemctl status caddy --no-pager
```

> 注意：如果某些命令不存在，提示 `command not found` 也没关系。

### 9) 查看宝塔相关

```bash
ls /www/server 2>/dev/null || true
ps aux | grep -i bt | grep -v grep || true
```

### 10) 查看项目目录

```bash
ls /www
ls /www/wwwroot 2>/dev/null || true
ls /data 2>/dev/null || true
ls /logs 2>/dev/null || true
```

### 11) 查看反向代理配置目录

```bash
ls /etc/nginx 2>/dev/null || true
ls /etc/nginx/conf.d 2>/dev/null || true
ls /etc/caddy 2>/dev/null || true
```

> 注意：不要 `cat` 输出证书私钥；不要输出包含密码的配置文件全文；只列目录和文件名即可。

## 六、一键收集脚本草案

以下仅为草案，放在文档中供后续复制使用。本轮不创建 `.sh` 文件。

建议脚本名：`server_inspection_readonly.sh`

```bash
#!/usr/bin/env bash
set +e

section() {
  printf '\n========== %s ==========\n' "$1"
}

run() {
  local cmd="$1"
  printf '\n$ %s\n' "$cmd"
  bash -lc "$cmd" 2>/dev/null || true
}

section "System"
run "uname -a"
run "cat /etc/os-release"
run "hostname"
run "whoami"
run "uptime"

section "CPU / Memory"
run "nproc"
run "free -h"
run "lscpu | head -40"

section "Disk"
run "df -h"
run "lsblk"

section "Ports"
run "ss -lntp"
run \"ss -lntp | grep -E ':80|:443|:5050|:8888'\"

section "Top Processes"
run "ps aux --sort=-%mem | head -30"
run "ps aux --sort=-%cpu | head -30"

section "Docker"
run "docker --version"
run "docker compose version"
run "docker ps"
run "docker images"
run "docker volume ls"

section "Git"
run "git --version"

section "Nginx / Caddy"
run "nginx -v"
run "caddy version"
run "systemctl status nginx --no-pager"
run "systemctl status caddy --no-pager"

section "BT Panel"
run "ls /www/server"
run "ps aux | grep -i bt | grep -v grep"

section "Project Directories"
run "ls /www"
run "ls /www/wwwroot"
run "ls /data"
run "ls /logs"

section "Reverse Proxy Config Directories"
run "ls /etc/nginx"
run "ls /etc/nginx/conf.d"
run "ls /etc/caddy"

section "Safety Notes"
echo "- This script is readonly and should not modify system state."
echo "- It should not output private keys, .env content, or password files."
echo "- If a command is missing, script continues automatically."
```

## 七、信息回传模板

可按以下模板粘贴服务器执行结果（建议逐项填写）：

```text
[系统版本]
- 内核/系统：
- 主机名：
- 当前用户：
- 运行时长：

[CPU / 内存]
- CPU 核数：
- CPU 型号（可选）：
- 内存总量：
- 当前内存使用概览：

[磁盘]
- 磁盘总量：
- 各分区使用率：
- 剩余空间：

[Docker 状态]
- docker --version：
- docker compose version：
- 容器数量/关键容器：
- 镜像与卷概览：

[Nginx / Caddy / 宝塔状态]
- Nginx：
- Caddy：
- 宝塔：
- 相关服务状态补充：

[ClassFlow 运行信息]
- 项目目录：
- 启动方式（nohup/pm2/systemd/宝塔/其他）：
- 运行端口：
- 使用数据库：
- 日志目录：
- 自动重启机制：
- 备份情况：
- 反向代理与证书管理方式：
- 资源占用概览：

[端口占用]
- 80/443：
- 5050/8888：

[域名解析情况]
- classflow.top：
- onebyone.run：
- 是否可新增 oj.onebyone.run：

[备案情况]
- classflow.top：
- onebyone.run：
- 是否已阿里云接入备案：

[防火墙 / 安全组]
- 安全组 80/443：
- 其他限制说明：

[备注问题]
- 发现的风险或待确认项：
```

## 八、风险提醒

- 当前只是信息收集，不是部署。
- 不要在服务器直接执行 `docker compose down -v`。
- 不要删除 ClassFlow 文件。
- 不要重启 ClassFlow。
- 不要覆盖 Nginx / Caddy 配置。
- 不要输出 `.env`、私钥、数据库密码。
- 不要把服务器私钥提交到 GitHub。
- 不要在未备份前部署 Hydro。
- 不要在未确认资源前启动 judge。

## 九、下一阶段建议

下一阶段是：阶段 3C：根据服务器信息制定实际部署命令（本轮不执行）。

阶段 3C 才会根据服务器信息决定：

- 是否使用 `/www/hydro-tibor`
- 是否使用 Docker named volumes 还是 bind mount
- 是否先部署 Web + Mongo
- 是否暂缓 judge
- 是否使用 `onebyone.run` / `oj.onebyone.run`
- 如何配置 Nginx / Caddy
- 如何备份和回滚
