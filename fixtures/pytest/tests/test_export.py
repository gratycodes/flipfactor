from app.shared_file import roundtrip


def test_export_roundtrip():
    assert roundtrip("export") == "export"
