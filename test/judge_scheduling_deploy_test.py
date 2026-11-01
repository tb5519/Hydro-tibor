import base64
import contextlib
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('judge_scheduling', str(ROOT / 'docker' / 'tune-judge-scheduling.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
SHA = 'a' * 40
SECRET = 'DO_NOT_PRINT_JUDGE_PASSWORD'
CONFIG = ('''# Keep credentials and unrelated settings
rate: 1.25
concurrency: 2
parallelism: 7
memoryMax: 768m
hosts:
  local:
    type: hydro
    server_url: https://judge.example.test/
    uname: private-judge
    password: %s
    concurrency: 1
  other:
    type: vj4
    server_url: https://other.example.test/
    concurrency: 5
tracing:
  samplePercentage: 0
''' % SECRET).encode('utf-8')


class FakeDocker:
    def __init__(self, root):
        self.root = root
        self.path = root / 'docker' / 'judge' / 'judge.yaml'
        self.original = self.path.read_bytes()
        self.calls = []
        self.restarts = 0
        self.started = 0
        self.time = 0
        self.multiple = False
        self.foreign_mount = False
        self.fail_restart_once = False
        self.fail_restart_always = False
        self.fail_first_connection = False
        self.stale_once = False
        self.inspections = 0

    def clock(self):
        return self.time

    def sleep(self, seconds):
        self.time += seconds

    def __call__(self, args, input_data=None, timeout=15):
        self.calls.append(list(args))
        if args[0] == 'git':
            if args[1:] == ['rev-parse', '--show-toplevel']:
                return str(self.root)
            if args[1:] == ['branch', '--show-current']:
                return 'master'
            if args[1:] == ['rev-parse', 'HEAD']:
                return SHA
        if args[:3] == ['docker', 'ps', '-a']:
            return 'hydro-dev-judge-1\nother-judge-1\n' if self.multiple else 'hydro-dev-judge-1\n'
        if args[:3] == ['docker', 'inspect', '-f']:
            if args[3] == '{{.State.Running}}':
                return 'true'
            if args[3] == '{{.State.StartedAt}}':
                return '2026-11-01T00:00:{:02d}.000000000Z'.format(self.started)
            if args[3] == '{{json .Mounts}}':
                return json.dumps([{'Type': 'bind', 'Source': '/different/config.yaml' if self.foreign_mount else str(self.path),
                                    'Destination': helper.CONFIG_DESTINATION, 'RW': False}])
        if args[:3] == ['docker', 'exec', helper.HYDRO_CONTAINER]:
            return ''
        if args[:3] == ['docker', 'exec', '-i']:
            payload = json.loads(input_data)
            if payload['mode'] == 'inspect':
                self.inspections += 1
                raw = self.path.read_bytes()
                if self.stale_once and self.inspections == 2:
                    raw = self.original
                payload = {'mode': 'transform', 'rawBase64': base64.b64encode(raw).decode('ascii')}
            return helper.run_command(['node', '-e', helper.NODE_CONFIG], json.dumps(payload), timeout=timeout)
        if args[:2] == ['docker', 'restart']:
            self.restarts += 1
            if self.fail_restart_always or (self.fail_restart_once and self.restarts == 1):
                raise helper.DeploymentError('Judge restart failed')
            self.started += 1
            return 'hydro-dev-judge-1\n'
        if args[:2] == ['docker', 'logs']:
            if self.fail_first_connection and self.started == 1:
                return ''
            return '2026-11-01 INFO connected to Hydro\n'
        raise AssertionError('Unexpected command: ' + repr(args))


class JudgeSchedulingDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='judge-scheduling-test-')
        self.root = Path(self.temp.name).resolve()
        self.path = self.root / 'docker' / 'judge' / 'judge.yaml'
        self.path.parent.mkdir(parents=True)
        self.path.write_bytes(CONFIG)
        self.path.chmod(0o600)
        self.backups = self.root / 'private-backups'
        self.old_cwd = Path.cwd()
        os.chdir(str(self.root))
        self.path_patch = mock.patch.dict(os.environ, {'PATH': str(ROOT / 'node_modules' / '.bin') + os.pathsep + os.environ['PATH']})
        self.path_patch.start()
        self.root_patch = mock.patch.object(helper, 'DEPLOY_ROOT', str(self.root))
        self.root_patch.start()
        self.fake = FakeDocker(self.root)

    def tearDown(self):
        self.root_patch.stop()
        self.path_patch.stop()
        os.chdir(str(self.old_cwd))
        self.temp.cleanup()

    def deploy(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            result = helper.deploy(SHA, self.fake, self.backups, self.fake.sleep, self.fake.clock)
        self.assertNotIn(SECRET, output.getvalue())
        return result

    def parsed(self):
        script = 'const fs=require("fs"),yaml=require(process.argv[1]);process.stdout.write(JSON.stringify(yaml.load(fs.readFileSync(0,"utf8"))));'
        return json.loads(helper.run_command(['node', '-e', script, str(ROOT / 'node_modules' / 'js-yaml')], self.path.read_bytes()))

    def test_changes_only_scheduling_and_preserves_bind_inode_and_private_backup(self):
        inode = self.path.stat().st_ino
        backup = self.deploy()
        config = self.parsed()
        self.assertEqual(config['concurrency'], 2)
        self.assertEqual(config['singleTaskParallelism'], 1)
        self.assertEqual(config['hosts']['local']['concurrency'], 2)
        self.assertEqual(config['hosts']['local']['password'], SECRET)
        self.assertEqual(config['hosts']['other']['concurrency'], 5)
        self.assertEqual(config['rate'], 1.25)
        self.assertEqual(config['parallelism'], 7)
        self.assertEqual(config['memoryMax'], '768m')
        self.assertEqual(self.path.stat().st_ino, inode)
        self.assertEqual(backup.read_bytes(), CONFIG)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(backup.parent.stat().st_mode), 0o700)
        self.assertEqual(self.fake.restarts, 1)
        self.assertTrue(all(call[:2] != ['docker', 'update'] for call in self.fake.calls))

    def test_second_run_keeps_bytes_and_backup_but_confirms_runtime_by_restart(self):
        self.deploy()
        before = self.path.read_bytes()
        inode = self.path.stat().st_ino
        self.assertIsNone(self.deploy())
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.path.stat().st_ino, inode)
        self.assertEqual(self.fake.restarts, 2)
        self.assertEqual(len(list(self.backups.iterdir())), 1)

    def test_invalid_rates_and_hosts_never_write_or_expose_yaml(self):
        for raw in [CONFIG.replace(b'rate: 1.25', b'rate: 0'), CONFIG.replace(b'rate: 1.25', b'rate: .inf'),
                    CONFIG.replace(b'concurrency: 2', b'concurrency: 1'), CONFIG.replace(b'type: hydro', b'type: unknown'),
                    CONFIG.replace(b'https://judge.example.test/', b'not-a-url')]:
            self.path.write_bytes(raw)
            self.fake = FakeDocker(self.root)
            with self.assertRaises(helper.DeploymentError) as caught:
                self.deploy()
            self.assertNotIn(SECRET, str(caught.exception))
            self.assertEqual(self.path.read_bytes(), raw)
            self.assertFalse(self.backups.exists())
            self.assertEqual(self.fake.restarts, 0)

    def test_failed_restart_restores_original_bytes_and_reconnects_without_changing_inode(self):
        inode = self.path.stat().st_ino
        self.fake.fail_restart_once = True
        with self.assertRaisesRegex(helper.DeploymentError, '原配置已恢复并确认 Judge 重连'):
            self.deploy()
        self.assertEqual(self.path.read_bytes(), CONFIG)
        self.assertEqual(self.path.stat().st_ino, inode)
        self.assertEqual(self.fake.restarts, 2)
        self.assertEqual(len(list(self.backups.iterdir())), 1)

    def test_container_readback_failure_rolls_back_before_using_new_config(self):
        self.fake.stale_once = True
        with self.assertRaisesRegex(helper.DeploymentError, '原配置已恢复并确认 Judge 重连'):
            self.deploy()
        self.assertEqual(self.path.read_bytes(), CONFIG)
        self.assertEqual(self.fake.restarts, 1)

    def test_reconnection_timeout_restores_config_and_confirms_old_runtime(self):
        self.fake.fail_first_connection = True
        with self.assertRaisesRegex(helper.DeploymentError, '原配置已恢复并确认 Judge 重连'):
            self.deploy()
        self.assertEqual(self.path.read_bytes(), CONFIG)
        self.assertEqual(self.fake.restarts, 2)
        self.assertGreaterEqual(self.fake.time, 60)

    def test_failed_rollback_is_reported_with_private_backup_without_yaml_contents(self):
        self.fake.fail_restart_always = True
        with self.assertRaisesRegex(helper.DeploymentError, '自动恢复未确认成功') as caught:
            self.deploy()
        self.assertNotIn(SECRET, str(caught.exception))
        self.assertEqual(self.path.read_bytes(), CONFIG)
        self.assertEqual(stat.S_IMODE(next(self.backups.iterdir()).stat().st_mode), 0o600)

    def test_only_docker_log_capture_includes_stderr(self):
        result = subprocess.CompletedProcess([], 0, stdout=b'', stderr=b'connected to Hydro\n')
        with mock.patch.object(helper.subprocess, 'run', return_value=result):
            self.assertIn('connected', helper.run_command(['docker', 'logs', 'judge']))
            self.assertEqual(helper.run_command(['docker', 'exec', 'judge', 'node']), '')

    def test_ambiguous_judge_or_foreign_mount_refuses_without_backup(self):
        for field in ['multiple', 'foreign_mount']:
            self.fake = FakeDocker(self.root)
            setattr(self.fake, field, True)
            with self.assertRaises(helper.DeploymentError):
                self.deploy()
            self.assertEqual(self.path.read_bytes(), CONFIG)
            self.assertFalse(self.backups.exists())
            self.assertEqual(self.fake.restarts, 0)

    def test_config_lock_and_wrong_revision_refuse_before_mutation(self):
        with open(str(self.path), 'r+b') as other:
            fcntl.flock(other.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(helper.DeploymentError, '另一个配置更新'):
                self.deploy()
        with self.assertRaisesRegex(helper.DeploymentError, '当前代码不是预期提交'):
            helper.deploy('b' * 40, self.fake, self.backups, self.fake.sleep, self.fake.clock)
        self.assertEqual(self.path.read_bytes(), CONFIG)
        self.assertFalse(self.backups.exists())


if __name__ == '__main__':
    unittest.main()
