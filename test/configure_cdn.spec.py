#!/usr/bin/env python3
"""Offline only: never invokes aliyun, opens credentials, or changes cloud state."""
import ast
import contextlib
import importlib.util
import io
import json
import sys
from pathlib import Path
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'build/assets/configure-cdn.py'
spec = importlib.util.spec_from_file_location('configure_cdn', str(SOURCE))
cdn = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(cdn)

RULE = {'match': {'logic': 'and', 'criteria': [{'matchType': 'uri', 'matchObject': '',
        'matchOperator': 'contains', 'matchValue': ['/static/*'], 'caseSensitive': True, 'negate': True}]},
        'name': cdn.CONDITION_NAME, 'status': 'enable'}


def row(feature, config_id=100):
    return {'ConfigId': config_id, 'ParentId': feature.get('parentId', 0),
            'FunctionName': feature['functionName'], 'Status': 'success',
            'FunctionArgs': {'FunctionArg': [{'ArgName': x['argName'], 'ArgValue': x['argValue']}
                             for x in feature['functionArgs'] if x['argName'] not in cdn.SECRET_ARGS]}}


class FakeCLI:
    def __init__(self):
        self.items = []
        self.calls = []
        self.role = None
        self.policy = None
        self.attached = []

    def configs(self, names):
        return [x for x in self.items if x['FunctionName'] in names]

    def call(self, product, action, params=None, query=None, missing=None):
        self.calls.append((product, action, params))
        if action == 'DescribeCdnDomainConfigs':
            assert params['FunctionNames'] == 'condition'
            return {'DomainConfigs': {'DomainConfig': [row(cdn.feature('condition', {'rule': json.dumps(RULE)}), cdn.CONDITION_ID)]}}
        if action == 'BatchSetCdnDomainConfig':
            out = []
            for feature in json.loads(params['Functions']):
                config_id = feature.get('ConfigId', len(self.items) + 100)
                self.items = [x for x in self.items if x['ConfigId'] != config_id]
                self.items.append(row(feature, config_id))
                out.append({'ConfigId': config_id})
            return {'DomainConfigList': {'DomainConfigModel': out}}
        if action == 'GetRole':
            return self.role
        if action == 'GetPolicy':
            return self.policy
        if action == 'ListPoliciesForRole':
            return {'Policies': {'Policy': self.attached}}
        if action == 'GetPolicyVersion':
            return {'PolicyVersion': {'PolicyDocument': cdn.READ_POLICY}}
        if action == 'CreateRole':
            self.role = {'Role': {'AssumeRolePolicyDocument': json.loads(params['AssumeRolePolicyDocument'])}}
            return self.role
        if action == 'CreatePolicy':
            assert json.loads(params['PolicyDocument']) == cdn.READ_POLICY
            self.policy = {'Policy': {'DefaultVersion': 'v1'}}
            return self.policy
        if action == 'AttachPolicyToRole':
            self.attached = [{'PolicyName': cdn.POLICY, 'PolicyType': 'Custom'}]
            return {}
        raise AssertionError(action)


class CDNTests(unittest.TestCase):
    def test_python36_grammar(self):
        ast.parse(SOURCE.read_text(), feature_version=(3, 6))

    def test_default_plan_is_fully_offline_and_does_not_read_keys(self):
        with patch.object(cdn, 'Aliyun', side_effect=AssertionError('network')), \
                patch.object(cdn, 'load_key', side_effect=AssertionError('credentials')), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cdn.main([]), 0)
        self.assertIn('PLAN ONLY', output.getvalue())

    def test_approved_ui_condition_and_reject_weakened_rule(self):
        cli = FakeCLI()
        cdn.check_condition(cli, cdn.CONDITION_ID)
        with patch.dict(RULE['match']['criteria'][0], {'negate': False}):
            with self.assertRaises(cdn.Stop):
                cdn.check_condition(cli, cdn.CONDITION_ID)
        self.assertTrue(all(x[2]['FunctionNames'] == 'condition' for x in cli.calls))

    def test_all_stage_applies_auth_before_private_origin_without_secret_output(self):
        cli = FakeCLI()
        secret = 'OfflineOnlySecret1234567890'
        with patch.object(cdn, 'Aliyun', return_value=cli), patch.object(cdn, 'load_key', return_value=secret), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cdn.main(['--apply']), 0)
        self.assertNotIn(secret, output.getvalue())
        changes = [json.loads(x[2]['Functions']) for x in cli.calls if x[1] == 'BatchSetCdnDomainConfig']
        self.assertEqual(changes[0][0]['functionName'], 'aliauth')
        self.assertEqual(changes[0][0]['parentId'], int(cdn.CONDITION_ID))
        self.assertEqual(changes[-1], [cdn.feature('l2_oss_key', {'private_oss_auth': 'on'})])
        self.assertEqual(cli.attached, [{'PolicyName': cdn.POLICY, 'PolicyType': 'Custom'}])
        self.assertNotIn('condition', [y['functionName'] for batch in changes for y in batch])

    def test_rerun_updates_existing_config_ids(self):
        cli = FakeCLI()
        for _ in range(2):
            cdn.upsert(cli, cdn.features(cdn.CONDITION_ID, 'bucket.example'), 5)
        requests = [json.loads(x[2]['Functions']) for x in cli.calls if x[1] == 'BatchSetCdnDomainConfig']
        self.assertTrue(all('ConfigId' in x for x in requests[1]))
        self.assertEqual(len(cli.items), len(requests[0]))

    def test_mixed_create_update_accepts_only_new_ids_in_batch_response(self):
        class PartialResponse(FakeCLI):
            def call(self, product, action, params=None, query=None, missing=None):
                before = set(x['ConfigId'] for x in self.items)
                result = super().call(product, action, params, query, missing)
                if action == 'BatchSetCdnDomainConfig':
                    rows = result['DomainConfigList']['DomainConfigModel']
                    result['DomainConfigList']['DomainConfigModel'] = [x for x in rows if x['ConfigId'] not in before]
                return result
        cli = PartialResponse()
        requested = cdn.features(cdn.CONDITION_ID, 'bucket.example')
        cli.items = [row(requested[0], 100), row(requested[1], 101)]
        cdn.upsert(cli, requested, 5)
        self.assertEqual(len(cli.items), len(requested))
        # An all-update response may omit every ConfigId; full Describe verification still protects it.
        cdn.upsert(cli, cdn.features(cdn.CONDITION_ID, 'bucket.example'), 5)
        self.assertEqual(len(cli.items), len(requested))

    def test_describe_rejects_missing_duplicates_failures_wrong_scope_and_arguments(self):
        class FaultyResponse(FakeCLI):
            fault = ''
            def call(self, product, action, params=None, query=None, missing=None):
                result = super().call(product, action, params, query, missing)
                if action != 'BatchSetCdnDomainConfig':
                    return result
                if self.fault == 'missing':
                    self.items = []
                elif self.fault == 'duplicate':
                    self.items.append(dict(self.items[0], ConfigId=999))
                elif self.fault == 'failed':
                    self.items[0]['Status'] = 'failed'
                elif self.fault == 'wrong_scope':
                    self.items[0]['ParentId'] = 0
                elif self.fault == 'wrong_arguments':
                    self.items[0]['FunctionArgs']['FunctionArg'][0]['ArgValue'] = 'WRONG'
                elif self.fault == 'invalid_confirmation':
                    result['DomainConfigList']['DomainConfigModel'] = [{'ConfigId': 0}]
                elif self.fault == 'unrelated_confirmation':
                    result['DomainConfigList']['DomainConfigModel'] = [{'ConfigId': 999}]
                return result
        for fault in ('missing', 'duplicate', 'failed', 'wrong_scope', 'wrong_arguments',
                      'invalid_confirmation', 'unrelated_confirmation'):
            with self.subTest(fault=fault):
                cli = FaultyResponse()
                cli.fault = fault
                requested = [cdn.feature('set_resp_header', {'key': 'Cache-Control', 'value': 'private, no-store'}, cdn.CONDITION_ID)]
                with patch.object(cdn.time, 'time', side_effect=[0, 6]):
                    with self.assertRaises(cdn.Stop):
                        cdn.upsert(cli, requested, 5)

    def test_auth_verification_ignores_only_redacted_secret_parameters(self):
        cli = FakeCLI()
        auth = cdn.feature('aliauth', {'auth_type': 'type_a', 'auth_key1': 'offlineSecret123456',
                           'auth_key2': 'offlineSecret123456', 'ali_auth_delta': 1800}, cdn.CONDITION_ID)
        cdn.upsert(cli, [auth], 5)
        self.assertEqual(cdn.arguments(cli.items[0]), {'auth_type': 'type_a', 'ali_auth_delta': '1800'})
        cdn.check_auth(cli, cdn.CONDITION_ID)

    def test_origin_stage_requires_active_scoped_auth(self):
        cli = FakeCLI()
        with patch.object(cdn, 'Aliyun', return_value=cli), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(cdn.Stop):
                cdn.main(['--apply', '--stage', 'origin'])
        self.assertFalse(any(x[1] == 'BatchSetCdnDomainConfig' for x in cli.calls))

    def test_existing_broad_role_is_rejected_without_detaching(self):
        cli = FakeCLI()
        cli.role = {'Role': {'AssumeRolePolicyDocument': cdn.TRUST}}
        cli.attached = [{'PolicyName': 'AliyunCDNAccessingPrivateOSSRolePolicy', 'PolicyType': 'System'}]
        with self.assertRaises(cdn.Stop):
            cdn.ensure_role(cli)
        self.assertFalse(any(x[1].startswith(('Attach', 'Detach', 'Create')) for x in cli.calls))

    def test_policy_scope_exactly_two_prefixes_read_only(self):
        statement = cdn.READ_POLICY['Statement'][0]
        self.assertEqual(statement['Action'], ['oss:GetObject'])
        self.assertEqual(set(statement['Resource']), {'acs:oss:*:*:onebyone-oss/static/*', 'acs:oss:*:*:onebyone-oss/media/*'})
        broad = {'Version': '1', 'Statement': [dict(statement, Resource='*')]}
        self.assertFalse(cdn.policy_equal(broad, cdn.READ_POLICY))

    def test_node_ttl_and_private_browser_headers_without_gated_origin_rewrite(self):
        desired = cdn.features(cdn.CONDITION_ID, 'bucket.example')
        headers = [row(x) for x in desired if x['functionName'] in ('set_resp_header', 'origin_response_header')]
        private = [x for x in headers if cdn.parent_id(x) == cdn.CONDITION_ID]
        self.assertEqual(len(private), 1)
        outgoing = private[0]
        self.assertNotIn('origin_response_header', [x['functionName'] for x in desired])
        media = next(row(x) for x in desired if x['functionName'] == 'path_based_ttl_set' and cdn.parent_id(row(x)) == cdn.CONDITION_ID)
        self.assertEqual(cdn.arguments(media)['ttl'], '86400')
        self.assertEqual(cdn.arguments(media)['swift_no_cache_low'], 'on')
        self.assertEqual(cdn.arguments(media)['swift_origin_cache_high'], 'off')
        self.assertEqual(cdn.arguments(outgoing)['value'], 'private, no-store')
        self.assertFalse(any(cdn.arguments(x).get('key') == 'Access-Control-Allow-Credentials' for x in headers))
        self.assertNotIn('set_hashkey_args', [x['functionName'] for x in desired])
        self.assertIn("ArgName!='auth_key1'", cdn.CONFIG_QUERY)
        self.assertIn("ArgName!='auth_key2'", cdn.CONFIG_QUERY)


if __name__ == '__main__':
    unittest.main()
