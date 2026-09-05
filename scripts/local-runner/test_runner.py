import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import runner


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.repo=self.root/'repo'; self.repo.mkdir()
        runner.git(self.repo,'init')
        runner.git(self.repo,'config','user.name','Runner Test')
        runner.git(self.repo,'config','user.email','runner@example.invalid')
        (self.repo/'seed.txt').write_text('seed')
        runner.git(self.repo,'add','seed.txt'); runner.git(self.repo,'commit','-m','seed')
        self.exe=self.root/'fake-codex.exe'; self.exe.touch()
        self.queue=self.root/'queue.json'
        self.data={'version':1,'model':'test','timeout_seconds':30,'tasks':[
            {'id':name,'prompt':'Write a note','allowed_paths':['docs/'],'verify':[['python','--version']]}
            for name in ['one','two']]}
        runner.save(self.queue,self.data)
        self.auth=patch.object(runner,'logged_in',return_value=True)
        self.auth.start(); self.addCleanup(self.auth.stop)

    def fake(self,args,cwd,log,timeout,stop,stdin=None):
        if stdin:
            (cwd/'docs').mkdir(exist_ok=True)
            (cwd/'docs'/f'{cwd.parent.name}.txt').write_text('verified note')
            runner.save(cwd.parent/'answer.json',{'status':'done','summary':'note written'})
        log.write_text('passed')

    def go(self):
        return runner.run(self.queue,self.repo,self.root/'run',self.exe)

    def test_two_tasks_commit_and_advance_without_another_prompt(self):
        with patch.object(runner,'execute',side_effect=self.fake):
            state=self.go()
            self.assertEqual(state['status'],'complete')
            self.assertEqual(len(state['completed']),2)
            second=Path(state['completed'][1]['worktree'])
            self.assertTrue((second/'docs/one.txt').exists())
            self.assertEqual(runner.git(second,'status','--porcelain'),'')
            self.assertEqual(self.go(),state)

    def test_verification_failure_blocks_next_task(self):
        def fail_verify(args,cwd,log,timeout,stop,stdin=None):
            if stdin is None:
                raise RuntimeError('verification failed')
            self.fake(args,cwd,log,timeout,stop,stdin)
        with patch.object(runner,'execute',side_effect=fail_verify):
            with self.assertRaisesRegex(RuntimeError,'verification failed'): self.go()
            self.assertFalse((self.root/'run/two').exists())
            with self.assertRaisesRegex(RuntimeError,'requires review'): self.go()

    def test_out_of_scope_change_blocks(self):
        def outside(*args):
            self.fake(*args)
            (args[1]/'oops.txt').write_text('not allowed')
        with patch.object(runner,'execute',side_effect=outside):
            with self.assertRaisesRegex(RuntimeError,'outside approved'): self.go()

    def test_stop_prevents_first_task(self):
        (self.root/'run').mkdir(); (self.root/'run/STOP').touch()
        with self.assertRaisesRegex(RuntimeError,'STOP'): self.go()
        self.assertFalse((self.root/'run/one').exists())

    def test_changed_queue_cannot_resume(self):
        with patch.object(runner,'execute',side_effect=self.fake): self.go()
        self.data['model']='different'; runner.save(self.queue,self.data)
        with self.assertRaisesRegex(RuntimeError,'changed'): self.go()

    def test_exclusive_lock(self):
        with runner.lock(self.root/'lock'):
            with self.assertRaises(OSError):
                with runner.lock(self.root/'lock'): pass

    def test_real_process_timeout(self):
        with self.assertRaisesRegex(RuntimeError,'timeout'):
            runner.execute([sys.executable,'-c','import time; time.sleep(20)'],self.repo,
                self.root/'timeout.log',.3,self.root/'STOP')

    def test_nonzero_and_stop_are_not_completion(self):
        with self.assertRaisesRegex(RuntimeError,'exited 3'):
            runner.execute([sys.executable,'-c','raise SystemExit(3)'],self.repo,
                self.root/'failure.log',10,self.root/'STOP')
        (self.root/'STOP').touch()
        with self.assertRaisesRegex(RuntimeError,'Stop'):
            runner.execute([sys.executable,'--version'],self.repo,self.root/'stop.log',10,self.root/'STOP')

    def test_validation_and_safe_flags(self):
        self.data['tasks'][0]['allowed_paths']=['../unsafe']
        with self.assertRaises(ValueError): runner.validate(self.data)
        args=runner.codex_args(self.exe,self.repo,self.root,'test')
        self.assertIn('workspace-write',args)
        self.assertIn('approval_policy="never"',args)
        self.assertNotIn('--dangerously-bypass-approvals-and-sandbox',args)


if __name__=='__main__': unittest.main()
