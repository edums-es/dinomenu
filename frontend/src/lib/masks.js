/** Formata número de telefone brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX */
export function maskPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

/** Formata WhatsApp com DDI: +XX (XX) XXXXX-XXXX */
export function maskWhatsApp(value) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 2) return digits.length ? `+${digits}` : "";
  if (digits.length <= 4) return `+${digits.slice(0, 2)} (${digits.slice(2)}`;
  if (digits.length <= 9)
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4)}`;
  if (digits.length <= 13)
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  return value;
}

/** Formata CNPJ: XX.XXX.XXX/XXXX-XX */
export function maskCNPJ(value) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Retorna apenas dígitos (para envio ao backend) */
export function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

/** Valida CNPJ (dígitos verificadores) */
export function isValidCNPJ(value) {
  const c = digitsOnly(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (s, n) => {
    let sum = 0, pos = n - 7;
    for (let i = n; i >= 1; i--) {
      sum += parseInt(s.charAt(n - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return r === parseInt(s.charAt(n));
  };
  return calc(c, 12) && calc(c, 13);
}

/** Valida telefone brasileiro (10 ou 11 dígitos) */
export function isValidPhone(value) {
  const d = digitsOnly(value);
  return d.length === 10 || d.length === 11;
}
