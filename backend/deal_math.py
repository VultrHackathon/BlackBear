def delivered_total_ore(item_price_ore: int, shipping_ore: int | None) -> int | None:
    """Return the delivered price for one item, or None if shipping is unknown."""
    if type(item_price_ore) is not int or item_price_ore < 0:
        raise ValueError("Item price must be a non-negative integer in öre.")

    if shipping_ore is None:
        return None
    if type(shipping_ore) is not int or shipping_ore < 0:
        raise ValueError("Shipping must be a non-negative integer in öre.")

    return item_price_ore + shipping_ore
