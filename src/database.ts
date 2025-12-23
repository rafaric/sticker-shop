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
  advance_payment: number; // 50% del total
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
  reservation_id?: number; // Si viene de una reserva
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
  private getNextId(table: string): number {
    const data = this.getTable(table);
    return data.length > 0 ? Math.max(...data.map((item: any) => item.id)) + 1 : 1;
  }

  private getTable(table: string): any[] {
    const data = localStorage.getItem(table);
    return data ? JSON.parse(data) : [];
  }

  private setTable(table: string, data: any[]): void {
    localStorage.setItem(table, JSON.stringify(data));
  }

  constructor() {
    this.initializeFixedCosts();
  }

  // Products
  getProducts(): Product[] {
    return this.getTable('products').sort((a, b) => a.name.localeCompare(b.name));
  }

  addProduct(product: Omit<Product, 'id' | 'created_at'>): number {
    const products = this.getTable('products');
    const id = this.getNextId('products');
    const newProduct = {
      ...product,
      id,
      created_at: new Date().toISOString()
    };
    products.push(newProduct);
    this.setTable('products', products);
    return id;
  }

  updateProduct(productId: number, updates: Partial<Product>): void {
    const products = this.getTable('products');
    const index = products.findIndex(p => p.id === productId);
    if (index !== -1) {
      products[index] = { ...products[index], ...updates };
      this.setTable('products', products);
    }
  }

  // Reservations
  getReservations(): Reservation[] {
    return this.getTable('reservations').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  addReservation(reservation: Omit<Reservation, 'id' | 'date'>): number {
    const reservations = this.getTable('reservations');
    const id = this.getNextId('reservations');
    const newReservation = {
      ...reservation,
      id,
      date: new Date().toISOString()
    };
    reservations.push(newReservation);
    this.setTable('reservations', reservations);
    return id;
  }

  completeReservation(reservationId: number): boolean {
    const reservations = this.getTable('reservations');
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (!reservation || reservation.status !== 'pending') return false;
    
    reservation.status = 'completed';
    this.setTable('reservations', reservations);
    
    // Create sale
    const remainingAmount = reservation.total - reservation.advance_payment;
    const products = this.getTable('products');
    const product = products.find(p => p.id === reservation.product_id);
    
    if (product) {
      this.addSale({
        product_id: reservation.product_id,
        quantity: reservation.quantity,
        unit_price: reservation.unit_price,
        unit_cost: product.cost,
        total: remainingAmount,
        reservation_id: reservationId
      });
    }
    
    return true;
  }

  // Sales
  getSales(): Sale[] {
    return this.getTable('sales').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  addSale(sale: Omit<Sale, 'id' | 'date'>): number {
    const sales = this.getTable('sales');
    const id = this.getNextId('sales');
    const newSale = {
      ...sale,
      id,
      date: new Date().toISOString()
    };
    sales.push(newSale);
    this.setTable('sales', sales);

    // Update stock for all sales
    const products = this.getTable('products');
    const productIndex = products.findIndex(p => p.id === sale.product_id);
    if (productIndex !== -1) {
      products[productIndex].stock -= sale.quantity;
      this.setTable('products', products);
    }

    return id;
  }

  // Purchases
  getPurchases(): Purchase[] {
    return this.getTable('purchases').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  addPurchase(purchase: Omit<Purchase, 'id' | 'date'>): number {
    const purchases = this.getTable('purchases');
    const id = this.getNextId('purchases');
    const newPurchase = {
      ...purchase,
      id,
      date: new Date().toISOString()
    };
    purchases.push(newPurchase);
    this.setTable('purchases', purchases);

    // Update stock
    const products = this.getTable('products');
    const productIndex = products.findIndex(p => p.id === purchase.product_id);
    if (productIndex !== -1) {
      products[productIndex].stock += purchase.quantity;
      this.setTable('products', products);
    }

    return id;
  }

  // Printing Plates
  getPrintingPlates(): PrintingPlate[] {
    return this.getTable('printing_plates').sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime());
  }

  createPrintingPlate(name: string, smallQuantity: number, largeQuantity: number): number {
    const plates = this.getTable('printing_plates');
    const id = this.getNextId('printing_plates');
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
    this.setTable('printing_plates', plates);
    return id;
  }

  printPlate(plateId: number): boolean {
    const plates = this.getTable('printing_plates');
    const plate = plates.find(p => p.id === plateId);
    
    if (!plate || plate.is_printed) return false;
    
    plate.is_printed = true;
    plate.date_printed = new Date().toISOString();
    this.setTable('printing_plates', plates);
    
    // Add stock to sticker products
    const products = this.getTable('products');
    const smallStickers = products.filter(p => p.category === 'stickers' && p.name.includes('Chico'));
    const largeStickers = products.filter(p => p.category === 'stickers' && p.name.includes('Grande'));
    
    smallStickers.forEach(sticker => {
      sticker.stock += Math.floor(plate.small_stickers_quantity / smallStickers.length);
    });
    
    largeStickers.forEach(sticker => {
      sticker.stock += Math.floor(plate.large_stickers_quantity / largeStickers.length);
    });
    
    this.setTable('products', products);
    return true;
  }

  // Fixed Costs
  private initializeFixedCosts() {
    const existingCosts = this.getTable('fixed_costs');
    
    if (existingCosts.length === 0) {
      const fixedCosts = [
        { id: 1, name: 'Plancha DTF Textil', cost: 20000, description: 'Costo de plancha DTF para textiles', is_active: true },
        { id: 2, name: 'Bolsas (50 unidades)', cost: 3500, description: 'Paquete de 50 bolsas', is_active: true },
        { id: 3, name: 'Stickers Decoración Bolsa', cost: 1200, description: 'Stickers decorativos para bolsas', is_active: true },
        { id: 4, name: 'Stickers "Gracias por su compra"', cost: 1200, description: 'Stickers de agradecimiento', is_active: true }
      ];
      
      this.setTable('fixed_costs', fixedCosts);
    }
  }

  getFixedCosts(): FixedCost[] {
    return this.getTable('fixed_costs');
  }

  updateFixedCost(id: number, cost: number): void {
    const costs = this.getTable('fixed_costs');
    const index = costs.findIndex(c => c.id === id);
    if (index !== -1) {
      costs[index].cost = cost;
      this.setTable('fixed_costs', costs);
    }
  }

  addFixedCostEntry(fixedCostId: number, description?: string): number {
    const fixedCosts = this.getTable('fixed_costs');
    const fixedCost = fixedCosts.find(fc => fc.id === fixedCostId);
    
    if (!fixedCost) return 0;
    
    const entries = this.getTable('fixed_cost_entries');
    const id = this.getNextId('fixed_cost_entries');
    
    entries.push({
      id,
      fixed_cost_id: fixedCostId,
      cost_applied: fixedCost.cost,
      date: new Date().toISOString(),
      description: description || null
    });
    
    this.setTable('fixed_cost_entries', entries);
    return id;
  }

  getFixedCostEntries(): any[] {
    const entries = this.getTable('fixed_cost_entries');
    const costs = this.getTable('fixed_costs');
    
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
  getSalesReport() {
    const sales = this.getTable('sales');
    const products = this.getTable('products');
    
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
      avg_price: item.prices.reduce((sum, price) => sum + price, 0) / item.prices.length
    })).sort((a: any, b: any) => b.total_revenue - a.total_revenue);
  }

  getStockReport() {
    return this.getTable('products').map(product => ({
      ...product,
      stock_value: product.stock * product.cost
    })).sort((a, b) => a.stock - b.stock);
  }

  // Helper methods
  getShirtCostByQuantity(basePrice: number, quantity: number): number {
    switch (quantity) {
      case 1: return basePrice;
      case 3: return basePrice * 0.85;
      case 10: return basePrice * 0.75;
      default: return basePrice;
    }
  }

  getTotebagCostBySize(size: string): number {
    switch (size) {
      case '40x40': return 2100;
      case '30x40': return 1800;
      default: return 2100;
    }
  }
}

export const db = new DatabaseManager();