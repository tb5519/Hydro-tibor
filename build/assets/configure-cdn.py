#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prepare/apply OneByOne CDN settings with CloudShell's official aliyun CLI.

Python 3.6+, stdlib only. Default is an offline, redacted plan. --check is
read-only cloud inspection; --apply performs the selected stage. No builds,
package installation, bucket ACL change, permanent OSS keys, or secret output.

Sources (reviewed 2026-09-21):
https://help.aliyun.com/en/cdn/developer-reference/parameters-for-configuring-features-for-domain-names
https://help.aliyun.com/zh/cdn/developer-reference/usage-notes-on-configid
https://help.aliyun.com/zh/cdn/user-guide/grant-alibaba-cloud-cdn-access-permissions-on-private-oss-buckets
https://help.aliyun.com/en/cdn/user-guide/rewrite-http-response-headers
https://help.aliyun.com/zh/cdn/user-guide/create-a-custom-http-response-header
https://help.aliyun.com/zh/cli/filter-results-and-tabulate-output

Run in the account owner's private CloudShell session. CLI subprocess output is
captured and never echoed. RPC parameters use argv (not a shell/history); as with
other CLI secrets, another process with access to this user's process arguments
could read them briefly. Do not enable CLI debugging or shell tracing.
"""
import argparse
import json
import os
import re
import stat
import subprocess
import sys
import time
from urllib.parse import unquote

DOMAIN = 'static.onebyone.run'
BUCKET = 'onebyone-oss'
CONDITION_ID = '520201192464384'
CONDITION_NAME = 'OneByOne 私有资源'
ROLE = 'AliyunCDNAccessingPrivateOSSRole'
POLICY = 'OneByOneCDNReadStaticMedia'
SECRET_ARGS = ('auth_key1', 'auth_key2', 'perm_private_oss_tbl')
# Filtering happens inside aliyun, before JSON is returned to this script.
CONFIG_QUERY = ("DomainConfigs.DomainConfig[].{ConfigId:ConfigId,ParentId:ParentId,"
                "FunctionName:FunctionName,Status:Status,FunctionArgs:{FunctionArg:"
                "FunctionArgs.FunctionArg[?ArgName!='auth_key1' && ArgName!='auth_key2' "
                "&& ArgName!='perm_private_oss_tbl']}}")
TRUST = {'Version': '1', 'Statement': [{'Effect': 'Allow', 'Action': 'sts:AssumeRole',
         'Principal': {'Service': ['cdn.aliyuncs.com']}}]}
READ_POLICY = {'Version': '1', 'Statement': [{'Effect': 'Allow', 'Action': ['oss:GetObject'],
               'Resource': ['acs:oss:*:*:onebyone-oss/static/*', 'acs:oss:*:*:onebyone-oss/media/*']}]}


class Stop(Exception):
    pass


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def doc(value):
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return json.loads(unquote(value))


def as_list(value):
    return value if isinstance(value, list) else [value]


def policy_equal(actual, expected):
    # Permit equivalent single-string/list spellings, but no extra permissions.
    def normalized(value):
        value = doc(value)
        statements = []
        for original in as_list(value.get('Statement', [])):
            item = dict(original)
            item.pop('Sid', None)
            for key in ('Action', 'Resource'):
                if key in item:
                    item[key] = sorted(as_list(item[key]))
            if 'Principal' in item:
                item['Principal'] = {k: sorted(as_list(v)) for k, v in item['Principal'].items()}
            statements.append(item)
        return {'Version': value.get('Version'), 'Statement': sorted(statements, key=compact)}
    return normalized(actual) == normalized(expected)


class Aliyun:
    def __init__(self, profile=None):
        self.profile = profile

    def call(self, product, action, params=None, query=None, missing=None):
        command = ['aliyun', product, action, '--secure', '--read-timeout', '30',
                   '--connect-timeout', '10', '--retry-count', '0']
        if self.profile:
            command += ['--profile', self.profile]
        for key, value in (params or {}).items():
            command += ['--' + key, str(value)]
        if query:
            command += ['--cli-query', query]
        # Never return subprocess exceptions containing args or raw provider errors.
        try:
            env = dict(os.environ)
            for key in ('DEBUG', 'DEBUG_SDK', 'ALIBABA_CLOUD_DEBUG', 'ALIYUN_CLI_DEBUG'):
                env.pop(key, None)
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    universal_newlines=True, timeout=50, env=env)
        except (OSError, subprocess.TimeoutExpired):
            raise Stop('{} {} could not finish; no raw CLI output shown'.format(product, action))
        if result.returncode:
            if missing and re.search(r'(?<![\w.])' + re.escape(missing) + r'(?![\w.])', result.stdout + result.stderr):
                return None
            raise Stop('{} {} failed; inspect account/CLI permissions without printing secret parameters'.format(product, action))
        try:
            return json.loads(result.stdout)
        except ValueError:
            raise Stop('{} {} returned invalid JSON (a recent aliyun CLI with --cli-query is required)'.format(product, action))

    def configs(self, names):
        return self.call('cdn', 'DescribeCdnDomainConfigs',
                         {'DomainName': DOMAIN, 'FunctionNames': ','.join(sorted(set(names)))}, CONFIG_QUERY) or []


def arguments(config):
    return {x['ArgName']: str(x.get('ArgValue', '')) for x in config.get('FunctionArgs', {}).get('FunctionArg', [])}


def parent_id(config):
    value = str(config.get('ParentId') or '-1')
    return '-1' if value == '0' else value


def check_condition(cli, condition_id):
    # Query only conditions, never all domain configuration (which contains keys).
    response = cli.call('cdn', 'DescribeCdnDomainConfigs', {'DomainName': DOMAIN, 'FunctionNames': 'condition'})
    entries = response.get('DomainConfigs', {}).get('DomainConfig', [])
    matches = [x for x in entries if str(x.get('ConfigId')) == condition_id]
    if len(matches) != 1 or matches[0].get('Status') != 'success':
        raise Stop('Existing private-resource condition is missing or not active')
    rule = doc(arguments(matches[0]).get('rule', '{}'))
    match = rule.get('match', {})
    criteria = match.get('criteria', [])
    if rule.get('name') != CONDITION_NAME or rule.get('status') != 'enable' or len(criteria) != 1:
        raise Stop('Existing condition name/status/criteria differs; it will not be replaced')
    c = criteria[0]
    # Exact UI encoding checked below; never weaken a condition on a failed match.
    if (str(c.get('matchType', '')).lower() != 'uri'
            or str(c.get('matchOperator', '')).lower() not in ('contains', 'wildcard')
            or as_list(c.get('matchValue')) != ['/static/*'] or c.get('negate') is not True
            or c.get('caseSensitive') is not True):
        raise Stop('Private-resource condition is not the approved case-sensitive URI exclusion')
    return matches[0]


def feature(name, args, parent=None):
    result = {'functionName': name, 'functionArgs': [{'argName': k, 'argValue': str(v)} for k, v in args.items()]}
    if parent:
        result['parentId'] = int(parent)
    return result


def features(condition_id, origin):
    private = condition_id
    output = [
        # Versioned uploader headers remain authoritative: HTML=300, immutable others=1y.
        feature('path_based_ttl_set', {'path': '/static/', 'ttl': 31536000, 'weight': 80,
                'swift_origin_cache_high': 'on', 'swift_no_cache_low': 'off', 'swift_follow_cachetime': 'off'}),
        feature('filetype_based_ttl_set', {'file_type': 'html', 'ttl': 300, 'weight': 99,
                'swift_origin_cache_high': 'on', 'swift_no_cache_low': 'off', 'swift_follow_cachetime': 'off'}),
        # origin_response_header (229) returned ConfigId=0 for this CDN account.
        # Do not require a gated feature or enable DCDN. Keep the browser private,
        # request the node TTL below, and verify a real repeated media GET is a HIT.
        # A missing HIT must be resolved before claiming private media is cached.
        feature('path_based_ttl_set', {'path': '/media/', 'ttl': 86400, 'weight': 90,
                'swift_origin_cache_high': 'off', 'swift_no_cache_low': 'on', 'swift_follow_cachetime': 'off'}, private),
        feature('set_resp_header', {'key': 'Cache-Control', 'value': 'private, no-store',
                'header_operation_type': 'add', 'duplicate': 'off'}, private),
        feature('gzip', {'enable': 'on'}), feature('brotli', {'enable': 'on'}),
        feature('set_req_host_header', {'domain_name': origin}),
        feature('forward_scheme', {'enable': 'on', 'scheme_origin': 'https'}),
        feature('https_origin_sni', {'enabled': 'on', 'https_origin_sni': origin}),
    ]
    for key, value in [('Access-Control-Allow-Origin', '*'),
                       ('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS'),
                       ('Access-Control-Allow-Headers', 'Range, Content-Type'),
                       ('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag'),
                       ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer')]:
        output.append(feature('set_resp_header', {'key': key, 'value': value,
                              'header_operation_type': 'add', 'duplicate': 'off'}))
    # No generic query-stripping rule: Type A handles auth_key after authentication.
    return output


def identity(config, desired=False):
    name = config.get('functionName') if desired else config.get('FunctionName')
    args = ({x['argName']: x['argValue'] for x in config['functionArgs']} if desired else arguments(config))
    parent = str(config.get('parentId') or '-1') if desired else parent_id(config)
    discriminant = {'set_resp_header': 'key', 'origin_response_header': 'header_name',
                    'path_based_ttl_set': 'path', 'filetype_based_ttl_set': 'file_type'}.get(name)
    value = str(args.get(discriminant, ''))
    return name, parent, value.lower() if discriminant in ('key', 'header_name') else value


def upsert(cli, requested, wait_seconds):
    existing = cli.configs([x['functionName'] for x in requested])
    for item in requested:
        matches = [x for x in existing if identity(x) == identity(item, True)]
        if len(matches) > 1:
            raise Stop('Duplicate CDN feature rules found; review them before applying')
        if matches:
            item['ConfigId'] = int(matches[0]['ConfigId'])
        elif item['functionName'] in ('aliauth', 'l2_oss_key') and existing:
            # Refuse to leave a second broader auth or permanent-key origin rule active.
            raise Stop('An existing authentication/origin configuration has a different condition')
    result = cli.call('cdn', 'BatchSetCdnDomainConfig', {'DomainNames': DOMAIN, 'Functions': compact(requested)})
    rows = result.get('DomainConfigList', {}).get('DomainConfigModel', [])
    # Updates may return only newly created ConfigIds. Describe is authoritative.
    confirmed = set(str(row.get('ConfigId')) for row in rows)
    if any(not value.isdigit() or int(value) <= 0 for value in confirmed):
        raise Stop('CDN update returned an invalid confirmation; stop before private origin is enabled')
    deadline = time.time() + wait_seconds
    while True:
        current = cli.configs([x['functionName'] for x in requested])
        selected = []
        complete = True
        for item in requested:
            matches = [x for x in current if identity(x) == identity(item, True)]
            if len(matches) > 1:
                raise Stop('Duplicate CDN feature rules found after update; no further changes performed')
            if not matches:
                complete = False
                continue
            actual = matches[0]
            selected.append(actual)
            if actual.get('Status') == 'failed':
                raise Stop('CDN configuration failed; no further changes performed')
            actual_args = arguments(actual)
            wanted_args = {x['argName']: str(x['argValue']) for x in item['functionArgs']
                           if x['argName'] not in SECRET_ARGS}
            if (actual.get('Status') != 'success'
                    or any(actual_args.get(key, '') != value for key, value in wanted_args.items())):
                complete = False
        selected_ids = set(str(item.get('ConfigId')) for item in selected)
        if complete and confirmed.issubset(selected_ids):
            return
        if time.time() >= deadline:
            raise Stop('CDN configuration is missing, pending, or differs from requested arguments/scope; no further changes performed')
        time.sleep(5)


def inspect_role(cli, required=False):
    role = cli.call('ram', 'GetRole', {'RoleName': ROLE}, missing='EntityNotExist.Role')
    policy = cli.call('ram', 'GetPolicy', {'PolicyType': 'Custom', 'PolicyName': POLICY}, missing='EntityNotExist.Policy')
    attached = []
    if role:
        if not policy_equal(role.get('Role', {}).get('AssumeRolePolicyDocument', '{}'), TRUST):
            raise Stop('Existing CDN role trust differs; no automatic rewrite')
        attached = cli.call('ram', 'ListPoliciesForRole', {'RoleName': ROLE}).get('Policies', {}).get('Policy', [])
        if any(p.get('PolicyType') != 'Custom' or p.get('PolicyName') != POLICY for p in attached):
            raise Stop('CDN role already has other/broad permissions; no automatic detach or overwrite')
    if policy:
        version = cli.call('ram', 'GetPolicyVersion', {'PolicyType': 'Custom', 'PolicyName': POLICY,
                          'VersionId': policy['Policy']['DefaultVersion']})
        if not policy_equal(version['PolicyVersion']['PolicyDocument'], READ_POLICY):
            raise Stop('Existing custom policy does not match bucket-prefix-only GetObject permission')
    if required and not (role and policy and attached):
        raise Stop('Restricted CDN role is not ready; run the role stage before enabling private origin')
    return role, policy, attached


def ensure_role(cli):
    role, policy, attached = inspect_role(cli)
    if not role:
        cli.call('ram', 'CreateRole', {'RoleName': ROLE, 'AssumeRolePolicyDocument': compact(TRUST),
                 'Description': 'CDN private OSS origin; OneByOne static/media read only'})
    if not policy:
        cli.call('ram', 'CreatePolicy', {'PolicyName': POLICY, 'PolicyDocument': compact(READ_POLICY),
                 'Description': 'Only GetObject in onebyone-oss/static/* and media/*'})
    if not attached:
        cli.call('ram', 'AttachPolicyToRole', {'RoleName': ROLE, 'PolicyType': 'Custom', 'PolicyName': POLICY})
    inspect_role(cli, required=True)


def check_auth(cli, condition_id):
    rows = cli.configs(['aliauth'])
    if len(rows) != 1:
        raise Stop('Exactly one private-resource authentication rule is required')
    item = rows[0]
    args = arguments(item)
    if (item.get('Status') != 'success' or parent_id(item) != condition_id
            or args.get('auth_type') != 'type_a' or args.get('ali_auth_delta') != '1800'
            or args.get('req_auth_ip_white', '').strip()):
        raise Stop('Private-resource Type A / 1800s authentication is not fully active')


def load_key(path):
    info = os.stat(path)
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise Stop('The assets configuration must be a private regular file (chmod 600)')
    with open(path, 'r', encoding='utf-8') as stream:
        config = json.load(stream)
    if config.get('bucket') != BUCKET:
        raise Stop('Assets configuration bucket differs from the approved bucket')
    key = config.get('mediaSigningKey', '')
    if not isinstance(key, str) or not re.match(r'^[A-Za-z0-9]{16,128}$', key):
        raise Stop('mediaSigningKey must meet the documented Type A key format')
    return key


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--config', default=os.path.expanduser('~/onebyone-assets.json'))
    parser.add_argument('--condition-id', default=CONDITION_ID)
    parser.add_argument('--origin', default='onebyone-oss.oss-cn-wulanchabu.aliyuncs.com')
    parser.add_argument('--profile')
    parser.add_argument('--stage', choices=['all', 'auth', 'role', 'features', 'origin'], default='all')
    parser.add_argument('--wait-seconds', type=int, default=300)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args(argv)
    if not args.condition_id.isdigit() or args.origin != 'onebyone-oss.oss-cn-wulanchabu.aliyuncs.com':
        raise Stop('Condition/origin does not match the approved deployment')
    if not 5 <= args.wait_seconds <= 600:
        raise Stop('wait-seconds must be between 5 and 600')
    print('Domain: {} | stage: {} | condition: {}'.format(DOMAIN, args.stage, args.condition_id))
    if not args.apply and not args.check:
        print('PLAN ONLY: no credentials read and no cloud API calls. Use --check or --apply explicitly.')
        print('Order: validate condition -> Type A 1800s -> prefix-only RAM role -> cache/CORS/compression -> private OSS origin.')
        print('Browser media: private,no-store; edge media: 1 day. Static: origin headers, HTML 5 minutes, other versioned files 1 year.')
        print('Role permits only oss:GetObject on onebyone-oss/static/* and media/*. No bucket ACL/list access changes.')
        return 0
    cli = Aliyun(args.profile)
    check_condition(cli, args.condition_id)
    inspect_role(cli)  # Preflight all existing role permissions before any mutations.
    if args.check:
        print('Read-only condition and restricted-role preflight passed. No cloud changes made.')
        return 0
    if args.stage in ('all', 'auth'):
        key = load_key(os.path.abspath(os.path.expanduser(args.config)))
        auth = feature('aliauth', {'auth_type': 'type_a', 'auth_key1': key, 'auth_key2': key,
                       'ali_auth_delta': 1800, 'auth_m3u8': 'off', 'req_auth_ip_white': ''}, args.condition_id)
        upsert(cli, [auth], args.wait_seconds)
        check_auth(cli, args.condition_id)
        print('Private-resource URL authentication is active.')
    if args.stage in ('all', 'role'):
        ensure_role(cli)
        print('CDN role has only the approved bucket-prefix read policy.')
    if args.stage in ('all', 'features', 'origin'):
        check_auth(cli, args.condition_id)
    if args.stage in ('all', 'features'):
        upsert(cli, features(args.condition_id, args.origin), args.wait_seconds)
        print('Cache, response headers, compression and HTTPS origin settings are active.')
    if args.stage in ('all', 'origin'):
        inspect_role(cli, required=True)
        upsert(cli, [feature('l2_oss_key', {'private_oss_auth': 'on'})], args.wait_seconds)
        print('Private OSS origin STS authentication is active.')
    print('Done. Verify static anonymous 200; media unsigned/expired 403; signed 200; browser private,no-store and repeat edge cache HIT.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Stop as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError):
        print('STOP: invalid local/provider data; raw values omitted to protect secrets', file=sys.stderr)
        sys.exit(1)
