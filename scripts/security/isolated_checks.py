"""Run the committed access regression checks against an immutable Docker image."""
import json
import subprocess
import time
import uuid


def run_checks(kind, image, test_file):
    suffix = uuid.uuid4().hex[:10]
    prefix = 'access-check-' + suffix
    network, db, redis, web = (prefix + s for s in ['-net', '-db', '-redis', '-web'])
    created = []
    network_created = False
    def run(args, **kwargs):
        return subprocess.run(args, check=True, timeout=kwargs.pop('timeout', 180), **kwargs)
    def image_for(name):
        return subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', name], text=True).strip()
    pgimage = image_for('proryv_postgres' if kind == 'lms' else 'prepodavai-postgres-prod')
    redisimage = image_for('proryv_redis' if kind == 'lms' else 'prepodavai-redis-prod')
    env = ['-e', 'DATABASE_URL=postgresql://synthetic:synthetic@security-db:5432/synthetic',
           '-e', 'DIRECT_URL=postgresql://synthetic:synthetic@security-db:5432/synthetic',
           '-e', 'JWT_SECRET=synthetic-container-test-only-secret',
           '-e', 'JWT_REFRESH_SECRET=synthetic-container-test-only-secret',
           '-e', 'REDIS_URL=redis://security-redis:6379', '-e', 'NEXT_TELEMETRY_DISABLED=1']
    try:
        run(['docker', 'network', 'create', '--internal', network], stdout=subprocess.DEVNULL)
        network_created = True
        created.append(db)
        run(['docker', 'run', '-d', '--name', db, '--network', network, '--network-alias', 'security-db',
             '--memory', '512m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
             '-e', 'POSTGRES_USER=synthetic', '-e', 'POSTGRES_PASSWORD=synthetic', '-e', 'POSTGRES_DB=synthetic', pgimage], stdout=subprocess.DEVNULL)
        for _ in range(30):
            if subprocess.run(['docker', 'exec', db, 'pg_isready', '-U', 'synthetic'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5).returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Synthetic database readiness timeout')
        created.append(redis)
        run(['docker', 'run', '-d', '--name', redis, '--network', network, '--network-alias', 'security-redis',
             '--memory', '64m', redisimage, 'redis-server', '--save', '', '--appendonly', 'no', '--maxmemory', '32mb'], stdout=subprocess.DEVNULL)
        cli = ['prisma', 'db', 'push', '--skip-generate'] if kind == 'lms' else ['node', 'node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate']
        # db push is exclusively for the new tmpfs database on the internal test network.
        run(['docker', 'run', '--rm', '--network', network, '--memory', '768m', *env, '--entrypoint', cli[0], image, *cli[1:]])
        if kind == 'lms':
            created.append(web)
            run(['docker', 'run', '-d', '--name', web, '--network', network, '--network-alias', 'security-web',
                 '--memory', '1536m', '--cpus', '1.5', *env, '--entrypoint', 'node', image, 'server.js'], stdout=subprocess.DEVNULL)
            for _ in range(30):
                probe = "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
                if subprocess.run(['docker', 'exec', web, 'node', '-e', probe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5).returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Synthetic web readiness timeout')
        test_name = prefix + '-runner'
        created.append(test_name)
        run(['docker', 'run', '--rm', '--name', test_name, '--network', network, '--memory', '1024m', '--cpus', '1.5',
             *env, '-v', str(test_file.resolve()) + ':/app/security-container-test.cjs:ro', '--entrypoint', 'node',
             image, '/app/security-container-test.cjs', kind], timeout=180)
        print(json.dumps({'access_checks': 'passed', 'image': image, 'production_database_used': False}), flush=True)
    finally:
        for name in reversed(created):
            subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        if network_created:
            subprocess.run(['docker', 'network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)


if __name__ == '__main__':
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser()
    parser.add_argument('project', choices=['lms', 'prep'])
    parser.add_argument('image')
    args = parser.parse_args()
    image_id = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', args.image], text=True).strip()
    run_checks(args.project, image_id, Path(__file__).with_name('container_checks.cjs'))
