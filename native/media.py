"""Send only the selected desktop file to Instagram's native review screen."""
import mimetypes
from pathlib import Path
import re
import subprocess
import time
import urllib.parse
import uuid

HANDLERS = {'story': 'StoryShareHandlerActivity', 'post': 'ShareHandlerActivity',
            'reel': 'ReelShareHandlerActivity'}

def share(path, destination):
    from runtime import adb, shell
    if destination not in HANDLERS:
        raise ValueError('Choose Story, Post or Reel.')
    path = Path(path).expanduser().resolve(strict=True)
    if not path.is_file():
        raise RuntimeError('Choose a photo or video file.')
    mime = subprocess.check_output(['file', '--brief', '--mime-type', '--', str(path)], text=True).strip()
    if not mime.startswith(('image/', 'video/')):
        raise RuntimeError('Choose a photo or video file.')
    if destination == 'reel' and not mime.startswith('video/'):
        raise RuntimeError('Choose a video for a Reel.')
    suffix = mimetypes.guess_extension(mime) or path.suffix
    remote = '/sdcard/Pictures/Instagram Selected/' + uuid.uuid4().hex + suffix
    shell('mkdir', '-p', '/sdcard/Pictures/Instagram Selected')
    adb('push', str(path), remote, timeout=300)
    shell('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
          '-d', 'file://' + urllib.parse.quote(remote, safe='/'))
    canonical = remote.replace('/sdcard/', '/storage/emulated/0/', 1)
    where = "_data='" + canonical.replace("'", "''") + "'"
    for _ in range(50):
        result = shell('content', 'query', '--uri', 'content://media/external/file',
                       '--projection', '_id', '--where', where)
        match = re.search(r'_id=(\d+)', result)
        if match:
            media_id = match.group(1)
            break
        time.sleep(0.2)
    else:
        raise RuntimeError('Android could not prepare this file. Try another photo or video.')
    kind = 'images' if mime.startswith('image/') else 'video'
    uri = 'content://media/external/' + kind + '/media/' + media_id
    component = 'com.instagram.android/com.instagram.share.handleractivity.' + HANDLERS[destination]
    result = shell('am', 'start', '-W', '-a', 'android.intent.action.SEND', '-d', uri, '-t', mime,
                   '--eu', 'android.intent.extra.STREAM', uri, '--grant-read-uri-permission', '-n', component)
    if 'Error:' in result or 'Exception' in result:
        raise RuntimeError('Instagram could not open this file. Try another photo or video.')
    return remote
