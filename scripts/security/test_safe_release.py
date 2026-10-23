import copy
import unittest
from unittest.mock import patch
import safe_release as release


class ReleaseTests(unittest.TestCase):
    def test_lms_custom_container_is_detected(self):
        self.assertEqual(release.upstream_target('upstream backend { server proryv_app_security_20260917:3000; }', 'backend'), ('proryv_app_security_20260917', '3000'))

    def test_prep_frontend_is_unchanged(self):
        text = 'upstream frontend_backend { server frontend-green:3000; }\nupstream api_backend { server old-api:3001; }'
        result = release.replace_target(text, 'api_backend', 'old-api', 'new-api', 3001)
        self.assertIn('server frontend-green:3000;', result)
        self.assertIn('server new-api:3001;', result)

    def test_reject_missing_upstream(self):
        with self.assertRaises(ValueError):
            release.upstream_target('upstream other { server x:3000; }', 'backend')

    def test_reject_multiple_backends(self):
        with self.assertRaises(ValueError):
            release.upstream_target('upstream backend { server x:3000; server y:3000; }', 'backend')

    def test_reject_concurrent_change(self):
        with self.assertRaises(ValueError):
            release.replace_target('upstream backend { server x:3000; }', 'backend', 'different', 'new', 3000)

    def test_immutable_candidate_and_revision(self):
        sha = 'a' * 40
        release.validate_candidate({'Id': 'sha256:' + 'b' * 64, 'Config': {'Labels': {'org.opencontainers.image.revision': sha}}}, sha)

    def test_reject_wrong_revision_label(self):
        with self.assertRaises(ValueError):
            release.validate_candidate({'Id': 'sha256:' + 'b' * 64, 'Config': {'Labels': {'org.opencontainers.image.revision': 'c' * 40}}}, 'a' * 40)

    def test_reject_missing_revision_label(self):
        with self.assertRaises(ValueError):
            release.validate_candidate({'Id': 'sha256:' + 'b' * 64, 'Config': {}}, 'a' * 40)

    def test_reject_short_revision(self):
        with self.assertRaises(ValueError):
            release.validate_candidate({}, '123abc')

    def test_reject_mutable_image_id(self):
        with self.assertRaises(ValueError):
            release.validate_candidate({'Id': 'latest', 'Config': {'Labels': {'org.opencontainers.image.revision': 'a' * 40}}}, 'a' * 40)

    def fixture(self):
        return {'NetworkSettings': {'Networks': {'production': {}}},
                'Config': {'Env': ['SECRET=synthetic'], 'User': '1001', 'WorkingDir': '/app', 'Entrypoint': ['docker-entrypoint.sh'],
                           'Cmd': ['sh', '-c', 'forbidden migration'], 'Labels': {'com.docker.compose.project': 'old'}},
                'HostConfig': {'PortBindings': {'3000/tcp': [{'HostPort': '3000'}]}, 'Binds': ['uploads:/app/uploads:rw'], 'RestartPolicy': {'Name': 'always'}}}

    def test_candidate_preserves_runtime_without_ports_or_compose_labels(self):
        old = self.fixture()
        original = copy.deepcopy(old)
        cfg = release.config_for(old, 'sha256:' + 'b' * 64, 'candidate', ['node', 'server.js'])
        self.assertEqual(old, original)
        self.assertEqual(cfg['Env'], old['Config']['Env'])
        self.assertEqual(cfg['HostConfig']['Binds'], old['HostConfig']['Binds'])
        self.assertEqual(cfg['HostConfig']['PortBindings'], {})
        self.assertNotIn('com.docker.compose.project', cfg['Labels'])
        self.assertEqual(cfg['Cmd'], ['node', 'server.js'])
        self.assertIsNone(cfg['Entrypoint'])
        self.assertEqual(cfg['HostConfig']['RestartPolicy']['Name'], 'unless-stopped')

    def test_reject_multiple_networks(self):
        old = self.fixture()
        old['NetworkSettings']['Networks']['other'] = {}
        with self.assertRaises(ValueError):
            release.config_for(old, 'image', 'candidate', ['node', 'server.js'])

    def test_failed_https_status_aborts(self):
        with patch.object(release, 'run', return_value='500'):
            with self.assertRaises(RuntimeError):
                release.https_probe('example.invalid', 'lms')


if __name__ == '__main__':
    unittest.main()
