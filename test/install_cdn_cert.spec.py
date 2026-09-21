#!/usr/bin/env python3
"""Offline certificate synchronization tests. No cloud, real credentials or service changes."""
import ast
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'build/assets/install-cdn-cert.py'
spec = importlib.util.spec_from_file_location('install_cdn_cert', str(SOURCE))
cert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cert)


def info(digest='a' * 64, days=90):
    return {'fingerprint': digest, 'notBefore': time.time() - 3600, 'notAfter': time.time() + days * 86400}


def material(digest='a' * 64, days=90):
    return {'certificate': 'public-certificate', 'privateKey': 'PRIVATE-MATERIAL-SENTINEL', 'info': info(digest, days)}


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.state = str(Path(self.directory.name) / 'state.json')
        self.auth = {'accessKeyId': 'test-id', 'secretAccessKey': 'AK-SECRET-SENTINEL'}
        self.args = ['--apply', '--cert', '/fake/full.pem', '--key', '/fake/key.pem', '--credentials', '/fake/credentials.json', '--state', self.state]

    def run_main(self, args):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = cert.main(args)
        text = out.getvalue()
        self.assertNotIn('PRIVATE-MATERIAL-SENTINEL', text)
        self.assertNotIn('AK-SECRET-SENTINEL', text)
        return code, json.loads(text)

    def test_python36_grammar_and_default_is_offline(self):
        ast.parse(SOURCE.read_text(), feature_version=(3, 6))
        with patch.object(cert, 'rpc', side_effect=AssertionError('cloud')), patch.object(cert, 'read_file', side_effect=AssertionError('read')):
            code, report = self.run_main(['--config', '/does/not/exist'])
        self.assertEqual((code, report['status']), (0, 'plan_only'))
        self.assertFalse(Path(self.state).exists())

    def test_offline_check_does_not_probe_or_write_state(self):
        with patch.object(cert, 'load_material', return_value=material()), patch.object(cert, 'tls_info', side_effect=AssertionError('network')):
            code, report = self.run_main(['--check', '--cert', '/c', '--key', '/k', '--state', self.state])
        self.assertEqual((code, report['status']), (0, 'local_certificate_valid'))
        self.assertFalse(Path(self.state).exists())

    def test_changed_certificate_publishes_only_to_fixed_domain_and_waits_for_trusted_edge(self):
        calls = []
        def rpc(action, params, auth):
            calls.append(action)
            self.assertEqual(params['DomainName'], cert.DOMAIN)
            self.assertEqual(auth, self.auth)
            if action == 'DescribeDomainCertificateInfo':
                return {'RequestId': 'test', 'CertInfos': {'CertInfo': []}}
            self.assertEqual(params['CertType'], 'upload')
            self.assertEqual(params['SSLProtocol'], 'on')
            self.assertEqual(params['SSLPri'], 'PRIVATE-MATERIAL-SENTINEL')
            return {'RequestId': 'test'}
        with patch.object(cert, 'load_material', return_value=material()), patch.object(cert, 'credentials', return_value=self.auth), \
                patch.object(cert, 'tls_info', side_effect=[info('old', 20), info()]), patch.object(cert, 'rpc', side_effect=rpc):
            code, report = self.run_main(self.args)
        self.assertEqual((code, report['status']), (0, 'certificate_active'))
        self.assertEqual(calls, list(cert.ACTIONS))
        saved = json.loads(Path(self.state).read_text())
        self.assertEqual(saved['lastSuccessAt'], saved['checkedAt'])
        self.assertNotIn('PRIVATE-MATERIAL-SENTINEL', Path(self.state).read_text())
        self.assertEqual(os.stat(self.state).st_mode & 0o777, 0o600)

    def test_matching_certificate_does_not_call_api(self):
        with patch.object(cert, 'load_material', return_value=material()), patch.object(cert, 'credentials', return_value=self.auth), \
                patch.object(cert, 'tls_info', return_value=info()), patch.object(cert, 'rpc', side_effect=AssertionError('unnecessary update')):
            code, report = self.run_main(self.args)
        self.assertEqual((code, report['status']), (0, 'certificate_already_active'))

    def test_stale_local_export_cannot_replace_newer_edge(self):
        with patch.object(cert, 'load_material', return_value=material(days=30)), patch.object(cert, 'credentials', return_value=self.auth), \
                patch.object(cert, 'tls_info', return_value=info('newer', 90)), patch.object(cert, 'rpc', side_effect=AssertionError('rollback')):
            code, report = self.run_main(self.args)
        self.assertEqual((code, report['status']), (1, 'local_certificate_older_than_edge'))

    def test_provider_acceptance_is_not_edge_success(self):
        with patch.object(cert, 'load_material', return_value=material()), patch.object(cert, 'credentials', return_value=self.auth), \
                patch.object(cert, 'tls_info', return_value=info('different', 30)), \
                patch.object(cert, 'rpc', return_value={'RequestId': 'test', 'CertInfos': {'CertInfo': []}}) as rpc, \
                patch.object(cert.time, 'monotonic', side_effect=[0, 200]):
            code, report = self.run_main(self.args)
        self.assertEqual((code, report['status']), (2, 'certificate_pending'))
        self.assertNotIn('lastSuccessAt', json.loads(Path(self.state).read_text()))
        self.assertEqual(rpc.call_count, 2)

    def test_already_configured_but_pending_does_not_upload_duplicate(self):
        with patch.object(cert, 'load_material', return_value=material()), patch.object(cert, 'credentials', return_value=self.auth), \
                patch.object(cert, 'tls_info', side_effect=[None, info()]), patch.object(cert, 'active_match', return_value=True), \
                patch.object(cert, 'rpc', return_value={'RequestId': 'test', 'CertInfos': {'CertInfo': []}}) as rpc:
            code, report = self.run_main(self.args)
        self.assertEqual(code, 0)
        self.assertEqual(rpc.call_count, 1)

    def test_status_fails_closed_without_touching_key_or_api(self):
        with patch.object(cert, 'tls_info', return_value=None), patch.object(cert, 'load_material', side_effect=AssertionError('key')), \
                patch.object(cert, 'rpc', side_effect=AssertionError('cloud')):
            code, report = self.run_main(['--status'])
        self.assertEqual((code, report['status']), (1, 'https_not_confirmed'))

    def test_verify_access_is_read_only_even_when_edge_is_already_current(self):
        with patch.object(cert, 'credentials', return_value=self.auth), patch.object(cert, 'tls_info', return_value=info()), \
                patch.object(cert, 'rpc', return_value={'RequestId': 'test'}) as rpc, \
                patch.object(cert, 'load_material', side_effect=AssertionError('private key')):
            code, report = self.run_main(['--verify-access', '--credentials', '/credentials.json'])
        self.assertEqual(code, 0)
        self.assertTrue(report['apiReadVerified'])
        rpc.assert_called_once_with('DescribeDomainCertificateInfo', {'DomainName': cert.DOMAIN}, self.auth)

    def test_expiring_certificate_is_nonzero_even_when_matching(self):
        with patch.object(cert, 'load_material', return_value=material(days=7)), patch.object(cert, 'credentials', return_value=self.auth), \
                patch.object(cert, 'tls_info', return_value=info(days=7)), patch.object(cert, 'rpc', side_effect=AssertionError('cloud')):
            code, report = self.run_main(self.args)
        self.assertEqual((code, report['status']), (3, 'certificate_expiring'))

    def test_status_can_check_local_fingerprint_without_reading_private_key(self):
        with patch.object(cert, 'load_material', return_value=material()) as load, patch.object(cert, 'tls_info', return_value=info('other')):
            code, report = self.run_main(['--status', '--cert', '/full.pem', '--key', '/secret.pem'])
        load.assert_called_once_with('/full.pem', None)
        self.assertEqual((code, report['status']), (2, 'edge_certificate_mismatch'))

    def test_failed_sync_retains_previous_success_and_reports_current_failure(self):
        cert.save_state(self.state, {'exitCode': 0, 'checkedAt': 'previous-success'})
        with patch.object(cert, 'load_material', side_effect=cert.Stop('certificate_not_currently_valid')):
            code, report = self.run_main(self.args)
        saved = json.loads(Path(self.state).read_text())
        self.assertEqual(code, 1)
        self.assertEqual(saved['lastSuccessAt'], 'previous-success')
        self.assertEqual(saved['status'], 'certificate_not_currently_valid')

    def test_concurrent_sync_cannot_enter_or_overwrite_state(self):
        with cert.state_lock(self.state), patch.object(cert, 'perform', side_effect=AssertionError('second execution')):
            code, report = self.run_main(self.args)
        self.assertEqual((code, report['status']), (1, 'sync_already_running'))
        self.assertFalse(Path(self.state).exists())

    def test_credentials_require_private_owner_regular_file_and_no_symlink(self):
        path = Path(self.directory.name) / 'credentials.json'
        path.write_text(json.dumps(self.auth)); path.chmod(0o644)
        with self.assertRaises(cert.Stop): cert.credentials(str(path))
        path.chmod(0o600)
        self.assertEqual(cert.credentials(str(path)), self.auth)
        link = Path(self.directory.name) / 'link.json'; link.symlink_to(path)
        with self.assertRaises(OSError): cert.credentials(str(link))

    def test_rpc_sends_secrets_only_in_https_post_body_and_never_follows_redirects(self):
        response = MagicMock(); response.__enter__.return_value = response
        response.read.return_value = b'{"RequestId":"test"}'
        opener = MagicMock(); opener.open.return_value = response
        auth = dict(self.auth, sessionToken='STS-SENTINEL')
        with patch.object(cert.urllib.request, 'build_opener', return_value=opener), patch.object(cert, 'stamp', return_value='2026-09-21T00:00:00Z'):
            cert.rpc('SetCdnDomainSSLCertificate', {'DomainName': cert.DOMAIN, 'SSLPri': 'PRIVATE-MATERIAL-SENTINEL'}, auth)
        request = opener.open.call_args[0][0]
        self.assertEqual(request.full_url, 'https://cdn.aliyuncs.com/')
        self.assertEqual(request.get_method(), 'POST')
        fields = {k:v[0] for k,v in parse_qs(request.data.decode()).items()}
        self.assertEqual(fields.pop('Signature'), cert.signature({k:v for k,v in fields.items() if k != 'Signature'}, self.auth['secretAccessKey']))
        self.assertEqual(fields['SSLPri'], 'PRIVATE-MATERIAL-SENTINEL')
        self.assertEqual(fields['SecurityToken'], 'STS-SENTINEL')
        self.assertNotIn('AK-SECRET-SENTINEL', request.data.decode())
        self.assertIsNone(cert.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example/'))

    def test_signature_matches_alibaba_published_reference_vector(self):
        # https://help.aliyun.com/zh/sdk/product-overview/rpc-mechanism
        fields = {'AccessKeyId': 'testid', 'Action': 'DescribeDedicatedHosts', 'Format': 'JSON',
                  'RegionId': 'cn-beijing', 'SignatureMethod': 'HMAC-SHA1',
                  'SignatureNonce': 'edb2b34af0af9a6d14deaf7c1a5315eb', 'SignatureVersion': '1.0',
                  'Timestamp': '2023-03-13T08:34:30Z', 'Version': '2014-05-26'}
        self.assertEqual(cert.signature(fields, 'testsecret', 'GET'), '9NaGiOspFP5UPcwX8Iwt2YJXXuk=')

    def test_tls_probe_uses_system_trust_hostname_and_actual_leaf_metadata(self):
        secure = MagicMock(); secure.__enter__.return_value = secure
        decoded = {'notBefore': 'Sep 21 00:00:00 2026 GMT', 'notAfter': 'Dec 20 00:00:00 2026 GMT'}
        secure.getpeercert.side_effect = [b'leaf-der', decoded]
        context = MagicMock(); context.wrap_socket.return_value = secure
        with patch.object(cert.ssl, 'create_default_context', return_value=context), \
                patch.object(cert.socket, 'create_connection', return_value=MagicMock()) as connect:
            actual = cert.tls_info()
        connect.assert_called_once_with((cert.DOMAIN, 443), timeout=10)
        self.assertEqual(context.wrap_socket.call_args[1], {'server_hostname': cert.DOMAIN})
        self.assertEqual(actual, cert.certificate_info(decoded, cert.hashlib.sha256(b'leaf-der').hexdigest()))

    def test_rpc_rejects_other_actions_or_domains_and_redacts_provider_errors(self):
        with self.assertRaises(cert.Stop): cert.rpc('DeleteCdnDomain', {'DomainName': cert.DOMAIN}, self.auth)
        with self.assertRaises(cert.Stop): cert.rpc(cert.ACTIONS[0], {'DomainName': 'other.example'}, self.auth)
        opener = MagicMock()
        opener.open.side_effect = cert.urllib.error.HTTPError(cert.ENDPOINT, 403, 'PRIVATE-MATERIAL-SENTINEL', {}, None)
        with patch.object(cert.urllib.request, 'build_opener', return_value=opener), self.assertRaisesRegex(cert.Stop, '^cloud_http_403$'):
            cert.rpc(cert.ACTIONS[0], {'DomainName': cert.DOMAIN}, self.auth)

    def test_real_pem_pair_hostname_and_expiry_validation(self):
        certpath = str(Path(self.directory.name) / 'cert.pem')
        keypath = str(Path(self.directory.name) / 'key.pem')
        configpath = str(Path(self.directory.name) / 'openssl.cnf')
        Path(configpath).write_text('[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=static.onebyone.run\n[ext]\nsubjectAltName=DNS:static.onebyone.run\n')
        result = subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-config', configpath, '-keyout', keypath, '-out', certpath], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0)
        os.chmod(keypath, 0o600)
        loaded = cert.load_material(certpath, keypath)
        self.assertGreater(loaded['info']['notAfter'], time.time())
        self.assertEqual(loaded['info']['fingerprint'], cert.fingerprint(Path(certpath).read_text()))
        with patch.object(cert.time, 'time', return_value=loaded['info']['notAfter'] + 1), self.assertRaisesRegex(cert.Stop, 'not_currently_valid'):
            cert.load_material(certpath, keypath)
        with patch.object(cert, 'DOMAIN', 'wrong.example'), self.assertRaisesRegex(cert.Stop, 'hostname_mismatch'):
            cert.load_material(certpath, keypath)
        Path(keypath).write_text('-----BEGIN PRIVATE KEY-----\nwrong-key\n-----END PRIVATE KEY-----\n')
        with self.assertRaises(cert.ssl.SSLError): cert.load_material(certpath, keypath)

    def test_config_paths_thresholds_and_service_plan(self):
        config = Path(self.directory.name) / 'sync.json'
        config.write_text(json.dumps({'certPath':'/full.pem','keyPath':'/key.pem','credentialsPath':'/credentials.json','statePath':self.state,'warningDays':14})); config.chmod(0o600)
        args = cert.parse_args(['--config', str(config), '--apply'])
        self.assertEqual((args.cert, args.state, args.warning_days), ('/full.pem', self.state, 14))
        code, report = self.run_main(['--status', '--warning-days', '0'])
        self.assertEqual(code, 1)
        result = subprocess.run(['sh', str(ROOT / 'build/assets/certificate/install-service.sh')], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn('Plan only', result.stdout)


if __name__ == '__main__':
    unittest.main()
