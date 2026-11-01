#!/usr/bin/env python3
"""Apply the prepared Judge scheduling configuration after deploy-prebuilt.sh.

No dependencies are installed and no images or UI assets are built.  Config is
parsed by the running Judge's existing js-yaml dependency.  Its bind-mounted
source file is updated in place so the container keeps the same inode.
"""
import base64
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

DEPLOY_ROOT = '/www/hydro-tibor'
HYDRO_CONTAINER = 'hydro-dev-hydro-emergency'
CONFIG_DESTINATION = '/root/.hydro/judge.yaml'
CONNECT_TIMEOUT = 60

# This program receives configuration only on stdin and returns it only to the
# parent process's captured stdout.  Errors deliberately omit YAML/parser text,
# which could otherwise contain account passwords.
NODE_CONFIG = r'''
const fs = require('fs');
const crypto = require('crypto');
const childProcess = require('child_process');
const { createRequire } = require('module');
const { deserialize, serialize } = require('v8');
const { isDeepStrictEqual } = require('util');
try {
  const executable = fs.realpathSync(childProcess.execFileSync('which', ['hydrojudge'], { encoding: 'utf8' }).trim());
  const yaml = createRequire(executable)('js-yaml');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const raw = input.mode === 'inspect'
    ? fs.readFileSync('/root/.hydro/judge.yaml') : Buffer.from(input.rawBase64, 'base64');
  const config = yaml.load(raw.toString('utf8'));
  const plain = value => value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
  if (!plain(config) || !plain(config.hosts)) throw new Error();
  const rate = config.rate === undefined ? 1 : config.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error();
  const executionConcurrency = config.concurrency || config.parallelism || 2;
  if (typeof executionConcurrency !== 'number' || !Number.isInteger(executionConcurrency) || executionConcurrency !== 2) throw new Error();
  const hydroHosts = [];
  for (const [name, host] of Object.entries(config.hosts)) {
    if (!plain(host) || (host.type !== undefined && !['hydro', 'vj4'].includes(host.type))) throw new Error();
    if (host.type === 'vj4') continue;
    if (typeof host.server_url !== 'string') throw new Error();
    const url = new URL(host.server_url);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
    hydroHosts.push(name);
  }
  if (!hydroHosts.length) throw new Error();
  const before = deserialize(serialize(config));
  const changed = config.concurrency !== 2 || config.singleTaskParallelism !== 1
    || hydroHosts.some(name => config.hosts[name].concurrency !== 2);
  config.concurrency = 2;
  config.singleTaskParallelism = 1;
  for (const name of hydroHosts) config.hosts[name].concurrency = 2;
  const desired = changed ? Buffer.from(yaml.dump(config, { noRefs: true, lineWidth: 120 }), 'utf8') : raw;
  const parsed = yaml.load(desired.toString('utf8'));
  const comparable = value => {
    const copy = deserialize(serialize(value));
    delete copy.concurrency;
    delete copy.singleTaskParallelism;
    for (const name of hydroHosts) delete copy.hosts[name].concurrency;
    return copy;
  };
  if (!isDeepStrictEqual(comparable(before), comparable(parsed))) throw new Error();
  if (parsed.concurrency !== 2 || parsed.singleTaskParallelism !== 1
    || hydroHosts.some(name => parsed.hosts[name].concurrency !== 2)) throw new Error();
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  process.stdout.write(JSON.stringify({
    sha256: digest(raw), changed, desiredSHA256: digest(desired),
    desiredBase64: desired.toString('base64'), hydroHosts: hydroHosts.length,
  }));
} catch (_) {
  process.stderr.write('Judge configuration validation failed. Configuration content is not printed.\n');
  process.exitCode = 1;
}
'''

HYDRO_HEALTH = r'''
const q = require('http').get({ host: '127.0.0.1', port: 8888, path: '/login' },
  response => { response.resume(); process.exit(response.statusCode === 200 ? 0 : 1); });
q.setTimeout(2000, () => q.destroy());
q.on('error', () => process.exit(1));
'''


class DeploymentError(Exception):
    pass


def run_command(args, input_data=None, timeout=15):
    if isinstance(input_data, str):
        input_data = input_data.encode('utf-8')
    try:
        result = subprocess.run(args, input=input_data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise DeploymentError('检查命令失败或超时，未输出配置内容。')
    if result.returncode:
        raise DeploymentError('检查命令失败，未输出配置内容。')
    output = result.stdout + result.stderr if args[:2] == ['docker', 'logs'] else result.stdout
    return output.decode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def container_value(runner, container, template, timeout=10):
    return runner(['docker', 'inspect', '-f', template, container], timeout=timeout).strip()


def hydro_healthy(runner):
    if container_value(runner, HYDRO_CONTAINER, '{{.State.Running}}') != 'true':
        raise DeploymentError('Hydro 未运行，停止调整 Judge。')
    try:
        runner(['docker', 'exec', HYDRO_CONTAINER, 'node', '-e', HYDRO_HEALTH], timeout=5)
    except DeploymentError:
        raise DeploymentError('Hydro 尚未健康，停止调整 Judge。')


def judge_config(runner, judge, raw=None):
    payload = {'mode': 'inspect'} if raw is None else {
        'mode': 'transform', 'rawBase64': base64.b64encode(raw).decode('ascii'),
    }
    output = runner(['docker', 'exec', '-i', judge, 'node', '-e', NODE_CONFIG],
                    input_data=json.dumps(payload), timeout=15)
    try:
        value = json.loads(output)
        if not isinstance(value, dict) or not re.fullmatch(r'[0-9a-f]{64}', value.get('sha256', '')):
            raise ValueError()
        return value
    except (TypeError, ValueError):
        raise DeploymentError('Judge 配置验证结果无效，未输出配置内容。')


def identify_judge(runner, root):
    names = runner(['docker', 'ps', '-a', '--filter', 'label=com.docker.compose.service=judge',
                    '--format', '{{.Names}}']).splitlines()
    names = [name.strip() for name in names if name.strip()]
    if not names:
        names = [name.strip() for name in runner(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
                 if re.search(r'(^|[-_])judge([-_]|$)', name.strip())]
    if len(names) != 1:
        raise DeploymentError('无法唯一识别 Judge 容器，未修改配置。')
    judge = names[0]
    if container_value(runner, judge, '{{.State.Running}}') != 'true':
        raise DeploymentError('Judge 未运行，未修改配置。')
    try:
        mounts = json.loads(container_value(runner, judge, '{{json .Mounts}}'))
    except (ValueError, TypeError):
        raise DeploymentError('无法检查 Judge 配置挂载，未修改配置。')
    matches = [mount for mount in mounts if mount.get('Destination') == CONFIG_DESTINATION]
    config_path = root / 'docker' / 'judge' / 'judge.yaml'
    if len(matches) != 1 or matches[0].get('Type') != 'bind':
        raise DeploymentError('Judge 配置不是唯一的文件绑定，未修改配置。')
    source = Path(matches[0].get('Source', ''))
    if source != config_path or source.resolve() != config_path:
        raise DeploymentError('Judge 配置挂载路径不符合预期，未修改配置。')
    try:
        if not stat.S_ISREG(os.lstat(str(config_path)).st_mode):
            raise DeploymentError('Judge 配置必须是普通文件，未修改配置。')
    except OSError:
        raise DeploymentError('无法读取 Judge 配置文件。')
    return judge, config_path


def same_inode(config_path, handle):
    current = os.stat(str(config_path))
    opened = os.fstat(handle.fileno())
    return (current.st_dev, current.st_ino) == (opened.st_dev, opened.st_ino)


def replace_contents(handle, raw):
    handle.seek(0)
    written = handle.write(raw)
    if written != len(raw):
        raise DeploymentError('Judge 配置未完整写入。')
    handle.truncate()
    handle.flush()
    os.fsync(handle.fileno())


def private_backup(raw, expected, directory=None):
    directory = Path(directory) if directory else Path.home() / '.hydro' / 'judge-scheduling-backups'
    os.makedirs(str(directory), mode=0o700, exist_ok=True)
    info = os.lstat(str(directory))
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid():
        raise DeploymentError('备份目录不是当前用户拥有的普通目录，未修改配置。')
    os.chmod(str(directory), 0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target = directory / ('judge-before-{}-{}-{}.yaml'.format(expected[:12], stamp, os.getpid()))
    fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    return target


def restart_judge(runner, judge, sleeper, clock):
    before = container_value(runner, judge, '{{.State.StartedAt}}')
    runner(['docker', 'restart', judge], timeout=30)
    since = container_value(runner, judge, '{{.State.StartedAt}}')
    if not since or since == before:
        raise DeploymentError('Judge 尚未确认重启。')
    deadline = clock() + CONNECT_TIMEOUT
    connected = re.compile(r'已连接|(?:^|\s)connected(?:\s|$)', re.IGNORECASE | re.MULTILINE)
    while clock() < deadline:
        remaining = max(0.1, deadline - clock())
        running = container_value(runner, judge, '{{.State.Running}}', timeout=min(5, remaining)) == 'true'
        remaining = max(0.1, deadline - clock())
        logs = runner(['docker', 'logs', '--since=' + since, judge], timeout=min(5, remaining))
        if running and connected.search(logs):
            hydro_healthy(runner)
            return
        sleeper(min(2, max(0, deadline - clock())))
    raise DeploymentError('60 秒内未确认 Judge 重新连接。')


def deploy(expected, runner=run_command, backup_directory=None, sleeper=time.sleep, clock=time.monotonic):
    if not re.fullmatch(r'[0-9a-f]{40}', expected):
        raise DeploymentError('请提供完整的 40 位小写提交 SHA。')
    root = Path(DEPLOY_ROOT)
    if Path.cwd().resolve() != root or Path(runner(['git', 'rev-parse', '--show-toplevel']).strip()).resolve() != root:
        raise DeploymentError('请在 /www/hydro-tibor 中执行此命令。')
    if runner(['git', 'branch', '--show-current']).strip() != 'master':
        raise DeploymentError('当前分支不是 master，未修改配置。')
    if runner(['git', 'rev-parse', 'HEAD']).strip() != expected:
        raise DeploymentError('当前代码不是预期提交，请先运行预构建部署脚本。')
    hydro_healthy(runner)
    judge, config_path = identify_judge(runner, root)
    flags = os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0)
    try:
        fd = os.open(str(config_path), flags)
        handle = os.fdopen(fd, 'r+b')
    except OSError:
        raise DeploymentError('无法打开 Judge 配置，未修改配置。')
    with handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise DeploymentError('另一个配置更新正在执行，请稍后重试。')
        original = handle.read()
        original_hash = digest(original)
        prepared = judge_config(runner, judge, original)
        if prepared['sha256'] != original_hash or judge_config(runner, judge)['sha256'] != original_hash:
            raise DeploymentError('配置文件与容器读取内容不同，未修改配置。')
        if not prepared.get('changed'):
            restart_judge(runner, judge, sleeper, clock)
            print('Judge 调度配置已符合要求，无需再次写入；已重启并确认 Judge 重连。')
            return None
        try:
            desired = base64.b64decode(prepared['desiredBase64'], validate=True)
            desired_hash = prepared['desiredSHA256']
            if not desired or digest(desired) != desired_hash:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise DeploymentError('准备的配置无效，未修改原文件。')
        backup = private_backup(original, expected, backup_directory)
        mutation_started = False
        try:
            handle.seek(0)
            if not same_inode(config_path, handle) or digest(handle.read()) != original_hash:
                raise DeploymentError('准备期间配置发生变化，未覆盖新内容。')
            hydro_healthy(runner)
            mutation_started = True
            replace_contents(handle, desired)
            if not same_inode(config_path, handle) or judge_config(runner, judge)['sha256'] != desired_hash:
                raise DeploymentError('容器未读到更新后的配置。')
            restart_judge(runner, judge, sleeper, clock)
        except Exception:
            if not mutation_started:
                raise DeploymentError('写入前检查失败，未修改配置；备份已保留：{}'.format(backup))
            try:
                if not same_inode(config_path, handle):
                    raise DeploymentError('配置文件已被其他操作替换。')
                replace_contents(handle, original)
                if judge_config(runner, judge)['sha256'] != original_hash:
                    raise DeploymentError('无法确认备份已恢复。')
                restart_judge(runner, judge, sleeper, clock)
            except Exception:
                raise DeploymentError('配置更新失败，自动恢复未确认成功。请使用私有备份检查恢复：{}'.format(backup))
            raise DeploymentError('配置更新失败，原配置已恢复并确认 Judge 重连；备份：{}'.format(backup))
        print('Judge 已重连：同时处理 2 份提交，每份同时执行 1 个测试点，总执行并发保持 2。')
        print('原配置私有备份：{}'.format(backup))
        return backup


def main():
    try:
        if len(sys.argv) != 2:
            raise DeploymentError('用法：python3 docker/tune-judge-scheduling.py 完整提交SHA')
        deploy(sys.argv[1])
        return 0
    except Exception as error:
        # Never print subprocess output or parser errors: they can contain YAML secrets.
        message = str(error) if isinstance(error, DeploymentError) else '调整失败，未输出配置内容；请检查文件权限与容器状态。'
        print('已停止：' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
