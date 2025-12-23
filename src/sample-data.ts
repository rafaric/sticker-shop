import { db } from './database-kv';

// Productos simplificados según los nuevos requerimientos
const sampleProducts = [
  // Remeras por talle
  { name: 'Remera XS', category: 'remeras' as const, price: 3500, stock: 0, cost: 1500, size: 'xs' },
  { name: 'Remera S', category: 'remeras' as const, price: 3500, stock: 0, cost: 1500, size: 's' },
  { name: 'Remera M', category: 'remeras' as const, price: 3500, stock: 0, cost: 1500, size: 'm' },
  { name: 'Remera L', category: 'remeras' as const, price: 3500, stock: 0, cost: 1500, size: 'l' },
  { name: 'Remera XL', category: 'remeras' as const, price: 3500, stock: 0, cost: 1500, size: 'xl' },
  { name: 'Remera 2XL', category: 'remeras' as const, price: 4000, stock: 0, cost: 1700, size: '2xl' },
  { name: 'Remera 3XL', category: 'remeras' as const, price: 4000, stock: 0, cost: 1700, size: '3xl' },
  
  // Totebags
  { name: 'Totebag Chica', category: 'totebags' as const, price: 4000, stock: 0, cost: 1800, size: 'chica' },
  { name: 'Totebag Grande', category: 'totebags' as const, price: 4500, stock: 0, cost: 2100, size: 'grande' },
  
  // Stickers (el costo se calcula al imprimir la plancha)
  { name: 'Sticker Chico', category: 'stickers' as const, price: 300, stock: 0, cost: 0, size: 'chico' },
  { name: 'Sticker Grande', category: 'stickers' as const, price: 500, stock: 0, cost: 0, size: 'grande' }
];

// Función para resetear la base de datos
export async function resetDatabase() {
  // Limpiar todas las tablas (localStorage y KV)
  await db.clearAllTables();
  
  console.log('Base de datos reseteada');
  
  // Reinicializar costos fijos (se hace automáticamente al instanciar db)
  // pero como borramos todo, necesitamos forzar la reinicialización
  const fixedCosts = [
    { id: 1, name: 'Plancha DTF Textil', cost: 20000, description: 'Costo de plancha DTF para textiles', is_active: true },
    { id: 2, name: 'Bolsas (50 unidades)', cost: 3500, description: 'Paquete de 50 bolsas', is_active: true },
    { id: 3, name: 'Stickers Decoración Bolsa', cost: 1200, description: 'Stickers decorativos para bolsas', is_active: true },
    { id: 4, name: 'Stickers "Gracias por su compra"', cost: 1200, description: 'Stickers de agradecimiento', is_active: true }
  ];
  
  try {
    await (db as any).setTable('fixed_costs', fixedCosts);
  } catch (error) {
    localStorage.setItem('fixed_costs', JSON.stringify(fixedCosts));
  }
  
  // Agregar productos nuevos
  for (const product of sampleProducts) {
    await db.addProduct(product);
  }
  
  console.log('Productos agregados:', sampleProducts.length);
}

// Función para inicializar datos (mantener compatibilidad)
export async function initializeSampleData() {
  const existingProducts = await db.getProducts();
  
  if (existingProducts.length === 0) {
    await resetDatabase();
  } else {
    console.log('La base de datos ya contiene productos.');
  }
}