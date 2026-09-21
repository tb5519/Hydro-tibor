#!/usr/bin/env python3
"""Offline mocks only; no real certificate reads or cloud execution."""
import ast
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parents[1] / 'build/assets/install-cdn-cert.py'
spec = importlib.util.spec_from_file_location('install_cdn_cert', str(SOURCE))
cert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cert)


class InstallTests(unittest.TestCase):
    def test_python36_grammar(self):
        ast.parse(SOURCE.read_text(), feature_version=(3, 6))

    def test_default_is_offline_and_does_not_read_key(self):
        with patch.object(cert, 'cli', side_effect=AssertionError('cloud')), \
                patch.object(cert, 'load_material', side_effect=AssertionError('key')), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cert.main([]), 0)
        self.assertIn('plan_only', output.getvalue())

    def test_check_validates_locally_without_api_call(self):
        with patch.object(cert, 'cli', side_effect=AssertionError('cloud')), \
                patch.object(cert, 'load_material', return_value=('certificate', 'private-secret', 'digest')), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cert.main(['--check', '--cert', '/fake/full.pem', '--key', '/fake/key.pem']), 0)
        self.assertNotIn('private-secret', output.getvalue())

    def test_apply_only_uploads_to_exact_domain_and_hides_private_material(self):
        calls = []
        def fake_cli(action, params, profile=None, query=None):
            calls.append((action, params))
            self.assertEqual(params['DomainName'], 'static.onebyone.run')
            if action == 'DescribeDomainCertificateInfo':
                return []
            self.assertEqual(action, 'SetCdnDomainSSLCertificate')
            self.assertEqual(params['CertType'], 'upload')
            self.assertEqual(params['SSLProtocol'], 'on')
            self.assertEqual(params['SSLPri'], 'private-secret')
            self.assertEqual(params['SSLPub'], 'certificate')
            return {'RequestId': 'offline'}
        with patch.object(cert, 'cli', side_effect=fake_cli), \
                patch.object(cert, 'load_material', return_value=('certificate', 'private-secret', 'a' * 64)), \
                patch.object(cert, 'active_match', return_value=False), \
                patch.object(cert, 'tls_fingerprint', side_effect=[None, 'a' * 64]), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cert.main(['--apply', '--cert', '/fake/full.pem', '--key', '/fake/key.pem']), 0)
        self.assertNotIn('private-secret', output.getvalue())
        self.assertIn('certificate_active', output.getvalue())
        self.assertEqual([x[0] for x in calls], ['DescribeDomainCertificateInfo', 'SetCdnDomainSSLCertificate'])

    def test_already_installed_certificate_never_reuploads(self):
        with patch.object(cert, 'cli', return_value=[]) as cli, \
                patch.object(cert, 'load_material', return_value=('certificate', 'private-secret', 'digest')), \
                patch.object(cert, 'tls_fingerprint', return_value='digest'), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cert.main(['--apply', '--cert', '/fake/full.pem', '--key', '/fake/key.pem']), 0)
        self.assertEqual(cli.call_count, 0)

    def test_status_does_not_read_certificate_or_private_key(self):
        with patch.object(cert, 'load_material', side_effect=AssertionError('read')), \
                patch.object(cert, 'cli', side_effect=AssertionError('cloud')), \
                patch.object(cert, 'tls_fingerprint', return_value='verified-digest'), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cert.main(['--status']), 0)
        self.assertEqual(output.getvalue().strip(), 'STATUS https_verified')


    def test_provider_success_does_not_accept_different_live_certificate(self):
        with patch.object(cert, 'cli', return_value=[]) as cli, \
                patch.object(cert, 'load_material', return_value=('certificate', 'private-secret', 'expected')), \
                patch.object(cert, 'active_match', return_value=True), \
                patch.object(cert, 'tls_fingerprint', return_value='different'), \
                patch.object(cert.time, 'time', side_effect=[0, 200]), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cert.main(['--apply', '--cert', '/fake/full.pem', '--key', '/fake/key.pem']), 2)
        self.assertNotIn('SUCCESS certificate_active', output.getvalue())
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(cli.call_args[0][0], 'DescribeDomainCertificateInfo')

    def test_missing_provider_status_is_not_used_as_edge_deployment_evidence(self):
        with patch.object(cert, 'fingerprint', return_value='digest'):
            self.assertTrue(cert.active_match([{'ServerCertificateStatus': 'on', 'ServerCertificate': 'public'}], 'digest'))
            self.assertFalse(cert.active_match([{'DomainName': 'another.example', 'ServerCertificateStatus': 'on', 'ServerCertificate': 'public'}], 'digest'))

    def test_tls_probe_uses_system_trust_exact_hostname_and_leaf_fingerprint(self):
        from unittest.mock import MagicMock
        connection = MagicMock()
        secure = MagicMock()
        secure.__enter__.return_value = secure
        secure.getpeercert.return_value = b'leaf-certificate-der'
        context = MagicMock()
        context.wrap_socket.return_value = secure
        with patch.object(cert.ssl, 'create_default_context', return_value=context) as defaults, \
                patch.object(cert.socket, 'create_connection', return_value=connection) as connect:
            self.assertEqual(cert.tls_fingerprint(), cert.hashlib.sha256(b'leaf-certificate-der').hexdigest())
        defaults.assert_called_once_with()
        connect.assert_called_once_with(('static.onebyone.run', 443), timeout=10)
        self.assertEqual(context.wrap_socket.call_args[1], {'server_hostname': 'static.onebyone.run'})
        secure.getpeercert.assert_called_once_with(binary_form=True)


if __name__ == '__main__':
    unittest.main()
