#!/usr/bin/env python3
"""Explicit, image-based API/application releases. No Git writes or migrations."""
import argparse
import copy
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time


def run(args, **kwargs):
    return subprocess.check_output(args, text=True, timeout=kwargs.pop('timeout', 30), **kwargs).strip()


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def upstream_target(text, block):
    match = re.search(r'\bupstream\s+' + re.escape(block) + r'\s*\{([^{}]*)\}', text)
    if not match:
        raise ValueError('Expected upstream block missing')
    servers = re.findall(r'\bserver\s+([a-zA-Z0-9_.-]+):(\d+)\s*;', match[1])
    if len(servers) != 1:
        raise ValueError('Only a single explicit upstream is supported')
    return servers[0]


def replace_target(text, block, expected, new, port):
    if upstream_target(text, block) != (expected, str(port)):
        raise ValueError('Upstream changed')
    pattern = r'(\bupstream\s+' + re.escape(block) + r'\s*\{)([^{}]*)(\})'
    return re.sub(pattern, lambda m: m[1] + m[2].replace(expected + ':' + str(port), new + ':' + str(port)) + m[3], text, count=1)


def validate_candidate(image, revision):
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Use a full Git revision')
    if image.get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision:
        raise ValueError('Image lacks the exact source revision label')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', image['Id']):
        raise ValueError('Image must resolve to an immutable ID')


def config_for(current, image, name, command):
    networks = current['NetworkSettings']['Networks']
    if len(networks) != 1:
        raise ValueError('Exactly one existing Docker network required')
    network = next(iter(networks))
    cfg = {k: copy.deepcopy(current['Config'][k]) for k in
           ['Env', 'User', 'WorkingDir', 'Entrypoint', 'ExposedPorts', 'Healthcheck', 'StopSignal'] if k in current['Config']}
    cfg.update(Image=image, Entrypoint=None, Cmd=command, Hostname=name, Labels={'security.safe-release': 'v1'})
    hc = copy.deepcopy(current['HostConfig'])
    hc.update(NetworkMode=network, PortBindings={}, PublishAllPorts=False, AutoRemove=False, ContainerIDFile='')
    hc['RestartPolicy'] = {'Name': 'unless-stopped', 'MaximumRetryCount': 0}
    cfg.update(HostConfig=hc, NetworkingConfig={'EndpointsConfig': {network: {'Aliases': [name]}}})
    return cfg


class DockerSocket(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(20)
        self.sock.connect('/var/run/docker.sock')


def api(method, path, body=None):
    conn = DockerSocket('localhost', timeout=20)
    conn.request(method, path, json.dumps(body) if body is not None else None, {'Content-Type': 'application/json'})
    response = conn.getresponse()
    response.read()
    conn.close()
    if response.status >= 300:
        raise RuntimeError('Docker operation failed: HTTP ' + str(response.status))


def write_atomic(path, text):
    temp = path.with_name(path.name + '.safe-release-tmp')
    temp.write_text(text)
    temp.chmod(0o644)
    os.replace(temp, path)


def healthy(name, port):
    js = "fetch('http://127.0.0.1:%s/api/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" % port
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if subprocess.run(['docker', 'exec', name, 'node', '-e', js], stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, timeout=5).returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Application readiness timeout')


def reload_nginx(name):
    for args in [['nginx', '-t'], ['nginx', '-s', 'reload']]:
        run(['docker', 'exec', name, *args], stderr=subprocess.DEVNULL)


def https_probe(host, kind):
    paths = [('/api/health', '200'), ('/login', '200')] if kind == 'lms' else [('/api/health', '200'), ('/api/assignments/security-nonexistent', '401')]
    for path, expected in paths:
        status = run(['curl', '--silent', '--show-error', '--max-time', '10', '--resolve', host + ':443:127.0.0.1',
                      '-o', '/dev/null', '-w', '%{http_code}', 'https://' + host + path])
        if status != expected:
            raise RuntimeError('HTTPS verification failed: ' + path + ' status=' + status)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Read-only preflight (default)')
    mode.add_argument('--apply', action='store_true', help='Explicit production release of a prebuilt image')
    parser.add_argument('--image')
    parser.add_argument('--revision')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    manifest = json.loads((Path(__file__).parent / 'manifest.json').read_text())
    kind = manifest['project']
    if kind not in ('lms', 'prep'):
        raise ValueError('Unknown project')
    for file, digest in manifest['security_files'].items():
        if hashlib.sha256((repo / file).read_bytes()).hexdigest() != digest:
            raise ValueError('Security baseline changed; review and update tests/manifest: ' + file)
    if Path(run(['git', '-C', str(repo), 'rev-parse', '--show-toplevel'])) != repo:
        raise ValueError('Unexpected Git root')
    revision = run(['git', '-C', str(repo), 'rev-parse', 'HEAD'])
    dirty = run(['git', '-C', str(repo), 'diff', 'HEAD', '--name-only']).splitlines()
    block, port, nginx, host = ('backend', 3000, 'proryv_nginx', 'prrv.tech') if kind == 'lms' else ('api_backend', 3001, 'prepodavai-nginx-prod', 'api.prepodavai.ru')
    upstream = repo / 'nginx/conf.d/upstream.conf'
    previous = upstream.read_text()
    old_name, old_port = upstream_target(previous, block)
    if int(old_port) != port:
        raise ValueError('Unexpected upstream port')
    old = inspect(old_name)
    command = ['node', 'server.js'] if kind == 'lms' else ['node', 'dist/main.js']
    # Safe restart during rollback must not execute the historical migration command.
    safe_entrypoints = (None, [], ['docker-entrypoint.sh'], ['/usr/local/bin/docker-entrypoint.sh'])
    if old['Config']['Cmd'] != command or old['Config'].get('Entrypoint') not in safe_entrypoints or not old['State']['Running']:
        raise ValueError('Current container must be running with the explicit migration-free node command')
    image_old = inspect(old['Image'])
    healthy(old_name, port)
    https_probe(host, kind)
    # nginx target is intentionally runtime-managed, all other tracked changes require review.
    source_dirty = [p for p in dirty if p != 'nginx/conf.d/upstream.conf']
    print(json.dumps({'mode': 'apply' if args.apply else 'check', 'project': kind, 'revision': revision,
                      'current_container': old_name, 'healthy': True, 'rollback_image_available': bool(image_old),
                      'uncommitted_source_files': source_dirty, 'frontend_and_workers_changed': False}), flush=True)
    if not args.apply:
        return
    if not args.image or args.revision != revision or source_dirty:
        raise ValueError('Apply needs --image, --revision equal to HEAD, and no uncommitted source changes')
    image = inspect(args.image)
    validate_candidate(image, revision)
    image_id = image['Id']
    schema_old = run(['docker', 'exec', old_name, 'sha256sum', '/app/prisma/schema.prisma']).split()[0]
    schema_new = run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'sha256sum', image_id, '/app/prisma/schema.prisma']).split()[0]
    if schema_old != schema_new:
        raise ValueError('Schema changed: a separately reviewed migration plan is required; nothing deployed')
    # Separate internal network + synthetic DB; never inject production environment into tests.
    from isolated_checks import run_checks
    run_checks(kind, image_id, Path(__file__).parent / 'container_checks.cjs')
    if upstream.read_text() != previous or not inspect(old_name)['State']['Running']:
        raise ValueError('Production state changed during checks')
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    name = ('proryv_app_release_' if kind == 'lms' else 'prepodavai_backend_release_') + stamp
    backup_dir = Path('/root/security-release-history') / (kind + '-' + stamp)
    backup_dir.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(backup_dir.parent, 0o700)
    for file, value in [('container-inspect.json', json.dumps(old)), ('upstream.conf', previous)]:
        (backup_dir / file).write_text(value)
        (backup_dir / file).chmod(0o600)
    state = {'previous_container': old_name, 'previous_image': old['Image'], 'new_container': name,
             'new_image': image_id, 'revision': revision, 'phase': 'prepared'}
    def record(phase):
        state['phase'] = phase
        (backup_dir / 'state.json').write_text(json.dumps(state, indent=2))
    record('prepared')
    switched = started = old_stopped = False
    def interrupted(*unused):
        raise RuntimeError('Release interrupted')
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        api('POST', '/containers/create?name=' + name, config_for(old, image_id, name, command))
        api('POST', '/containers/' + name + '/start')
        started = True
        healthy(name, port)
        if upstream.read_text() != previous:
            raise ValueError('Upstream changed before switch')
        write_atomic(upstream, replace_target(previous, block, old_name, name, port))
        # Mark before reload: rollback must restore both disk and nginx on a partial failure.
        switched = True
        reload_nginx(nginx)
        https_probe(host, kind)
        record('switched')
        old_stopped = True
        run(['docker', 'stop', '--time', '15', old_name], timeout=25)
        https_probe(host, kind)
        record('verified')
        print(json.dumps({'released': True, 'container': name, 'image': image_id, 'backup': str(backup_dir), 'migrations': False}))
    except BaseException:
        if old_stopped and not inspect(old_name)['State']['Running']:
            run(['docker', 'start', old_name])  # explicit node command asserted above
            healthy(old_name, port)
        write_atomic(upstream, previous)
        if switched:
            reload_nginx(nginx)
        if started:
            run(['docker', 'stop', '--time', '10', name], timeout=20)
        record('rolled_back')
        raise


if __name__ == '__main__':
    os.umask(0o077)
    # Lock is acquired only for explicit apply. Check mode does not write server state.
    if '--apply' in sys.argv:
        with open('/var/lock/security-safe-release.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            main()
    else:
        main()
