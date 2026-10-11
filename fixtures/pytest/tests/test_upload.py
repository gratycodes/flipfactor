import time

from app.shared_file import roundtrip


def test_upload_roundtrip():
    time.sleep(0.2)  # starts a little later than test_export, then clobbers its file
    assert roundtrip("upload") == "upload"
