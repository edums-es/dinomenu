import unittest

from receipt import build_receipt, columns, money, wrap


class ReceiptTests(unittest.TestCase):
    def test_money_uses_brazilian_format(self):
        self.assertEqual(money(1234.5), "R$ 1.234,50")

    def test_wrap_never_exceeds_paper_width(self):
        lines = wrap("Produto com um nome bastante longo para bobina termica", 20)
        self.assertTrue(lines)
        self.assertTrue(all(len(line) <= 20 for line in lines))

    def test_columns_keep_price_visible(self):
        lines = columns("Hamburguer especial com adicionais", "R$ 42,90", 32)
        self.assertTrue(all(len(line) <= 32 for line in lines))
        self.assertTrue(lines[-1].endswith("R$ 42,90"))

    def test_receipt_contains_order_and_escpos_cut(self):
        payload = {
            "restaurant": {"name": "EG Delivery"},
            "order": {
                "order_number": 321,
                "type": "delivery",
                "customer": {"name": "Cliente", "phone": "27999999999"},
                "address": {"street": "Rua Bahia", "number": "7"},
                "items": [{
                    "quantity": 2,
                    "product_name": "Lanche",
                    "unit_price": 10,
                    "total_price": 20,
                    "options": [],
                }],
                "subtotal": 20,
                "delivery_fee": 5,
                "discount": 0,
                "total": 25,
                "payment_method": "Pix",
            },
        }
        receipt = build_receipt(payload, 48, True)
        self.assertTrue(receipt.startswith(b"\x1b\x40"))
        self.assertIn(b"PEDIDO #321", receipt)
        self.assertTrue(receipt.endswith(b"\x1d\x56\x42\x03"))


if __name__ == "__main__":
    unittest.main()
