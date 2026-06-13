from routes_public import _inject_preview_metadata, _public_menu_url


def test_inject_preview_metadata_removes_generic_spa_tags():
    shell = """<!doctype html>
    <html><head>
      <title>Dino Menu</title>
      <meta name="description" content="generic">
      <meta property="og:title" content="Dino Menu">
      <meta property="og:image" content="generic.svg">
      <meta name="twitter:title" content="Dino Menu">
      <link rel="canonical" href="https://example.com">
    </head><body></body></html>"""
    restaurant_meta = '<title>Open Foods</title><meta property="og:title" content="Open Foods">'

    result = _inject_preview_metadata(shell, restaurant_meta)

    assert result.count("<title>") == 1
    assert result.count('property="og:title"') == 1
    assert "Open Foods" in result
    assert "Dino Menu" not in result
    assert "generic.svg" not in result
    assert 'rel="canonical"' not in result


class RequestWithQuery:
    def __init__(self, query):
        self.query_params = query


def test_public_menu_url_keeps_preview_version_and_table():
    request = RequestWithQuery({"mesa": "12", "v": "123", "ignored": "value"})

    assert _public_menu_url("https://app.example.com", "openfoods", request) == (
        "https://app.example.com/cardapio/openfoods?mesa=12&v=123"
    )
