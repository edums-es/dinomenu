from server import get_cors_origins


def test_cors_accepts_apex_and_www_frontend_origins(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://dinomenu.online")

    assert get_cors_origins() == [
        "https://dinomenu.online",
        "https://www.dinomenu.online",
    ]
