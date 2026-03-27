const PIX_API_URL    = process.env.PIX_API_URL;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// Tabela de preços oficial — fonte da verdade no servidor
// Formato: { [productId]: priceEmCentavos }
const PRODUCT_PRICES = process.env.PRODUCT_PRICES
  ? JSON.parse(process.env.PRODUCT_PRICES)
  : null; // se não configurado, aceita o preço do cliente (menos seguro)

// Rate limiting simples em memória (reset a cada deploy)
const rateLimit = new Map();
const RATE_WINDOW_MS  = 60_000; // 1 minuto
const RATE_MAX_REQS   = 5;      // máx 5 PIX por IP por minuto

function checkRateLimit(ip) {
  const now  = Date.now();
  const data = rateLimit.get(ip) || { count: 0, start: now };
  if (now - data.start > RATE_WINDOW_MS) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  if (data.count >= RATE_MAX_REQS) return false;
  data.count++;
  rateLimit.set(ip, data);
  return true;
}

export default async function handler(req, res) {
  // CORS — bloqueia origens desconhecidas (browsers)
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.some(o => origin.includes(o))) {
    return res.status(403).json({ error: 'Origem não permitida' });
  }

  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Rate limiting por IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  }

  const { customer, items, item, amount, paymentMethod } = req.body || {};

  // Valida dados do cliente
  if (!customer?.name || !customer?.document || !customer?.email || !customer?.phone) {
    return res.status(400).json({ error: 'Dados do cliente incompletos' });
  }

  // CPF básico — só números, 11 dígitos
  const cpf = customer.document.replace(/\D/g, '');
  if (cpf.length !== 11) {
    return res.status(400).json({ error: 'CPF inválido' });
  }

  // Valida e calcula o valor real pelo servidor
  let realAmount = 0;

  if (PRODUCT_PRICES && items?.length > 0) {
    // Modo seguro: recalcula o total com os preços do servidor
    for (const i of items) {
      const serverPrice = PRODUCT_PRICES[String(i.productId)];
      if (!serverPrice) return res.status(400).json({ error: `Produto ${i.productId} não encontrado` });
      realAmount += serverPrice * (i.quantity || 1);
    }
  } else {
    // Modo básico: confia no valor do cliente, mas valida limites
    realAmount = Math.round(amount || 0);
    if (realAmount < 100) return res.status(400).json({ error: 'Valor mínimo: R$ 1,00' }); // mín R$1
    if (realAmount > 9999900) return res.status(400).json({ error: 'Valor máximo excedido' }); // máx R$99.999
  }

  const itemData = item || {
    title:    items?.length === 1 ? (items[0].title || 'Produto') : `${items?.length || 1} produtos`,
    quantity: items?.reduce((s, i) => s + (i.quantity || 1), 0) || 1,
    price:    realAmount,
  };

  if (!PIX_API_URL) {
    return res.status(500).json({ error: 'Gateway não configurado' });
  }

  try {
    const apiRes = await fetch(PIX_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: 'PIX',
        amount:        realAmount,
        customer: {
          name:     customer.name,
          document: cpf,
          email:    customer.email,
          phone:    customer.phone.replace(/\D/g, ''),
        },
        item: itemData,
      }),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Erro no gateway');
      return res.status(apiRes.status).json({ error: msg });
    }

    return res.status(200).json({
      pixCode:       data.pixCode,
      transactionId: data.transactionId,
      orderId:       data.transactionId,
      gateway:       'pix',
    });

  } catch (err) {
    return res.status(500).json({ error: 'Falha ao conectar com o gateway' });
  }
}
