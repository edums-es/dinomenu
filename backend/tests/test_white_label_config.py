from routes_public import public_white_label_config


def test_public_white_label_config_uses_defaults_and_allowed_fields():
    brand = public_white_label_config({
        "platform_name": "Minha Marca",
        "platform_short_name": "Marca",
        "platform_primary_color": "#123456",
        "onesignal_api_key": "secret",
        "platform_powered_by_enabled": "false",
    })

    assert brand["name"] == "Minha Marca"
    assert brand["short_name"] == "Marca"
    assert brand["primary_color"] == "#123456"
    assert brand["tagline"] == "Cardapio digital"
    assert brand["powered_by_enabled"] is False
    assert "onesignal_api_key" not in brand
