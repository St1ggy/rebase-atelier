"""Exercise the real editor entrypoint from a foreign cwd and verify terminal cleanup."""

import errno
import fcntl
import os
import pathlib
import pty
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
EXECUTABLE = [str(pathlib.Path(os.environ['ATELIER_BINARY']).resolve())] if os.environ.get('ATELIER_BINARY') else [shutil.which('bun'), str(ROOT / 'src/main.ts')]
EXECUTABLE += ['--view', os.environ.get('ATELIER_VIEW_TEST', 'full')]


def drive(arguments, cwd, stages):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 120, 0, 0))
    before = termios.tcgetattr(slave)
    process = subprocess.Popen(arguments, cwd=cwd, stdin=slave, stdout=slave, stderr=slave,
                               env={**os.environ, 'TERM': 'xterm-256color', 'XDG_CONFIG_HOME': str(pathlib.Path(cwd) / 'config'),
                                    'GIT_COMMITTER_NAME': 'Atelier Test', 'GIT_COMMITTER_EMAIL': 'test@example.invalid',
                                    'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': 'commit.gpgsign', 'GIT_CONFIG_VALUE_0': 'false'})
    output = b''
    stage = 0
    deadline = time.monotonic() + 25
    try:
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                output += chunk
                if stage < len(stages) and stages[stage][0] in output:
                    os.write(master, stages[stage][1])
                    output = b''
                    stage += 1
            if process.poll() is not None:
                break
        if process.poll() is None:
            raise AssertionError(f'Editor did not exit; stage={stage}, tail={output[-800:]!r}')
        if process.returncode != 0:
            raise AssertionError(f'Editor exited {process.returncode}: {output[-2000:]!r}')
        after = termios.tcgetattr(slave)
        assert before[3] & (termios.ICANON | termios.ECHO) == after[3] & (termios.ICANON | termios.ECHO)
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
        os.close(master)
        os.close(slave)


with tempfile.TemporaryDirectory(prefix='atelier-pty-') as cwd:
    plan = pathlib.Path(cwd) / 'plan with spaces'
    plan.write_text('pick aaaa First\npick bbbb Second\n', encoding='utf-8')
    drive([*EXECUTABLE, '--vcs', 'git', '--sequence-editor', str(plan)],
          cwd, [(b'ATELIER', b'\x1b[Bf\x13'), (b'SUMMARY', b'\r')])
    assert plan.read_text() == 'pick aaaa First\nfixup bbbb Second\n'

    message = pathlib.Path(cwd) / 'message'
    message.write_text('A real multiline message\n\nBody.\n', encoding='utf-8')
    drive([*EXECUTABLE, '--message-editor', str(message)],
          cwd, [(b'MESSAGE', b'\x13')])
    assert 'Body.' in message.read_text()

    base = pathlib.Path(cwd) / 'base'
    left = pathlib.Path(cwd) / 'left'
    right = pathlib.Path(cwd) / 'right'
    output = pathlib.Path(cwd) / 'output'
    base.write_text('base\n')
    left.write_text('left\n')
    right.write_text('right\n')
    output.write_text('preserved working copy\n')
    drive([*EXECUTABLE, '--merge', '--base', str(base), '--left', str(left), '--right', str(right), '--output', str(output)],
          cwd, [(b'RESOLVE', b'g2\x13')])
    assert output.read_text() == 'right\n'

    left.write_bytes(b'\0\xffleft')
    right.write_bytes(b'\0\xferight')
    output.write_bytes(b'\0original')
    drive([*EXECUTABLE, '--merge', '--base', str(base), '--left', str(left), '--right', str(right), '--output', str(output)],
          cwd, [(b'WHOLE-FILE', b'2')])
    assert output.read_bytes() == b'\0\xferight'

with tempfile.TemporaryDirectory(prefix='atelier-workflow-') as cwd:
    def git(*arguments):
        return subprocess.check_output(['git', '-c', 'user.name=Atelier Test', '-c', 'user.email=test@example.invalid',
                                        '-c', 'commit.gpgsign=false', *arguments], cwd=cwd, stderr=subprocess.PIPE).decode()

    git('init', '-q')
    for name in ['base', 'first', 'second']:
        (pathlib.Path(cwd) / name).write_text(name)
        git('add', name)
        git('commit', '-qm', name)
    drive(EXECUTABLE, cwd, [(b'HISTORY', b'\x13'), (b'START', b'\x13'),
                           (b'EDITOR', b'\x1b[Bf\x13'), (b'SUMMARY', b'\r'),
                           (b'REWRITE RESULT', b'\r'), (b'HISTORY', b'\x03')])
    assert git('log', '--format=%s').splitlines() == ['first', 'base']
    assert (pathlib.Path(cwd) / 'second').read_text() == 'second'

print('PTY smoke passed: foreign cwd, native plan/message/merge, full Git workflow and terminal restoration.')
