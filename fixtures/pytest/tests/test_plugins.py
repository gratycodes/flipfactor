from app import plugins


def test_alpha_loads():
    assert "alpha" in plugins.available()


def test_register_plugin():
    plugins.register("beta")
    assert "beta" in plugins.available()


def test_lookup_missing():
    assert "gamma" not in plugins.available()


def test_default_plugins():
    assert plugins.available() == {"alpha"}
