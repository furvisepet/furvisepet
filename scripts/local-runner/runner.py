"""Bounded local Codex queue. Python 3.11+, Git, native Codex executable."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time


def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2), encoding='utf-8')
    os.replace(temp, path)


@contextlib.contextmanager
def lock(path):
    with path.open('a+b') as f:
        f.seek(0)
        if os.name == 'nt':
            import msvcrt
            if path.stat().st_size == 0:
                f.write(b'0'); f.flush(); f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)


def kill_tree(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
    else:
        import signal
        os.killpg(process.pid, signal.SIGKILL)
    process.wait(timeout=15)


def execute(argv, cwd, log, timeout, stop, stdin=None):
    if stop.exists() or timeout <= 0:
        raise RuntimeError('Stop requested or run budget exhausted')
    env = {k:v for k,v in os.environ.items() if not any(s in k.upper() for s in ('API_KEY', 'TOKEN', 'SECRET', 'PASSWORD'))}
    with log.open('wb') as output:
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
            stdout=output, stderr=subprocess.STDOUT, start_new_session=os.name != 'nt')
        try:
            if stdin:
                process.stdin.write(stdin.encode('utf-8'))
            process.stdin.close()
            deadline = time.monotonic() + timeout
            while process.poll() is None:
                if stop.exists() or time.monotonic() >= deadline:
                    raise RuntimeError('Stop requested or command timeout; inspect log and worktree')
                time.sleep(.2)
            if process.returncode:
                raise RuntimeError(f'Command exited {process.returncode}; see {log.name}')
        finally:
            kill_tree(process)


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True, encoding='utf-8').strip()


def validate(queue):
    if queue.get('version') != 1 or not 1 <= len(queue.get('tasks', [])) <= 4:
        raise ValueError('Queue version 1 requires 1-4 explicitly approved tasks')
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', queue.get('model', '')):
        raise ValueError('Explicit model required')
    if not 30 <= queue.get('timeout_seconds', 0) <= 7200:
        raise ValueError('Per-command timeout must be 30-7200 seconds')
    ids = set()
    for task in queue['tasks']:
        if not re.fullmatch(r'[a-z0-9-]{1,40}', task.get('id', '')) or task['id'] in ids:
            raise ValueError('Task IDs must be unique simple names')
        ids.add(task['id'])
        if not isinstance(task.get('prompt'), str) or not task['prompt'].strip():
            raise ValueError('Task prompt required')
        if not task.get('verify') or len(task['verify']) > 6:
            raise ValueError('1-6 verification commands required')
        for command in task['verify']:
            if not isinstance(command, list) or not command or not all(isinstance(x,str) and x for x in command):
                raise ValueError('Verification commands must be argument arrays, never shell strings')
        if not task.get('allowed_paths'):
            raise ValueError('Explicit writable path prefixes required')
        for path in task['allowed_paths']:
            if not isinstance(path,str) or not path or path.startswith(('/', '.')) or '\\' in path or '..' in path.split('/'):
                raise ValueError('Unsafe allowed path')


def allowed(path, prefixes):
    return any(path == prefix or prefix.endswith('/') and path.startswith(prefix) for prefix in prefixes)


def codex_args(executable, worktree, taskdir, model):
    return [str(executable), 'exec', '--ignore-user-config', '--sandbox', 'workspace-write',
        '-c', 'approval_policy="never"', '-c', 'sandbox_workspace_write.network_access=false',
        '--model', model, '--color', 'never', '--json', '--cd', str(worktree),
        '--output-schema', str(taskdir/'schema.json'), '--output-last-message', str(taskdir/'answer.json'), '-']


SCHEMA = {'type':'object','properties':{'status':{'type':'string','enum':['done','blocked']},
    'summary':{'type':'string'}},'required':['status','summary'],'additionalProperties':False}


def logged_in(executable):
    auth = subprocess.run([str(executable),'login','status'],capture_output=True,text=True,timeout=30)
    return auth.returncode == 0 and 'Logged in using ChatGPT' in auth.stdout + auth.stderr


def run(queue_path, repo, root, executable):
    queue_bytes = queue_path.read_bytes()
    queue = json.loads(queue_bytes)
    validate(queue)
    repo, root, executable = repo.resolve(), root.resolve(), executable.resolve()
    if root == repo or repo in root.parents:
        raise ValueError('Run directory must be outside source worktree')
    if not executable.is_file() or executable.suffix.lower() in ('.cmd', '.bat', '.ps1'):
        raise ValueError('Use a native Codex executable, not a shell shim')
    root.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256(queue_bytes).hexdigest()
    with lock(root/'runner.lock'):
        statefile = root/'state.json'
        if statefile.exists():
            state = json.loads(statefile.read_text(encoding='utf-8'))
            if state['queue_hash'] != fingerprint or state['repo'] != str(repo):
                raise RuntimeError('Queue/repo changed; use a new run directory')
            if state['status'] in ('running','blocked'):
                raise RuntimeError('Interrupted/blocked run requires review; no automatic retry')
        else:
            state = {'queue_hash':fingerprint,'repo':str(repo),'base':git(repo,'rev-parse','HEAD'),
                'status':'ready','completed':[]}
            save(statefile,state)
        if state['status'] == 'complete':
            return state
        stop = root/'STOP'
        if stop.exists():
            raise RuntimeError('STOP file exists')
        if not logged_in(executable):
            raise RuntimeError('Existing ChatGPT CLI login required; no API-key fallback')
        session_deadline = time.monotonic() + 8 * 3600
        for task in queue['tasks'][len(state['completed']):]:
            if stop.exists():
                raise RuntimeError('STOP requested before next task')
            taskdir = root/task['id']; taskdir.mkdir()
            worktree = taskdir/'worktree'
            branch = 'codex/queue-' + hashlib.sha256(str(root).encode()).hexdigest()[:8] + '-' + task['id']
            state.update(status='running',task=task['id'],phase='worktree',pid=os.getpid())
            save(statefile,state)
            try:
                git(repo,'worktree','add','-b',branch,str(worktree),state['base'])
                save(taskdir/'schema.json',SCHEMA)
                prompt = ('Complete ONLY this approved local task. Read AGENTS.md. Do not commit, push, merge, deploy, '
                    'access external services, read credentials, install dependencies, or edit other worktrees. '
                    'Do not weaken tests. Report blocked if requirements cannot be met. '
                    'Do not spawn additional agents. Allowed changed paths: '+json.dumps(task['allowed_paths'])+'\n'+task['prompt'])
                state['phase']='agent'; save(statefile,state)
                execute(codex_args(executable,worktree,taskdir,queue['model']),worktree,
                    taskdir/'agent.jsonl',min(queue['timeout_seconds'],max(0,session_deadline-time.monotonic())),stop,prompt)
                answer=json.loads((taskdir/'answer.json').read_text(encoding='utf-8'))
                if answer.get('status') != 'done' or not isinstance(answer.get('summary'),str):
                    raise RuntimeError('Agent did not report structured completion')
                if git(worktree,'rev-parse','HEAD') != state['base']:
                    raise RuntimeError('Agent changed HEAD; preserve and inspect')
                changed = set(git(worktree,'diff','--name-only','HEAD').splitlines())
                changed.update(git(worktree,'ls-files','--others','--exclude-standard').splitlines())
                if any(not allowed(path,task['allowed_paths']) for path in changed):
                    raise RuntimeError('Changes outside approved paths; preserve and inspect')
                state['phase']='verify'; save(statefile,state)
                for i,command in enumerate(task['verify']):
                    execute(command,worktree,taskdir/f'verify-{i}.log',min(queue['timeout_seconds'],max(0,session_deadline-time.monotonic())),stop)
                if git(worktree,'rev-parse','HEAD') != state['base']:
                    raise RuntimeError('Verification changed HEAD; preserve and inspect')
                git(worktree,'diff','--check')
                # Recheck after verification; tests themselves can write files.
                changed = set(git(worktree,'diff','--name-only','HEAD').splitlines())
                changed.update(git(worktree,'ls-files','--others','--exclude-standard').splitlines())
                if any(not allowed(path,task['allowed_paths']) for path in changed):
                    raise RuntimeError('Verification wrote outside approved paths')
                if changed:
                    git(worktree,'add','--',*sorted(changed))
                    git(worktree,'diff','--cached','--check')
                    git(worktree,'commit','-m','Local queue: '+task['id'])
                if git(worktree,'status','--porcelain'):
                    raise RuntimeError('Worktree not clean after verification/commit')
                state['base']=git(worktree,'rev-parse','HEAD')
                state['completed'].append({'id':task['id'],'commit':state['base'],'worktree':str(worktree),'summary':answer['summary']})
                state.update(status='ready',phase='checkpoint'); save(statefile,state)
            except BaseException as error:
                state.update(status='blocked',error=str(error)); save(statefile,state)
                raise
        state.update(status='complete',phase='finished'); save(statefile,state)
        return state


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue',type=Path,required=True)
    parser.add_argument('--repo',type=Path,required=True)
    parser.add_argument('--run-dir',type=Path,required=True)
    parser.add_argument('--codex',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(run(args.queue,args.repo,args.run_dir,args.codex),indent=2))
