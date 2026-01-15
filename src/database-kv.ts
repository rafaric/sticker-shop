import { Redis } from '@upstash/redis';

// Detectar si estamos en producción
const isProduction = typeof window !== 'undefined' && 
  (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');

// Configurar Upstash Redis (funciona en el navegador con HTTP)
let redis: Redis | null = null;

// Inicializar Redis - Vercel proporciona estas variables automáticamente con el plugin de Upstash
// Primero intentamos las variables personalizadas, luego las de Vercel
const redisUrl = import.meta.env.VITE_UPSTASH_REDIS_REST_URL || 
                 import.meta.env.VITE_KV_REST_API_URL;
const redisToken = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN || 
                   import.meta.env.VITE_KV_REST_API_TOKEN;

console.log('🔍 Detectando entorno:', {
  isProduction,
  hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
  hasRedisUrl: !!redisUrl,
  hasRedisToken: !!redisToken,
  redisUrlPrefix: redisUrl ? redisUrl.substring(0, 30) + '...' : 'undefined',
  urlProtocol: redisUrl ? new URL(redisUrl).protocol : 'N/A'
});

if (redisUrl && redisToken) {
  // Verificar que la URL sea HTTPS (REST API)
  if (!redisUrl.startsWith('https://')) {
    console.error('❌ URL de Redis incorrecta. Debe comenzar con https://, recibido:', redisUrl);
    console.warn('⚠️ Usando solo localStorage');
  } else {
    try {
      redis = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      console.log('✅ Upstash Redis inicializado correctamente');
    } catch (error) {
      console.error('❌ Error al conectar Redis:', error);
    }
  }
} else {
  console.warn('⚠️ Variables de Redis no encontradas, usando solo localStorage');
}

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  cost: number;
  size?: string;
  // dimensiones en mm (opcional) para calcular costos por área
  width_mm?: number;
  height_mm?: number;
  area_mm2?: number;
  created_at: string;
}

export interface Reservation {
  id: number;
  product_id: number;
  customer_name: string;
  design_motif?: string;
  quantity: number;
  unit_price: number;
  advance_payment: number;
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
  date: string;
}

export interface Sale {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total: number;
  reservation_id?: number;
  date: string;
}

export interface Purchase {
  id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  total: number;
  date: string;
}

export interface PrintingPlate {
  id: number;
  name: string;
  cost: number;
  small_stickers_quantity: number;
  large_stickers_quantity: number;
  // cantidades por tamaño (p. ej. { "30x30": 20, "40x60": 10, "chico": 30 })
  stickers_quantities?: Record<string, number>;
  is_printed: boolean;
  date_created: string;
  date_printed?: string;
}

export interface FixedCost {
  id: number;
  name: string;
  cost: number;
  description: string;
  is_active: boolean;
}

class DatabaseManager {
  constructor() {
    this.initializeFixedCosts();
  }

  private async getNextId(table: string): Promise<number> {
    const data = await this.getTable(table);
    return data.length > 0 ? Math.max(...data.map((item: any) => item.id)) + 1 : 1;
  }

  private async getTable(table: string): Promise<any[]> {
    if (!redis) {
      console.error('❌ Redis no está configurado');
      return [];
    }

    try {
      console.log(`📖 Leyendo de Redis: ${table}`);
      const data = await redis.get<any[]>(table);
      if (data && Array.isArray(data)) {
        console.log(`✅ Datos leídos de Redis (${table}):`, data.length, 'items');
        return data;
      }
      console.log(`ℹ️ No hay datos en Redis para ${table}`);
      return [];
    } catch (error) {
      console.error(`❌ Error al leer de Redis (${table}):`, error);
      return [];
    }
  }

  private async setTable(table: string, data: any[]): Promise<void> {
    if (!redis) {
      console.error('❌ Redis no está configurado, no se pueden guardar datos');
      throw new Error('Redis no está configurado');
    }

    try {
      console.log(`💾 Guardando en Redis: ${table} (${data.length} items)`);
      
      // Intentar guardar con retry
      let retries = 3;
      let saved = false;
      
      while (retries > 0 && !saved) {
        try {
          const result = await redis.set(table, data);
          saved = true;
          console.log(`✅ Guardado exitoso en Redis: ${table}`, { result });
        } catch (retryError) {
          retries--;
          if (retries === 0) {
            throw retryError;
          }
          console.warn(`⚠️ Error al guardar (${table}), reintentando... (${retries} intentos restantes)`, retryError);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error(`❌ Error FINAL al guardar en Redis (${table}):`, error);
      throw error;
    }
  }

  // Products
  async getProducts(): Promise<Product[]> {
    const products = await this.getTable('products');
    return products.sort((a, b) => a.name.localeCompare(b.name));
  }

  async addProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<number> {
    const products = await this.getTable('products');
    const id = await this.getNextId('products');
    const newProduct = {
      ...product,
      id,
      created_at: new Date().toISOString()
    };
    products.push(newProduct);
    await this.setTable('products', products);
    return id;
  }

  async updateProduct(productId: number, updates: Partial<Product>): Promise<void> {
    const products = await this.getTable('products');
    const index = products.findIndex(p => p.id === productId);
    if (index !== -1) {
      products[index] = { ...products[index], ...updates };
      await this.setTable('products', products);
    }
  }

  // Reservations
  async getReservations(): Promise<Reservation[]> {
    const reservations = await this.getTable('reservations');
    return reservations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async addReservation(reservation: Omit<Reservation, 'id' | 'date'>): Promise<number> {
    const reservations = await this.getTable('reservations');
    const id = await this.getNextId('reservations');
    const newReservation = {
      ...reservation,
      id,
      date: new Date().toISOString()
    };
    reservations.push(newReservation);
    await this.setTable('reservations', reservations);
    return id;
  }

  async completeReservation(reservationId: number): Promise<boolean> {
    const reservations = await this.getTable('reservations');
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (!reservation || reservation.status !== 'pending') return false;
    
    reservation.status = 'completed';
    await this.setTable('reservations', reservations);
    
    const products = await this.getTable('products');
    const product = products.find(p => p.id === reservation.product_id);
    
    if (product) {
      await this.addSale({
        product_id: reservation.product_id,
        quantity: reservation.quantity,
        unit_price: reservation.unit_price,
        unit_cost: product.cost,
        total: reservation.total,
        reservation_id: reservationId
      });
    }
    
    return true;
  }

  async cancelReservation(reservationId: number): Promise<boolean> {
    const reservations = await this.getTable('reservations');
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (!reservation || reservation.status !== 'pending') return false;
    
    reservation.status = 'cancelled';
    await this.setTable('reservations', reservations);
    
    // Si la reserva tenía seña, registrarla como ingreso (sin devolución)
    if (reservation.advance_payment > 0) {
      const products = await this.getTable('products');
      const product = products.find(p => p.id === reservation.product_id);
      
      if (product) {
        // Registrar la seña como venta (ingreso no reembolsable)
        await this.addSale({
          product_id: reservation.product_id,
          quantity: 0, // 0 unidades porque es una seña retenida
          unit_price: 0,
          unit_cost: 0,
          total: reservation.advance_payment,
          reservation_id: reservationId
        });
      }
    }
    
    return true;
  }

  // Sales
  async getSales(): Promise<Sale[]> {
    const sales = await this.getTable('sales');
    return sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async addSale(sale: Omit<Sale, 'id' | 'date'>): Promise<number> {
    const sales = await this.getTable('sales');
    const id = await this.getNextId('sales');
    const newSale = {
      ...sale,
      id,
      date: new Date().toISOString()
    };
    sales.push(newSale);
    await this.setTable('sales', sales);

    const products = await this.getTable('products');
    const productIndex = products.findIndex(p => p.id === sale.product_id);
    if (productIndex !== -1) {
      products[productIndex].stock -= sale.quantity;
      await this.setTable('products', products);
    }

    return id;
  }

  // Purchases
  async getPurchases(): Promise<Purchase[]> {
    const purchases = await this.getTable('purchases');
    return purchases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async addPurchase(purchase: Omit<Purchase, 'id' | 'date'>): Promise<number> {
    const purchases = await this.getTable('purchases');
    const id = await this.getNextId('purchases');
    const newPurchase = {
      ...purchase,
      id,
      date: new Date().toISOString()
    };
    purchases.push(newPurchase);
    await this.setTable('purchases', purchases);

    const products = await this.getTable('products');
    const productIndex = products.findIndex(p => p.id === purchase.product_id);
    if (productIndex !== -1) {
      const prod = products[productIndex];
      const prevStock = prod.stock || 0;
      const prevCost = prod.cost || 0;
      const addedQty = purchase.quantity || 0;
      const addedUnitCost = purchase.unit_cost || 0;

      if (prevStock > 0) {
        const combinedCost = prevStock * prevCost + addedQty * addedUnitCost;
        const combinedQty = prevStock + addedQty;
        prod.cost = combinedQty > 0 ? combinedCost / combinedQty : prevCost;
      } else {
        prod.cost = addedUnitCost;
      }

      prod.stock = prevStock + addedQty;
      await this.setTable('products', products);
    }

    return id;
  }

  // Printing Plates
  async getPrintingPlates(): Promise<PrintingPlate[]> {
    const plates = await this.getTable('printing_plates');
    return plates.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());
  }

  async createPrintingPlate(name: string, smallQuantityOrMap: number | Record<string, number>, largeQuantity?: number, cost?: number): Promise<number> {
    const plates = await this.getTable('printing_plates');
    const id = await this.getNextId('printing_plates');

    let stickers_quantities: Record<string, number> = {};
    if (typeof smallQuantityOrMap === 'number') {
      stickers_quantities = { chico: smallQuantityOrMap || 0, grande: largeQuantity || 0 };
    } else {
      stickers_quantities = smallQuantityOrMap || {};
    }

    const newPlate = {
      id,
      name,
      cost: typeof cost === 'number' ? cost : 18500,
      small_stickers_quantity: stickers_quantities['chico'] || 0,
      large_stickers_quantity: stickers_quantities['grande'] || 0,
      stickers_quantities,
      is_printed: false,
      date_created: new Date().toISOString()
    };
    plates.push(newPlate);
    await this.setTable('printing_plates', plates);
    return id;
  }

  async printPlate(plateId: number): Promise<boolean> {
    const plates = await this.getTable('printing_plates');
    const plate = plates.find(p => p.id === plateId);
    
    if (!plate || plate.is_printed) return false;
    
    plate.is_printed = true;
    plate.date_printed = new Date().toISOString();
    await this.setTable('printing_plates', plates);
    
    const products = await this.getTable('products');

    // Distribución de cantidades por tamaño (prefiere el mapa flexible si existe)
    const countsBySize: Record<string, number> = plate.stickers_quantities || {
      chico: plate.small_stickers_quantity || 0,
      grande: plate.large_stickers_quantity || 0
    };

    // Agrupar productos por tamaño
    const productsBySize: Record<string, any[]> = {};
    products.filter(p => p.category === 'stickers').forEach(p => {
      const key = p.size || 'unknown';
      productsBySize[key] = productsBySize[key] || [];
      productsBySize[key].push(p);
    });

    // Determinar área por unidad por tamaño (igual que la previsualización)
    const defaults = { small_mm: 50, large_mm: 100 };
    const areaPerSize: Record<string, number | undefined> = {};
    for (const sizeKey of Object.keys(countsBySize)) {
      let areaUnit: number | undefined = undefined;
      const items = productsBySize[sizeKey] || [];
      if (items.length > 0) {
        const itemWithArea = items.find(it => it.area_mm2 || (it.width_mm && it.height_mm));
        if (itemWithArea) areaUnit = itemWithArea.area_mm2 ?? (itemWithArea.width_mm && itemWithArea.height_mm ? itemWithArea.width_mm * itemWithArea.height_mm : undefined);
      }

      if (!areaUnit) {
        if (String(sizeKey).toLowerCase() === 'chico') areaUnit = defaults.small_mm * defaults.small_mm;
        else if (String(sizeKey).toLowerCase() === 'grande') areaUnit = defaults.large_mm * defaults.large_mm;
        else {
          const m = String(sizeKey).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
          if (m) {
            const w = parseFloat(m[1]);
            const h = parseFloat(m[2]);
            areaUnit = w * h;
          }
        }
      }
      areaPerSize[sizeKey] = areaUnit;
    }

    // Calcular totalArea usando la cantidad total por tamaño
    let totalCount = 0;
    let totalArea = 0;
    const perProductAssign: Array<{ product: any; qty: number; area?: number }> = [];

    for (const sizeKey of Object.keys(countsBySize)) {
      const qtyForSize = countsBySize[sizeKey] || 0;
      let items = productsBySize[sizeKey] || [];

      if (items.length === 0 && qtyForSize > 0) {
        const newId = await this.getNextId('products');
        let width_mm: number | undefined = undefined;
        let height_mm: number | undefined = undefined;
        let area_mm2: number | undefined = undefined;

        const m = String(sizeKey).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
        if (m) {
          width_mm = parseFloat(m[1]);
          height_mm = parseFloat(m[2]);
          area_mm2 = width_mm * height_mm;
        }

        const newProduct = {
          id: newId,
          name: `Sticker ${sizeKey}`,
          category: 'stickers',
          price: 0,
          stock: 0,
          cost: 0,
          size: sizeKey,
          width_mm,
          height_mm,
          area_mm2,
          created_at: new Date().toISOString()
        } as any;

        products.push(newProduct);
        productsBySize[sizeKey] = [newProduct];
        items = productsBySize[sizeKey];
      }

      const unitArea = areaPerSize[sizeKey];
      if (unitArea) totalArea += unitArea * qtyForSize;
      totalCount += qtyForSize;

      const base = items.length > 0 ? Math.floor(qtyForSize / items.length) : 0;
      let remainder = items.length > 0 ? qtyForSize - base * items.length : 0;

      items.forEach(item => {
        let area = item.area_mm2 ?? (item.width_mm && item.height_mm ? item.width_mm * item.height_mm : undefined);
        if (!area) area = unitArea;
        const assignQty = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        perProductAssign.push({ product: item, qty: assignQty, area });
      });
    }

    if (totalArea > 0) {
      const costPerArea = plate.cost / totalArea;
      perProductAssign.forEach(({ product, qty, area }) => {
        const assignedUnitCost = area ? costPerArea * area : plate.cost / Math.max(1, totalCount);
        const prevStock = product.stock || 0;
        const prevCost = product.cost || 0;
        product.stock += qty;
        if (prevStock > 0) {
          product.cost = (prevStock * prevCost + qty * assignedUnitCost) / (prevStock + qty);
        } else {
          product.cost = assignedUnitCost;
        }
      });
    } else {
      const costPerSticker = totalCount > 0 ? plate.cost / totalCount : 0;
      perProductAssign.forEach(({ product, qty }) => {
        const assignedUnitCost = costPerSticker;
        const prevStock = product.stock || 0;
        const prevCost = product.cost || 0;
        product.stock += qty;
        if (prevStock > 0) {
          product.cost = (prevStock * prevCost + qty * assignedUnitCost) / (prevStock + qty);
        } else {
          product.cost = assignedUnitCost;
        }
      });
    }
    
    await this.setTable('products', products);
    return true;
  }

  // Preview de la impresión: calcula la asignación y el costo por sticker sin persistir cambios
  async previewPrintingPlate(plateId: number): Promise<any> {
    const plates = await this.getTable('printing_plates');
    const plate = plates.find(p => p.id === plateId);
    if (!plate) return null;

    const products = await this.getTable('products');

    const countsBySize: Record<string, number> = plate.stickers_quantities || {
      chico: plate.small_stickers_quantity || 0,
      grande: plate.large_stickers_quantity || 0
    };

    // Agrupar productos por tamaño
    const productsBySize: Record<string, any[]> = {};
    products.filter(p => p.category === 'stickers').forEach(p => {
      const key = p.size || 'unknown';
      productsBySize[key] = productsBySize[key] || [];
      productsBySize[key].push(p);
    });

    // Determinar área por tamaño (en mm)
    const defaults = { small_mm: 50, large_mm: 100 };

    const sizesInfo: Array<{ sizeKey: string; qty: number; area_mm2?: number; products: any[] }> = [];

    for (const sizeKey of Object.keys(countsBySize)) {
      const qty = countsBySize[sizeKey] || 0;
      let areaPerUnit: number | undefined = undefined;

      // Buscar un producto existente con área
      const items = productsBySize[sizeKey] || [];
      if (items.length > 0) {
        const itemWithArea = items.find(it => it.area_mm2 || (it.width_mm && it.height_mm));
        if (itemWithArea) {
          areaPerUnit = itemWithArea.area_mm2 ?? (itemWithArea.width_mm && itemWithArea.height_mm ? itemWithArea.width_mm * itemWithArea.height_mm : undefined);
        }
      }

      // Si no hay área y la clave es 'chico'/'grande', usar default
      if (!areaPerUnit) {
        if (String(sizeKey).toLowerCase() === 'chico') areaPerUnit = defaults.small_mm * defaults.small_mm;
        else if (String(sizeKey).toLowerCase() === 'grande') areaPerUnit = defaults.large_mm * defaults.large_mm;
        else {
          // intentar parsear formato '50x30' (mm)
          const m = String(sizeKey).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i);
          if (m) {
            const w = parseFloat(m[1]);
            const h = parseFloat(m[2]);
            areaPerUnit = w * h;
          }
        }
      }

      sizesInfo.push({ sizeKey, qty, area_mm2: areaPerUnit, products: items });
    }

    // Calcular total de área
    const totalArea = sizesInfo.reduce((s, it) => s + ((it.area_mm2 || 0) * it.qty), 0);

    const resultItems: any[] = [];

    if (totalArea > 0) {
      const costPerArea = plate.cost / totalArea;
      for (const it of sizesInfo) {
        const unitArea = it.area_mm2 || 0;
        const unitCost = unitArea > 0 ? costPerArea * unitArea : 0;
        resultItems.push({ sizeKey: it.sizeKey, qty: it.qty, unitArea, unitCost, totalCost: unitCost * it.qty, products: it.products });
      }
    } else {
      const totalCount = sizesInfo.reduce((s, it) => s + it.qty, 0);
      const costPerSticker = totalCount > 0 ? plate.cost / totalCount : 0;
      for (const it of sizesInfo) {
        resultItems.push({ sizeKey: it.sizeKey, qty: it.qty, unitArea: it.area_mm2, unitCost: costPerSticker, totalCost: costPerSticker * it.qty, products: it.products });
      }
    }

    return {
      plate: { id: plate.id, name: plate.name, cost: plate.cost },
      items: resultItems,
      totalCost: plate.cost
    };
  }

  async deletePrintingPlate(plateId: number): Promise<boolean> {
    const plates = await this.getTable('printing_plates');
    const index = plates.findIndex((p: any) => p.id === plateId);
    if (index === -1) return false;
    const plate = plates[index];
    if (plate.is_printed) return false;
    plates.splice(index, 1);
    await this.setTable('printing_plates', plates);
    return true;
  }

  // Fixed Costs
  private async initializeFixedCosts() {
    const existingCosts = await this.getTable('fixed_costs');
    
    if (existingCosts.length === 0) {
      const fixedCosts = [
        { id: 1, name: 'Plancha DTF Textil', cost: 20000, description: 'Costo de plancha DTF para textiles', is_active: true },
        { id: 2, name: 'Bolsas (50 unidades)', cost: 3500, description: 'Paquete de 50 bolsas', is_active: true },
        { id: 3, name: 'Stickers Decoración Bolsa', cost: 1200, description: 'Stickers decorativos para bolsas', is_active: true },
        { id: 4, name: 'Stickers "Gracias por su compra"', cost: 1200, description: 'Stickers de agradecimiento', is_active: true }
      ];
      
      await this.setTable('fixed_costs', fixedCosts);
    }
  }

  async getFixedCosts(): Promise<FixedCost[]> {
    return await this.getTable('fixed_costs');
  }

  async updateFixedCost(id: number, cost: number): Promise<void> {
    const costs = await this.getTable('fixed_costs');
    const index = costs.findIndex(c => c.id === id);
    if (index !== -1) {
      costs[index].cost = cost;
      await this.setTable('fixed_costs', costs);
    }
  }

  async addFixedCostEntry(fixedCostId: number, description?: string): Promise<number> {
    const fixedCosts = await this.getTable('fixed_costs');
    const fixedCost = fixedCosts.find(fc => fc.id === fixedCostId);
    
    if (!fixedCost) return 0;
    
    const entries = await this.getTable('fixed_cost_entries');
    const id = await this.getNextId('fixed_cost_entries');
    
    entries.push({
      id,
      fixed_cost_id: fixedCostId,
      cost_applied: fixedCost.cost,
      date: new Date().toISOString(),
      description: description || null
    });
    
    await this.setTable('fixed_cost_entries', entries);
    return id;
  }

  async getFixedCostEntries(): Promise<any[]> {
    const entries = await this.getTable('fixed_cost_entries');
    const costs = await this.getTable('fixed_costs');
    
    return entries.map(entry => {
      const cost = costs.find(c => c.id === entry.fixed_cost_id);
      return {
        ...entry,
        cost_name: cost?.name || 'Costo eliminado',
        cost_description: cost?.description
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Reports
  async getSalesReport() {
    const sales = await this.getTable('sales');
    const products = await this.getTable('products');
    
    const report = {};
    
    sales.forEach(sale => {
      const product = products.find(p => p.id === sale.product_id);
      if (!product) return;
      
      if (!report[product.id]) {
        report[product.id] = {
          name: product.name,
          category: product.category,
          total_sold: 0,
          total_revenue: 0,
          prices: []
        };
      }
      
      report[product.id].total_sold += sale.quantity;
      report[product.id].total_revenue += sale.total;
      report[product.id].prices.push(sale.unit_price);
    });
    
    return Object.values(report).map((item: any) => ({
      ...item,
      avg_price: item.prices.reduce((sum: number, price: number) => sum + price, 0) / item.prices.length
    })).sort((a: any, b: any) => b.total_revenue - a.total_revenue);
  }

  async getStockReport() {
    const products = await this.getTable('products');
    return products.map(product => ({
      ...product,
      stock_value: product.stock * product.cost
    })).sort((a, b) => a.stock - b.stock);
  }

  // Método para limpiar todas las tablas
  async clearAllTables(): Promise<void> {
    if (!redis) {
      console.error('❌ Redis no está configurado');
      return;
    }

    const tables = ['products', 'sales', 'purchases', 'reservations', 'printing_plates', 'fixed_costs', 'fixed_cost_entries'];
    
    console.log('🗑️ Limpiando todas las tablas de Redis...');
    for (const table of tables) {
      try {
        await redis.del(table);
        console.log(`✅ Tabla ${table} eliminada`);
      } catch (error) {
        console.error(`❌ Error al borrar ${table} de Redis:`, error);
      }
    }
    
    console.log('✅ Todas las tablas han sido limpiadas de Redis');
  }
}

export const db = new DatabaseManager();