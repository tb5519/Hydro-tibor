#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Synchronize an existing certificate to static.onebyone.run (Python 3.6+).

Default: offline plan. --check validates local material. --status verifies live
TLS and optionally its local fingerprint. --verify-access also checks the
read-only CDN API permission. --apply publishes changed material.
Issuance/renewal belongs to the external ACME/Baota task, never this script.
Secrets stay in process memory and the TLS-protected POST body, never argv.
"""
import argparse
import base64
import contextlib
import datetime
import fcntl
import hashlib
import hmac
import json
import os
import re
import socket
import ssl
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

DOMAIN = 'static.onebyone.run'
ENDPOINT = 'https://cdn.aliyuncs.com/'
MAX_BYTES = 1024 * 1024
ACTIONS = ('DescribeDomainCertificateInfo', 'SetCdnDomainSSLCertificate')


class Stop(Exception):
    """A fixed, non-sensitive reason safe to include in logs."""


def stamp(epoch=None):
    return datetime.datetime.fromtimestamp(time.time() if epoch is None else epoch, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def read_file(path, private=False, nofollow=False):
    flags = os.O_RDONLY | (getattr(os, 'O_NOFOLLOW', 0) if nofollow else 0)
    with os.fdopen(os.open(path, flags), 'r', encoding='ascii') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_BYTES:
            raise Stop('invalid_file')
        if private and (info.st_mode & 0o077 or info.st_uid != os.geteuid()):
            raise Stop('private_file_requires_owner_only_permissions')
        if info.st_mode & 0o022:
            raise Stop('file_is_writable_by_other_users')
        return stream.read(MAX_BYTES + 1)


def read_json(path):
    value = json.loads(read_file(path, private=True, nofollow=True))
    if not isinstance(value, dict):
        raise Stop('invalid_json_configuration')
    return value


def fingerprint(pem):
    match = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', pem, re.S)
    if not match:
        raise Stop('invalid_certificate')
    return hashlib.sha256(ssl.PEM_cert_to_DER_cert(match.group())).hexdigest()


def certificate_info(decoded, digest):
    return {'fingerprint': digest, 'notBefore': ssl.cert_time_to_seconds(decoded['notBefore']),
            'notAfter': ssl.cert_time_to_seconds(decoded['notAfter'])}


def load_material(cert_path, key_path=None):
    certificate = read_file(cert_path).strip() + '\n'
    if not certificate.startswith('-----BEGIN CERTIFICATE-----'):
        raise Stop('pem_certificate_required')
    private_key = read_file(key_path, private=True).strip() + '\n' if key_path else None
    if private_key and ('ENCRYPTED' in private_key or not re.search(r'^-----BEGIN (RSA |EC )?PRIVATE KEY-----', private_key)):
        raise Stop('unencrypted_pem_private_key_required')
    # Validate the exact in-memory snapshot that will be uploaded, including
    # during Baota's atomic file replacement. Temporary files are owner-only.
    with tempfile.TemporaryDirectory(prefix='onebyone-cert-') as directory:
        cert_snapshot = os.path.join(directory, 'fullchain.pem')
        with os.fdopen(os.open(cert_snapshot, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
            stream.write(certificate)
        decoded = ssl._ssl._test_decode_cert(cert_snapshot)
        names = [str(value).lower().rstrip('.') for kind, value in decoded.get('subjectAltName', []) if kind == 'DNS']
        if not any(name in (DOMAIN, '*.onebyone.run') for name in names):
            raise Stop('certificate_hostname_mismatch')
        info = certificate_info(decoded, fingerprint(certificate))
        if not info['notBefore'] <= time.time() < info['notAfter']:
            raise Stop('certificate_not_currently_valid')
        if private_key:
            key_snapshot = os.path.join(directory, 'privkey.pem')
            with os.fdopen(os.open(key_snapshot, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
                stream.write(private_key)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert_snapshot, key_snapshot, password=lambda: '')
    return {'certificate': certificate, 'privateKey': private_key, 'info': info}


def credentials(path=None, profile=None):
    if path:
        value = read_json(path)
    elif profile:
        config = read_json(os.path.expanduser('~/.aliyun/config.json'))
        profiles = [p for p in config.get('profiles', []) if p.get('name') == profile]
        if len(profiles) != 1 or profiles[0].get('mode') not in ('AK', 'StsToken'):
            raise Stop('unsupported_or_missing_cli_profile')
        selected = profiles[0]
        value = {'accessKeyId': selected.get('access_key_id'), 'secretAccessKey': selected.get('access_key_secret'),
                 'sessionToken': selected.get('sts_token')}
    else:
        raise Stop('dedicated_cdn_credentials_required')
    for field in ('accessKeyId', 'secretAccessKey'):
        if not isinstance(value.get(field), str) or not value[field] or len(value[field]) > 512:
            raise Stop('invalid_cdn_credentials')
    if value.get('sessionToken') is not None and not isinstance(value['sessionToken'], str):
        raise Stop('invalid_cdn_credentials')
    return value


def encode(value):
    return urllib.parse.quote(str(value), safe='~')


def signature(params, secret, method='POST'):
    canonical = '&'.join(encode(key) + '=' + encode(params[key]) for key in sorted(params))
    value = method + '&%2F&' + encode(canonical)
    return base64.b64encode(hmac.new((secret + '&').encode(), value.encode(), hashlib.sha1).digest()).decode()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def rpc(action, params, auth):
    if action not in ACTIONS or params.get('DomainName') != DOMAIN:
        raise Stop('cloud_action_or_domain_not_allowed')
    fields = {'Format': 'JSON', 'Version': '2018-05-10', 'AccessKeyId': auth['accessKeyId'],
              'SignatureMethod': 'HMAC-SHA1', 'SignatureVersion': '1.0',
              'Timestamp': stamp(), 'SignatureNonce': uuid.uuid4().hex, 'Action': action}
    if any(key in fields or key in ('Signature', 'SecurityToken') for key in params):
        raise Stop('cloud_parameter_not_allowed')
    fields.update(params)
    if auth.get('sessionToken'):
        fields['SecurityToken'] = auth['sessionToken']
    fields['Signature'] = signature(fields, auth['secretAccessKey'])
    request = urllib.request.Request(ENDPOINT, urllib.parse.urlencode(fields).encode(),
                                     {'Content-Type': 'application/x-www-form-urlencoded',
                                      'User-Agent': 'onebyone-cdn-cert-sync/2'}, method='POST')
    # Fixed trusted endpoint, no environment proxies, redirects or debug output.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                                        urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(request, timeout=30) as response:
            body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise Stop('cloud_response_too_large')
        result = json.loads(body)
    except urllib.error.HTTPError as error:
        raise Stop('cloud_http_' + str(error.code)) from None
    except (OSError, ValueError, urllib.error.URLError):
        raise Stop('cloud_call_failed') from None
    if not isinstance(result, dict) or result.get('Code') or not result.get('RequestId'):
        raise Stop('invalid_cloud_response')
    return result


def active_match(rows, digest):
    for row in rows:
        if row.get('DomainName') != DOMAIN or row.get('ServerCertificateStatus') != 'on':
            continue
        try:
            if fingerprint(row.get('ServerCertificate', '')) == digest:
                return True
        except (Stop, ValueError):
            pass
    return False


def tls_info():
    try:
        context = ssl.create_default_context()
        with socket.create_connection((DOMAIN, 443), timeout=10) as connection:
            with context.wrap_socket(connection, server_hostname=DOMAIN) as secure:
                digest = hashlib.sha256(secure.getpeercert(binary_form=True)).hexdigest()
                return certificate_info(secure.getpeercert(), digest)
    except (OSError, ValueError, KeyError):
        return None


def health(info, warning_days):
    return bool(info and info['notBefore'] <= time.time() and info['notAfter'] > time.time() + warning_days * 86400)


def private_directory(directory):
    os.makedirs(directory, mode=0o700, exist_ok=True)
    info = os.lstat(directory)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise Stop('state_directory_requires_owner_only_permissions')


@contextlib.contextmanager
def state_lock(path):
    private_directory(os.path.dirname(path))
    flags = os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
    with os.fdopen(os.open(path + '.lock', flags, 0o600), 'r+') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise Stop('invalid_state_lock')
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop('sync_already_running')
        yield


def save_state(path, report):
    previous = read_json(path) if os.path.exists(path) else {}
    report = dict(report)
    if report['exitCode'] == 0:
        report['lastSuccessAt'] = report['checkedAt']
    elif previous.get('lastSuccessAt'):
        report['lastSuccessAt'] = previous['lastSuccessAt']
    descriptor, temporary = tempfile.mkstemp(prefix='.state-', dir=os.path.dirname(path))
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(report, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(os.path.dirname(path), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def perform(args, report):
    material = load_material(args.cert, args.key if args.apply or args.check else None) if args.cert else None
    if material:
        report['local'] = material['info']
    if args.check:
        if args.credentials or args.profile:
            credentials(args.credentials, args.profile)
        return ('local_certificate_valid', 0) if health(material['info'], args.warning_days) else ('local_certificate_expiring', 3)
    edge = tls_info()
    report['edge'] = edge
    if args.status or args.verify_access:
        if args.verify_access:
            auth = credentials(args.credentials, args.profile)
            rpc('DescribeDomainCertificateInfo', {'DomainName': DOMAIN}, auth)
            report['apiReadVerified'] = True
        if not edge:
            return 'https_not_confirmed', 1
        if material and edge['fingerprint'] != material['info']['fingerprint']:
            return 'edge_certificate_mismatch', 2
        return ('https_verified', 0) if health(edge, args.warning_days) else ('edge_certificate_expiring', 3)
    auth = credentials(args.credentials, args.profile)
    digest = material['info']['fingerprint']
    if edge and edge['fingerprint'] == digest:
        return ('certificate_already_active', 0) if health(edge, args.warning_days) else ('certificate_expiring', 3)
    # Never roll back a healthy, newer edge certificate because the selected
    # Baota file is a stale download/export or an older renewal lineage.
    if edge and edge['notAfter'] > material['info']['notAfter']:
        raise Stop('local_certificate_older_than_edge')
    result = rpc('DescribeDomainCertificateInfo', {'DomainName': DOMAIN}, auth)
    rows = result.get('CertInfos', {}).get('CertInfo', [])
    if not isinstance(rows, list):
        raise Stop('invalid_cloud_certificate_list')
    if not active_match(rows, digest):
        rpc('SetCdnDomainSSLCertificate', {'DomainName': DOMAIN, 'CertType': 'upload', 'SSLProtocol': 'on',
            'CertName': 'onebyone-static-' + digest[:16], 'SSLPub': material['certificate'],
            'SSLPri': material['privateKey']}, auth)
        report['updated'] = True
    deadline = time.monotonic() + args.wait_seconds
    while True:
        edge = tls_info()
        report['edge'] = edge
        if edge and edge['fingerprint'] == digest:
            return ('certificate_active', 0) if health(edge, args.warning_days) else ('certificate_expiring', 3)
        if time.monotonic() >= deadline:
            return 'certificate_pending', 2
        time.sleep(5)


def absolute_path(value):
    if not isinstance(value, str) or not os.path.isabs(value):
        raise Stop('absolute_configuration_paths_required')
    return value


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--config', help='Owner-only JSON: certPath, keyPath, credentialsPath, statePath, warningDays')
    parser.add_argument('--cert', help='Actual Baota-renewed full chain, leaf certificate first')
    parser.add_argument('--key', help='Matching private key, owner-readable only')
    parser.add_argument('--credentials', help='Dedicated owner-only CDN RAM credentials JSON')
    parser.add_argument('--profile', help='Existing owner-only aliyun AK/StsToken profile (read in process)')
    parser.add_argument('--state', help='Private JSON health-state output')
    parser.add_argument('--warning-days', type=int, default=None)
    parser.add_argument('--wait-seconds', type=int, default=180)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--status', action='store_true')
    mode.add_argument('--verify-access', action='store_true', help='Read-only CDN API and TLS check; does not prove update permission')
    args = parser.parse_args(argv)
    if not (args.apply or args.check or args.status or args.verify_access):
        return args
    config = read_json(absolute_path(args.config)) if args.config else {}
    for name, field in [('cert', 'certPath'), ('key', 'keyPath'), ('credentials', 'credentialsPath'), ('state', 'statePath')]:
        value = getattr(args, name) or config.get(field)
        if value:
            setattr(args, name, absolute_path(value))
    args.warning_days = args.warning_days if args.warning_days is not None else config.get('warningDays', 21)
    if type(args.warning_days) is not int or not 1 <= args.warning_days <= 60 or not 5 <= args.wait_seconds <= 600:
        raise Stop('invalid_health_or_wait_threshold')
    if args.credentials and args.profile:
        raise Stop('choose_credentials_or_profile')
    if (args.check or args.apply) and (not args.cert or not args.key):
        raise Stop('certificate_and_key_paths_required')
    if args.apply and not args.state:
        args.state = os.path.expanduser('~/.local/state/onebyone-cdn-cert/state.json')
    # An offline check must never modify the last actual synchronization result.
    if args.check:
        args.state = None
    return args


def main(argv=None):
    report = {'schemaVersion': 1, 'domain': DOMAIN, 'checkedAt': stamp(), 'renewalManagedExternally': True}
    try:
        args = parse_args(argv)
        if not (args.apply or args.check or args.status or args.verify_access):
            print(json.dumps(dict(report, status='plan_only', exitCode=0)))
            return 0
        report['operation'] = 'apply' if args.apply else 'check' if args.check else 'verify-access' if args.verify_access else 'status'

        def run():
            try:
                status, code = perform(args, report)
            except Stop as error:
                status, code = str(error), 1
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                status, code = 'invalid_local_or_provider_data', 1
            report.update(status=status, exitCode=code)
            if args.state:
                save_state(args.state, report)
            return code

        if args.state:
            with state_lock(args.state):
                code = run()
        else:
            code = run()
    except Stop as error:
        report.update(status=str(error), exitCode=1)
        code = 1
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        report.update(status='invalid_local_configuration_or_state', exitCode=1)
        code = 1
    print(json.dumps(report, sort_keys=True))
    return code


if __name__ == '__main__':
    sys.exit(main())
