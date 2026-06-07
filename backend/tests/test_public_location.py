from routes_public import _region_from_address


def test_region_from_address_formats_neighborhood_city_and_state():
    location = _region_from_address({
        "suburb": "Praia do Canto",
        "city": "Vitoria",
        "ISO3166-2-lvl4": "BR-ES",
    })

    assert location == {
        "neighborhood": "Praia do Canto",
        "city": "Vitoria",
        "state": "ES",
        "region": "Praia do Canto, Vitoria/ES",
    }
