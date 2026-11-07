#!/usr/bin/env bash
# Provision from an image already installed for Judge. Never pull/build images here.
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
hydro="${1:-hydro-dev-hydro-emergency}"
judge="${2:-hydro-dev-judge-1}"
name='hydro-ide-sandbox'
network='hydro-ide-internal'
fail() { echo "在线 IDE 未启动：$*" >&2; exit 1; }
for file in transport.py bootstrap.py turtle.py; do
    test -s "$root/packages/hydrooj/src/lib/ide_runtime/$file" || fail "缺少运行文件 $file"
    git -C "$root" ls-files --error-unmatch "packages/hydrooj/src/lib/ide_runtime/$file" >/dev/null || fail "运行文件 $file 尚未提交"
done
image="$(docker inspect -f '{{.Image}}' "$judge")"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || fail '无法确认现有 Judge 镜像'
docker image inspect "$image" >/dev/null || fail '现有运行镜像不存在'
if docker network inspect "$network" >/dev/null 2>&1; then
    [ "$(docker network inspect -f '{{.Internal}}' "$network")" = true ] || fail 'IDE 网络必须为内部网络'
else
    docker network create --internal --label onebyone.service=ide "$network" >/dev/null
fi
# Only Hydro can reach this API. Student processes get their own isolated net namespace.
if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "$hydro" | grep -q "\"$network\""; then
    docker network connect "$network" "$hydro"
fi
if docker inspect "$name" >/dev/null 2>&1; then
    [ "$(docker inspect -f '{{index .Config.Labels "onebyone.service"}}' "$name")" = ide ] || fail '容器名称已被其他服务占用'
    [ "$(docker inspect -f '{{.Image}}' "$name")" = "$image" ] || fail '已有运行服务的镜像与当前 Judge 不一致，需要先验证升级'
    [ "$(docker inspect -f '{{json .Config.Entrypoint}}' "$name")" = '["/usr/bin/sandbox"]' ] || fail '运行服务入口不符合预期'
    [ "$(docker inspect -f '{{json .Config.Cmd}}' "$name")" = '["-http-addr","0.0.0.0:5050","-mount-conf","/config/mount.yaml","-parallelism","2","-file-timeout","5m"]' ] || fail '运行服务参数不符合预期'
    [ "$(docker inspect -f '{{.HostConfig.CgroupnsMode}}' "$name")" = private ] || fail '运行服务必须使用独立资源命名空间'
    [ "$(docker inspect -f '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{end}}' "$name")" = "$network" ] || fail '运行服务未使用专用内网'
    [ "$(docker inspect -f '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}' "$name")" = '536870912|536870912|600000000|128' ] || fail '运行服务资源限制不符合预期'
    [ "$(docker inspect -f '{{len .HostConfig.PortBindings}}|{{len .Mounts}}|{{len .NetworkSettings.Networks}}' "$name")" = '0|1|1' ] || fail '运行服务存在额外端口、目录挂载或网络'
    [ "$(docker inspect -f '{{range .Mounts}}{{.Source}}|{{.Destination}}|{{.RW}}{{end}}' "$name")" = "$root/docker/ide/mount.yaml|/config/mount.yaml|false" ] || fail '运行服务挂载不符合预期'
    docker start "$name" >/dev/null
else
    docker run -d --name "$name" --label onebyone.service=ide --restart unless-stopped \
        --privileged --cgroupns private --cpus 0.6 --memory 512m --memory-swap 512m --pids-limit 128 \
        --network "$network" --network-alias ide-sandbox \
        --log-opt max-size=10m --log-opt max-file=2 \
        --mount "type=bind,source=$root/docker/ide/mount.yaml,target=/config/mount.yaml,readonly" \
        --entrypoint /usr/bin/sandbox "$image" \
        -http-addr 0.0.0.0:5050 -mount-conf /config/mount.yaml -parallelism 2 -file-timeout 5m >/dev/null
fi
for _ in $(seq 1 20); do
    if docker exec "$hydro" node -e 'fetch("http://ide-sandbox:5050/version",{signal:AbortSignal.timeout(2000)}).then(r=>r.json()).then(v=>process.exit(v.stream?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
        echo '在线 IDE 独立运行服务已就绪：512 MB / 0.6 核，仅内网可达；未构建镜像。'
        exit 0
    fi
    sleep 1
done
fail '服务未就绪，未重启 Hydro 或 Judge'
