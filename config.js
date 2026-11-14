/* HOOD 405 · Catálogo — ajustes. Edita solo este archivo. */
window.HOOD_CATALOGO = {
  // Dirección /exec de tu Apps Script (la misma que usa el punto de venta). Es pública: solo entrega prendas con foto, sin costos.
  api: '',
  // WhatsApp de la tienda, con lada de país y sin signos ni espacios. Ejemplo para México: '522241234567'. Vacío = el cliente elige el chat al enviar.
  whatsapp: '',
  tienda: 'HOOD 405',
  ciudad: 'Tlapacoyan, Veracruz',
  // Pestañas del catálogo, en este orden: [texto, empieza con…]. Una prenda cuya categoría empieza así cae en esa pestaña.
  categorias: [['Playeras', 'playera'], ['Mochilas', 'mochila'], ['Cinturones', 'cintur']],
  // Aviso sobre la entrega (aparece arriba y en el carrito)
  avisoEntrega: 'Recoge en tienda o consulta si hay entrega a domicilio en tu zona.'
};
