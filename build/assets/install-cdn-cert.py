#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload an existing certificate only to static.onebyone.run. Python 3.6+.

Default: offline plan. --check validates supplied PEM files offline. --status
checks the live, trusted HTTPS certificate. --apply uploads the existing certificate and enables HTTPS.
No purchase, issuance, renewal order, or paid service activation APIs are called.

Official API parameters (reviewed 2026-09-21):
https://help.aliyun.com/zh/cdn/developer-reference/api-cdn-2018-05-10-setcdndomainsslcertificate/
https://help.aliyun.com/zh/cdn/developer-reference/api-cdn-2018-05-10-describedomaincertificateinfo

Use a private CloudShell session: RPC private-key data briefly exists in argv,
but is never passed through a shell, printed, or written to an additional file.
Do not enable CLI debug logging or shell tracing. Original files are untouched.
"""
import argparse
import hashlib
import json
import os
import re
import socket
import ssl
import stat
import subprocess
import sys
import time

DOMAIN = 'static.onebyone.run'
QUERY = ('CertInfos.CertInfo[].{DomainName:DomainName,Status:Status,'
         'ServerCertificateStatus:ServerCertificateStatus,ServerCertificate:ServerCertificate}')


class Stop(Exception):
    pass


def read_pem(path, private=False):
    with open(path, 'r', encoding='ascii') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 256 * 1024:
            raise Stop('invalid_file')
        if private and info.st_mode & 0o077:
            raise Stop('private_key_permissions_require_600')
        value = stream.read().strip() + '\n'
    if private:
        if 'ENCRYPTED' in value or not re.search(r'^-----BEGIN (RSA |EC )?PRIVATE KEY-----', value):
            raise Stop('unencrypted_pem_private_key_required')
    elif not value.startswith('-----BEGIN CERTIFICATE-----'):
        raise Stop('pem_certificate_required')
    return value


def fingerprint(pem):
    match = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', pem, re.S)
    if not match:
        raise Stop('invalid_certificate')
    return hashlib.sha256(ssl.PEM_cert_to_DER_cert(match.group())).hexdigest()


def load_material(cert_path, key_path):
    certificate, private_key = read_pem(cert_path), read_pem(key_path, private=True)
    # CPython's certificate decoder is available in CloudShell Python 3.6.
    decoded = ssl._ssl._test_decode_cert(cert_path)
    names = [str(value).lower().rstrip('.') for kind, value in decoded.get('subjectAltName', []) if kind == 'DNS']
    if not names:
        names = [str(value).lower().rstrip('.') for group in decoded.get('subject', [])
                 for kind, value in group if kind == 'commonName']
    if not any(name in (DOMAIN, '*.onebyone.run') for name in names):
        raise Stop('certificate_hostname_mismatch')
    now = time.time()
    if not ssl.cert_time_to_seconds(decoded['notBefore']) <= now < ssl.cert_time_to_seconds(decoded['notAfter']):
        raise Stop('certificate_not_currently_valid')
    # Offline OpenSSL key-pair validation through Python: never print the key or prompt for a password.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_path, key_path, password=lambda: '')
    return certificate, private_key, fingerprint(certificate)


def cli(action, params, profile=None, query=None):
    command = ['aliyun', 'cdn', action, '--secure', '--read-timeout', '30', '--connect-timeout', '10', '--retry-count', '0']
    if profile:
        command += ['--profile', profile]
    for key, value in params.items():
        command += ['--' + key, str(value)]
    if query:
        command += ['--cli-query', query]
    env = dict(os.environ)
    for name in ('DEBUG', 'DEBUG_SDK', 'ALIBABA_CLOUD_DEBUG', 'ALIYUN_CLI_DEBUG'):
        env.pop(name, None)
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                universal_newlines=True, timeout=50, env=env)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop('cloud_call_unavailable')
    if result.returncode:
        # Provider errors can reflect request parameters: never print raw errors/args.
        raise Stop('cloud_call_failed')
    try:
        return json.loads(result.stdout)
    except ValueError:
        raise Stop('invalid_cloud_response')


def certificate_status(profile=None):
    return cli('DescribeDomainCertificateInfo', {'DomainName': DOMAIN}, profile, QUERY) or []


def active_match(rows, digest):
    for row in rows:
        if row.get('DomainName') not in (None, '', DOMAIN) or row.get('ServerCertificateStatus') != 'on':
            continue
        try:
            if fingerprint(row.get('ServerCertificate', '')) == digest:
                return True
        except (Stop, ValueError):
            pass
    return False


def tls_fingerprint():
    # Validate the system trust chain AND this fixed hostname, then pin the local
    # leaf certificate. Provider metadata alone cannot prove edge deployment.
    # A TLS handshake sends no HTTP request and does not fetch private content.
    try:
        context = ssl.create_default_context()
        with socket.create_connection((DOMAIN, 443), timeout=10) as connection:
            with context.wrap_socket(connection, server_hostname=DOMAIN) as secure:
                return hashlib.sha256(secure.getpeercert(binary_form=True)).hexdigest()
    except (OSError, ValueError):
        return None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--cert', help='Existing full-chain PEM file, leaf certificate first')
    parser.add_argument('--key', help='Existing unencrypted PEM private key, mode 600')
    parser.add_argument('--profile')
    parser.add_argument('--wait-seconds', type=int, default=180)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--status', action='store_true')
    args = parser.parse_args(argv)
    if not (args.apply or args.check or args.status):
        print('STATUS plan_only: static.onebyone.run; no file reads or cloud calls')
        return 0
    if args.status:
        # A valid live TLS certificate is stronger evidence than provider Status.
        print('STATUS ' + ('https_verified' if tls_fingerprint() else 'https_not_confirmed'))
        return 0
    if not args.cert or not args.key or not 5 <= args.wait_seconds <= 600:
        raise Stop('certificate_and_key_paths_required_or_invalid_wait')
    cert_path = os.path.abspath(os.path.expanduser(args.cert))
    key_path = os.path.abspath(os.path.expanduser(args.key))
    certificate, private_key, digest = load_material(cert_path, key_path)
    if args.check:
        print('SUCCESS local_certificate_valid')
        return 0
    if tls_fingerprint() == digest:
        print('SUCCESS certificate_already_active')
        return 0
    if active_match(certificate_status(args.profile), digest):
        print('STATUS certificate_configured; waiting_for_verified_edge_certificate')
    else:
        result = cli('SetCdnDomainSSLCertificate', {'DomainName': DOMAIN, 'CertType': 'upload',
                     'SSLProtocol': 'on', 'CertName': 'onebyone-static-' + digest[:16],
                     'SSLPub': certificate, 'SSLPri': private_key}, args.profile)
        if not result.get('RequestId'):
            raise Stop('certificate_update_unconfirmed')
        print('SUCCESS certificate_update_accepted')
    deadline = time.time() + args.wait_seconds
    while True:
        if tls_fingerprint() == digest:
            print('SUCCESS certificate_active')
            return 0
        if time.time() >= deadline:
            print('STATUS certificate_pending; use --status to check later')
            return 2
        time.sleep(5)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Stop as error:
        print('STATUS failed:' + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        print('STATUS failed:invalid_local_or_provider_data', file=sys.stderr)
        sys.exit(1)
