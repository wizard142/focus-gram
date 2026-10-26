"""Opt-in Story publisher. Secrets arrive on stdin; only safe results leave stdout."""
import contextlib
import hashlib
import io
import json
import logging
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse


def emit(event, **values):
    print(json.dumps({"event": event, **values}), flush=True)


def session_settings(cookies):
    user_id = str(cookies.get("ds_user_id", ""))
    session_id = cookies.get("sessionid", "")
    if not user_id.isdigit() or not session_id:
        raise ValueError("Sign in to Instagram first.")
    # Stable device identity without storing another copy of the login session.
    stable = lambda field: str(uuid.uuid5(uuid.NAMESPACE_URL, f"focus-gram:{user_id}:{field}"))
    uuids = {key: stable(key) for key in ["uuid", "phone_id", "advertising_id"]}
    uuids["android_device_id"] = "android-" + hashlib.sha256(stable("device").encode()).hexdigest()[:16]
    return {
        "cookies": cookies,
        "authorization_data": {"ds_user_id": user_id, "sessionid": session_id, "should_use_header_over_cookies": True},
        "uuids": uuids,
        "public_request_retries_count": 0,
        "session_retry_total": 0,
        "request_timeout": 35,
        "private_transport": "requests",
        "public_transport": "requests",
    }


def safe_error(error):
    name = type(error).__name__
    if any(word in name for word in ("Challenge", "Login", "TwoFactor", "Consent", "Checkpoint")):
        return "Instagram requires login or account verification. Open Instagram and complete it before trying again."
    if any(word in name for word in ("PleaseWait", "Feedback", "RateLimit", "Sentry", "Forbidden")):
        return "Instagram has restricted this request. Stop and check your account; Focus Gram will not retry automatically."
    if isinstance(error, ValueError):
        return "The file or Instagram session is not valid. Choose a supported file and check your login."
    return "Instagram did not confirm the Story upload. Check your Story before retrying; it may already have been published."


def publish(payload, client_factory, on_progress=lambda message: None):
    media = Path(payload["file"])
    if not media.is_file():
        raise ValueError("Missing file")
    settings = session_settings(payload["cookies"])
    client = client_factory()
    client.set_settings(settings)
    # No password login, public profile lookup, account lookup, or token service.
    on_progress("Uploading Story…")
    if payload["kind"] == "video":
        story = client.video_upload_to_story(media, thumbnail=Path(payload["thumbnail"]), resize_mode="fill")
    else:
        story = client.photo_upload_to_story(media, resize_mode="fit")
    story_id = str(getattr(story, "pk", "") or "")
    if not story_id:
        raise RuntimeError("Publication unconfirmed")
    return {"published": True, "id": story_id}


def main():
    logging.disable(logging.CRITICAL)
    if "--check" in sys.argv:
        from importlib.metadata import version
        import instagrapi
        from PIL import Image
        emit("result", ok=True, version=version("instagrapi"))
        return
    try:
        payload = json.load(sys.stdin)
        import requests
        from instagrapi import Client
        original_send = requests.sessions.Session.send

        def instagram_only(self, request, **kwargs):
            host = urlparse(request.url).hostname or ""
            if urlparse(request.url).scheme != "https" or not any(host == suffix or host.endswith("." + suffix) for suffix in ("instagram.com", "cdninstagram.com", "fbcdn.net")):
                raise RuntimeError("External host denied")
            return original_send(self, request, **kwargs)

        requests.sessions.Session.send = instagram_only
        # Do not leak library diagnostics, private responses, cookies or paths.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            class StoryClient(Client):
                def _current_story_ids(self, amount=20):
                    return None

                def _new_story_after_upload(self, *args, **kwargs):
                    return None

            result = publish(payload, StoryClient)
        emit("result", ok=True, **result)
    except Exception as error:
        emit("result", ok=False, message=safe_error(error))
        sys.exit(1)


if __name__ == "__main__":
    main()
