import { Redis } from '@upstash/redis';

// Detectar si estamos en producción
const isProduction = typeof window !== 'undefined' && 
  (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');

// Configurar Upstash Redis (funciona en el navegador con HTTP)
let redis: Redis | null = null;

// Inicializar Redis si hay variables de entorno
const redisUrl = import.meta.env.VITE_UPSTASH_REDIS_REST_URL;
const redisToken = import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN;

if (redisUrl && redisToken && isProduction) {
  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('Upstash Redis conectado');
  } catch (error) {
    console.warn('Error al conectar Redis, usando localStorage:', error);
  }
}

export interface Product {
  id: number;
  name: string;
  category: 'remeras' | 'totebags' | 'stickers';
  price: number;
  stock: number;
  cost: number;
  size?: string;
  created_at: string;
}

export interface Reservation {
  id: number;
  product_id: number;
  customer_name: string;
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
  private async getNextId(table: string): Promise<number> {
    const data = await this.getTable(table);
    return data.length > 0 ? Math.max(...data.map((item: any) => item.id)) + 1 : 1;
  }

  private async getTable(table: string): Promise<any[]> {
    try {
      // Intentar usar Upstash Redis en producción
      if (redis && isProduction) {
        const data = await redis.get<any[]>(table);
        if (data) {
          return Array.isArray(data) ? data : [];
        }
      }
    } catch (error) {
      console.warn(`Error al leer de Redis (${table}):`, error);
    }
    
    // Fallback a localStorage
    const localData = localStorage.getItem(table);
    return localData ? JSON.parse(localData) : [];
  }

  private async setTable(table: string, data: any[]): Promise<void> {
    // Siempre guardar en localStorage como backup
    localStorage.setItem(table, JSON.stringify(data));
    
    try {
      // Guardar en Upstash Redis en producción
      if (redis && isProduction) {
        await redis.set(table, data);
      }
    } catch (error) {
      console.warn(`Error al guardar en Redis (${table}):`, error);
    }
  }

  constructor() {
    this.initializeFixedCosts();
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
      products[productIndex].stock += purchase.quantity;
      await this.setTable('products', products);
    }

    return id;
  }

  // Printing Plates
  async getPrintingPlates(): Promise<PrintingPlate[]> {
    const plates = await this.getTable('printing_plates');
    return plates.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());
  }

  async createPrintingPlate(name: string, smallQuantity: number, largeQuantity: number): Promise<number> {
    const plates = await this.getTable('printing_plates');
    const id = await this.getNextId('printing_plates');
    const newPlate = {
      id,
      name,
      cost: 18000,
      small_stickers_quantity: smallQuantity,
      large_stickers_quantity: largeQuantity,
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
    const smallStickers = products.filter(p => p.category === 'stickers' && p.name.includes('Chico'));
    const largeStickers = products.filter(p => p.category === 'stickers' && p.name.includes('Grande'));
    
    // Calcular costo por sticker basado en el costo de la plancha
    const totalStickers = plate.small_stickers_quantity + plate.large_stickers_quantity;
    const costPerSticker = totalStickers > 0 ? plate.cost / totalStickers : 0;
    
    smallStickers.forEach(sticker => {
      const stockToAdd = Math.floor(plate.small_stickers_quantity / smallStickers.length);
      sticker.stock += stockToAdd;
      // Actualizar el costo unitario del sticker
      sticker.cost = costPerSticker;
    });
    
    largeStickers.forEach(sticker => {
      const stockToAdd = Math.floor(plate.large_stickers_quantity / largeStickers.length);
      sticker.stock += stockToAdd;
      // Actualizar el costo unitario del sticker
      sticker.cost = costPerSticker;
    });
    
    await this.setTable('products', products);
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
    const tables = ['products', 'sales', 'purchases', 'reservations', 'printing_plates', 'fixed_costs', 'fixed_cost_entries'];
    
    for (const table of tables) {
      localStorage.removeItem(table);
      
      try {
        // Borrar de Redis en producción
        if (redis && isProduction) {
          await redis.del(table);
        }
      } catch (error) {
        console.warn(`Error al borrar de Redis (${table}):`, error);
      }
    }
    
    console.log('Todas las tablas han sido limpiadas');
  }
}

export const db = new DatabaseManager();