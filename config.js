/* HOOD 405 · Catálogo — ajustes. Edita solo este archivo. */
window.HOOD_CATALOGO = {
  // Dirección /exec de tu Apps Script (la misma que usa el punto de venta). Es pública: solo entrega prendas con foto, sin costos.
  api: 'https://script.google.com/macros/s/AKfycby3fVfTtqSbHB5rt2lXthaOldpd1-5zhIWdo7g8ZVozbA8nzspKt7fL_Unaro0c9K2bUw/exec',
  // WhatsApp de la tienda, con lada de país y sin signos ni espacios. Ejemplo para México: '522241234567'. Vacío = el cliente elige el chat al enviar.
  whatsapp: '',
  tienda: 'HOOD 405',
  ciudad: 'Tlapacoyan, Veracruz',
  // Pestañas del catálogo, en este orden: [texto, empieza con…]. Una prenda cuya categoría empieza así cae en esa pestaña.
  categorias: [['Playeras', 'playera'], ['Mochilas', 'mochila'], ['Cinturones', 'cintur']],
  // CÓDIGOS POSTALES CON ENTREGA A DOMICILIO. Cambia 00000 por los tuyos, separados por coma. Ejemplo: ['93650', '93651']. También sirve el inicio, como '936' para toda esa zona. Si lo dejas vacío [] no se valida y la entrega se confirma por WhatsApp.
  cpCubiertos: ['93650'],
  // Aviso sobre la entrega (aparece arriba y en el carrito)
  avisoEntrega: 'Recoge en tienda o consulta si hay entrega a domicilio en tu zona.'
};
