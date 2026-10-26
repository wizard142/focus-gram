import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

spec=importlib.util.spec_from_file_location('story_worker', Path(__file__).resolve().parents[1]/'electron'/'story_worker.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class WorkerTests(unittest.TestCase):
    def test_stable_identity_and_no_retries(self):
        a=worker.session_settings({'sessionid':'secret','ds_user_id':'123'})
        b=worker.session_settings({'sessionid':'different-secret','ds_user_id':'123'})
        self.assertEqual(a['uuids'],b['uuids'])
        self.assertEqual(a['session_retry_total'],0)
        self.assertEqual(a['authorization_data']['ds_user_id'],'123')

    def test_photo_upload_uses_existing_session_and_requires_publication_id(self):
        calls=[]
        class FakeClient:
            def set_settings(self,settings): calls.append(settings)
            def photo_upload_to_story(self,path,**options):
                calls.append((path,options));return SimpleNamespace(pk='456')
        with tempfile.NamedTemporaryFile(suffix='.jpg') as media:
            result=worker.publish({'file':media.name,'kind':'image','cookies':{'sessionid':'secret','ds_user_id':'123'}},FakeClient)
        self.assertEqual(result,{'published':True,'id':'456'})
        self.assertEqual(calls[1][1]['resize_mode'],'fit')

    def test_verification_errors_are_safe_and_not_retried(self):
        class ChallengeRequired(Exception): pass
        class FakeClient:
            calls=0
            def set_settings(self,settings): pass
            def photo_upload_to_story(self,*args,**kwargs):
                self.calls+=1;raise ChallengeRequired('private token: SECRET')
        client=FakeClient()
        with tempfile.NamedTemporaryFile(suffix='.jpg') as media:
            with self.assertRaises(ChallengeRequired) as failure:
                worker.publish({'file':media.name,'kind':'image','cookies':{'sessionid':'secret','ds_user_id':'123'}},lambda:client)
        self.assertEqual(client.calls,1)
        self.assertNotIn('SECRET',worker.safe_error(failure.exception))
        self.assertIn('verification',worker.safe_error(failure.exception))

    def test_missing_publication_is_not_success(self):
        class FakeClient:
            def set_settings(self,s): pass
            def photo_upload_to_story(self,*args,**kwargs): return SimpleNamespace(pk=None)
        with tempfile.NamedTemporaryFile(suffix='.jpg') as media:
            with self.assertRaises(RuntimeError):worker.publish({'file':media.name,'kind':'image','cookies':{'sessionid':'secret','ds_user_id':'123'}},FakeClient)

if __name__=='__main__': unittest.main()
