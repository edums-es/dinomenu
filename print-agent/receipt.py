from datetime import datetime


def money(value):
    try:
        return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "R$ 0,00"


def clean(value):
    return " ".join(str(value or "").replace("\r", " ").replace("\n", " ").split())


def wrap(text, width):
    words = clean(text).split()
    if not words:
        return [""]
    lines = []
    current = ""
    for word in words:
        if len(word) > width:
            if current:
                lines.append(current)
                current = ""
            while len(word) > width:
                lines.append(word[:width])
                word = word[width:]
        candidate = f"{current} {word}".strip()
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def columns(left, right, width):
    left = clean(left)
    right = clean(right)
    available = max(width - len(right) - 1, 1)
    if len(left) <= available:
        return [left + (" " * (width - len(left) - len(right))) + right]
    lines = wrap(left, width)
    if len(lines[-1]) + len(right) + 1 <= width:
        lines[-1] = lines[-1] + (" " * (width - len(lines[-1]) - len(right))) + right
    else:
        lines.append(right.rjust(width))
    return lines


def _date(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.astimezone().strftime("%d/%m/%Y %H:%M")
    except Exception:
        return clean(value)


def build_receipt(payload, width=48, cut_paper=True):
    restaurant = payload.get("restaurant") or {}
    order = payload.get("order") or {}
    customer = order.get("customer") or {}
    address = order.get("address") or {}
    lines = []

    def add(text="", align="left"):
        for part in wrap(text, width):
            if align == "center":
                lines.append(part.center(width))
            elif align == "right":
                lines.append(part.rjust(width))
            else:
                lines.append(part)

    divider = "-" * width
    add(restaurant.get("name") or "EG DELIVERY", "center")
    add(f"PEDIDO #{order.get('order_number', '-')}", "center")
    add(_date(order.get("created_at")), "center")
    lines.append(divider)

    order_type = {
        "delivery": "ENTREGA",
        "pickup": "RETIRADA",
        "dine_in": "MESA",
    }.get(order.get("type"), clean(order.get("type")).upper())
    add(order_type, "center")
    if order.get("table_name") or order.get("table_number"):
        add(order.get("table_name") or f"Mesa {order.get('table_number')}", "center")
    lines.append(divider)

    add(f"Cliente: {customer.get('name', '')}")
    if customer.get("phone"):
        add(f"Telefone: {customer.get('phone')}")
    if order.get("type") == "delivery":
        street = clean(address.get("street"))
        number = clean(address.get("number"))
        add(f"Endereco: {street}, {number}".rstrip(", "))
        if address.get("neighborhood"):
            add(f"Bairro: {address.get('neighborhood')}")
        if address.get("complement"):
            add(f"Complemento: {address.get('complement')}")
        if address.get("reference"):
            add(f"Referencia: {address.get('reference')}")
    lines.append(divider)

    for item in order.get("items") or []:
        quantity = int(item.get("quantity") or 1)
        item_total = item.get("total_price")
        if item_total is None:
            item_total = float(item.get("unit_price") or 0) * quantity
        lines.extend(columns(f"{quantity}x {item.get('product_name', 'Item')}", money(item_total), width))
        for option in item.get("options") or []:
            suffix = f" (+{money(option.get('price'))})" if float(option.get("price") or 0) else ""
            add(f"  + {option.get('name', '')}{suffix}")
        if item.get("notes"):
            add(f"  Obs: {item.get('notes')}")
    lines.append(divider)

    lines.extend(columns("Subtotal", money(order.get("subtotal")), width))
    if float(order.get("delivery_fee") or 0):
        lines.extend(columns("Entrega", money(order.get("delivery_fee")), width))
    if float(order.get("discount") or 0):
        lines.extend(columns("Desconto", f"-{money(order.get('discount'))}", width))
    lines.extend(columns("TOTAL", money(order.get("total")), width))
    lines.append(divider)
    add(f"Pagamento: {order.get('payment_method', '')}")
    if order.get("change_for"):
        lines.extend(columns("Troco para", money(order.get("change_for")), width))
    if order.get("customer_notes"):
        lines.append(divider)
        add(f"OBSERVACAO: {order.get('customer_notes')}")
    lines.append(divider)
    add("Impresso automaticamente pelo EG Delivery", "center")

    text = "\n".join(lines) + "\n\n\n"
    commands = bytearray(b"\x1b\x40")
    commands.extend(b"\x1b\x74\x02")
    commands.extend(text.encode("cp850", errors="replace"))
    if cut_paper:
        commands.extend(b"\x1d\x56\x42\x03")
    return bytes(commands)

