import { createContext, useContext, useState, useMemo, useCallback } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]); // {lineId, product, quantity, selectedOptions:[{group,name,price}], notes, unitPrice}

  const addItem = useCallback((item) => {
    setItems((prev) => [...prev, { ...item, lineId: Date.now() + Math.random() }]);
  }, []);

  const updateQuantity = useCallback((lineId, delta) => {
    setItems((prev) =>
      prev
        .map((i) => (i.lineId === lineId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((lineId) => {
    setItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const { count, subtotal } = useMemo(() => {
    let c = 0;
    let s = 0;
    items.forEach((i) => {
      c += i.quantity;
      s += i.unitPrice * i.quantity;
    });
    return { count: c, subtotal: s };
  }, [items]);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQuantity, removeItem, clearCart, count, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
