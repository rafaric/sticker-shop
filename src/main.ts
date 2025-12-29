import './style.css';
import { db } from './database-kv';
import { resetDatabase, initializeSampleData } from './sample-data';

// Simple toast implementation
const toast = {
  success: (message: string) => showToast(message, 'success'),
  error: (message: string) => showToast(message, 'error')
};

function showToast(message: string, type: 'success' | 'error') {
  const toastEl = document.createElement('div');
  toastEl.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 transition-all transform translate-x-0 ${
    type === 'success' ? 'bg-green-500' : 'bg-red-500'
  }`;
  toastEl.textContent = message;
  document.body.appendChild(toastEl);
  
  // Fade in
  setTimeout(() => {
    toastEl.style.opacity = '1';
  }, 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(100%)';
    setTimeout(() => {
      document.body.removeChild(toastEl);
    }, 300);
  }, 3000);
}

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  cost: number;
  size?: string;
  created_at: string;
};

type Sale = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total: number;
  date: string;
};

type Purchase = {
  id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  total: number;
  date: string;
};

class App {
  private currentView: string = 'products';
  private products: Product[] = [];
  private reservations: any[] = [];
  private sales: Sale[] = [];
  private purchases: Purchase[] = [];
  private printingPlates: any[] = [];
  private fixedCosts: any[] = [];
  private fixedCostEntries: any[] = [];
  private salesReport: any[] = [];
  private stockReport: any[] = [];
  private editingProduct: Product | null = null;

  constructor() {
    this.initializeApp();
  }

  private async initializeApp() {
    // Solo permitir reset manual con ?reset en la URL
    const shouldReset = new URLSearchParams(window.location.search).has('reset');
    
    if (shouldReset) {
      console.log('🔄 Reset manual solicitado');
      await resetDatabase();
      // Recargar sin el parámetro reset
      window.location.href = window.location.pathname;
      return;
    }
    
    // Cargar datos existentes o inicializar si es completamente nuevo
    await initializeSampleData();
    await this.loadData();
    this.render();
    this.setupEventListeners();
  }

  private async loadData() {
    this.products = await db.getProducts();
    this.reservations = await db.getReservations();
    this.sales = await db.getSales();
    this.purchases = await db.getPurchases();
    this.printingPlates = await db.getPrintingPlates();
    this.fixedCosts = await db.getFixedCosts();
    this.fixedCostEntries = await db.getFixedCostEntries();
    this.salesReport = await db.getSalesReport();
    this.stockReport = await db.getStockReport();
  }

  private setupEventListeners() {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      if (target.dataset.view) {
        this.currentView = target.dataset.view;
        this.render();
      }
      
      if (target.dataset.action) {
        this.handleAction(target.dataset.action, target);
      }
    });

    document.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      if (form.dataset.form) {
        this.handleFormSubmit(form.dataset.form, new FormData(form));
      }
    });
  }

  private async handleAction(action: string, element: HTMLElement) {
    switch (action) {
      case 'sell':
        await this.sellProduct(parseInt(element.dataset.productId!));
        break;
      case 'buy':
        await this.buyProduct(parseInt(element.dataset.productId!));
        break;
      case 'print-plate':
        await this.printPlate(parseInt(element.dataset.plateId!));
        break;
      case 'complete-reservation':
        await this.completeReservation(parseInt(element.dataset.reservationId!));
        break;
      case 'cancel-reservation':
        await this.cancelReservation(parseInt(element.dataset.reservationId!));
        break;
      case 'edit-product':
        this.editProduct(parseInt(element.dataset.productId!));
        break;
      case 'cancel-edit':
        this.cancelEdit();
        break;
    }
  }

  private async handleFormSubmit(formType: string, formData: FormData) {
    switch (formType) {
      case 'add-product':
        await this.addProduct(formData);
        break;
      case 'add-reservation':
        await this.addReservation(formData);
        break;
      case 'add-sale':
        await this.addSale(formData);
        break;
      case 'add-purchase':
        await this.addPurchase(formData);
        break;
      case 'create-plate':
        await this.createPlate(formData);
        break;
      case 'apply-fixed-cost':
        await this.applyFixedCost(formData);
        break;
      case 'update-fixed-cost':
        await this.updateFixedCost(formData);
        break;
      case 'update-product':
        await this.updateProduct(formData);
        break;
    }
  }

  private async addProduct(formData: FormData) {
    const category = (formData.get('category') as string).toLowerCase().trim();
    const cost = parseFloat(formData.get('cost') as string);
    const size = formData.get('size') as string;
    
    const product = {
      name: formData.get('name') as string,
      category,
      price: parseFloat(formData.get('price') as string),
      stock: parseInt(formData.get('stock') as string),
      cost,
      size: size || undefined
    };
    
    await db.addProduct(product);
    toast.success('Producto agregado exitosamente');
    await this.loadData();
    this.render();
  }

  private async addReservation(formData: FormData) {
    const productId = parseInt(formData.get('product_id') as string);
    const customerName = formData.get('customer_name') as string;
    const designMotif = formData.get('design_motif') as string;
    const quantity = parseInt(formData.get('quantity') as string);
    const unitPrice = parseFloat(formData.get('unit_price') as string);
    const paymentType = formData.get('payment_type') as string;
    const total = quantity * unitPrice;
    
    let advancePayment = 0;
    let paymentLabel = '';
    
    switch(paymentType) {
      case 'no_advance':
        advancePayment = 0;
        paymentLabel = 'sin seña';
        break;
      case 'advance':
        advancePayment = total * 0.5;
        paymentLabel = 'con seña (50%)';
        break;
      case 'full':
        advancePayment = total;
        paymentLabel = 'pago completo';
        break;
    }
    
    await db.addReservation({
      product_id: productId,
      customer_name: customerName,
      design_motif: designMotif || undefined,
      quantity,
      unit_price: unitPrice,
      advance_payment: advancePayment,
      total,
      status: 'pending'
    });
    
    toast.success(`Reserva creada exitosamente (${paymentLabel})`);
    await this.loadData();
    this.render();
  }

  private async completeReservation(reservationId: number) {
    const success = await db.completeReservation(reservationId);
    if (success) {
      toast.success('Reserva completada!');
    } else {
      toast.error('No se pudo completar la reserva');
    }
    
    await this.loadData();
    this.render();
  }

  private async cancelReservation(reservationId: number) {
    const success = await db.cancelReservation(reservationId);
    if (success) {
      toast.success('Reserva cancelada');
    } else {
      toast.error('No se pudo cancelar la reserva');
    }
    
    await this.loadData();
    this.render();
  }

  private async addSale(formData: FormData) {
    const productId = parseInt(formData.get('product_id') as string);
    const quantity = parseInt(formData.get('quantity') as string);
    const unitPrice = parseFloat(formData.get('unit_price') as string);
    
    const product = this.products.find(p => p.id === productId);
    if (!product) return;
    
    if (product.stock < quantity) {
      toast.error(`Stock insuficiente. Disponible: ${product.stock}`);
      return;
    }
    
    await db.addSale({
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      unit_cost: product.cost,
      total: quantity * unitPrice
    });
    
    toast.success('Venta registrada exitosamente');
    await this.loadData();
    this.render();
  }

  private async addPurchase(formData: FormData) {
    const productId = parseInt(formData.get('product_id') as string);
    const quantity = parseInt(formData.get('quantity') as string);
    const unitCost = parseFloat(formData.get('unit_cost') as string);
    
    await db.addPurchase({
      product_id: productId,
      quantity,
      unit_cost: unitCost,
      total: quantity * unitCost
    });
    
    toast.success('Compra registrada exitosamente');
    await this.loadData();
    this.render();
  }

  private async sellProduct(productId: number) {
    const product = this.products.find(p => p.id === productId);
    if (product && product.stock > 0) {
      await db.addSale({
        product_id: productId,
        quantity: 1,
        unit_price: product.price,
        unit_cost: product.cost,
        total: product.price
      });
      toast.success('Venta rápida registrada');
      await this.loadData();
      this.render();
    } else {
      toast.error('Producto sin stock disponible');
    }
  }

  private async buyProduct(productId: number) {
    const product = this.products.find(p => p.id === productId);
    if (product) {
      await db.addPurchase({
        product_id: productId,
        quantity: 1,
        unit_cost: product.cost,
        total: product.cost
      });
      toast.success('Compra rápida registrada');
      await this.loadData();
      this.render();
    }
  }

  private async createPlate(formData: FormData) {
    const name = formData.get('name') as string;
    const smallQuantity = parseInt(formData.get('small_quantity') as string) || 0;
    const largeQuantity = parseInt(formData.get('large_quantity') as string) || 0;
    
    await db.createPrintingPlate(name, smallQuantity, largeQuantity);
    toast.success('Plancha creada exitosamente');
    await this.loadData();
    this.render();
  }

  private async printPlate(plateId: number) {
    const success = await db.printPlate(plateId);
    if (success) {
      toast.success('Plancha impresa exitosamente! El stock se ha actualizado.');
    } else {
      toast.error('No se pudo imprimir la plancha.');
    }
    
    await this.loadData();
    this.render();
  }

  private async applyFixedCost(formData: FormData) {
    const fixedCostId = parseInt(formData.get('fixed_cost_id') as string);
    const description = formData.get('description') as string;
    
    await db.addFixedCostEntry(fixedCostId, description);
    toast.success('Costo fijo aplicado exitosamente');
    await this.loadData();
    this.render();
  }

  private async updateFixedCost(formData: FormData) {
    const costId = parseInt(formData.get('cost_id') as string);
    const newCost = parseFloat(formData.get('new_cost') as string);
    
    await db.updateFixedCost(costId, newCost);
    toast.success('Costo fijo actualizado exitosamente');
    await this.loadData();
    this.render();
  }

  private editProduct(productId: number) {
    this.editingProduct = this.products.find(p => p.id === productId) || null;
    this.render();
  }

  private cancelEdit() {
    this.editingProduct = null;
    this.render();
  }

  private async updateProduct(formData: FormData) {
    if (!this.editingProduct) return;
    
    const updates = {
      name: formData.get('name') as string,
      category: (formData.get('category') as string).toLowerCase().trim(),
      price: parseFloat(formData.get('price') as string),
      cost: parseFloat(formData.get('cost') as string),
      size: formData.get('size') as string || undefined
    };
    
    await db.updateProduct(this.editingProduct.id, updates);
    this.editingProduct = null;
    toast.success('Producto actualizado exitosamente');
    await this.loadData();
    this.render();
  }

  private render() {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <div class="min-h-screen bg-gray-50">
        ${this.renderNavigation()}
        <main class="container mx-auto px-4 py-8">
          ${this.renderCurrentView()}
        </main>
      </div>
    `;
    
    // Setup autocomplete for price fields
    this.setupPriceAutocomplete();
  }

  private setupPriceAutocomplete() {
    // Autocomplete para reservas
    const reservationProduct = document.getElementById('reservation-product') as HTMLSelectElement;
    const reservationPrice = document.getElementById('reservation-price') as HTMLInputElement;
    
    if (reservationProduct && reservationPrice) {
      reservationProduct.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;
        const selectedOption = select.options[select.selectedIndex];
        const price = selectedOption.dataset.price;
        if (price) {
          reservationPrice.value = price;
        }
      });
    }
    
    // Autocomplete para ventas
    const saleProduct = document.getElementById('sale-product') as HTMLSelectElement;
    const salePrice = document.getElementById('sale-price') as HTMLInputElement;
    
    if (saleProduct && salePrice) {
      saleProduct.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;
        const selectedOption = select.options[select.selectedIndex];
        const price = selectedOption.dataset.price;
        if (price) {
          salePrice.value = price;
        }
      });
    }
    
    // Autocomplete para compras
    const purchaseProduct = document.getElementById('purchase-product') as HTMLSelectElement;
    const purchaseCost = document.getElementById('purchase-cost') as HTMLInputElement;
    
    if (purchaseProduct && purchaseCost) {
      purchaseProduct.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;
        const selectedOption = select.options[select.selectedIndex];
        const cost = selectedOption.dataset.cost;
        if (cost) {
          purchaseCost.value = cost;
        }
      });
    }
  }

  private renderNavigation() {
    return `
      <nav class="bg-white shadow-sm border-b">
        <div class="container mx-auto px-4">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center space-x-3">
              <img src="/mandarinaLogo.jpeg" alt="Mandarina Store" class="h-10 w-10 rounded-full object-cover">
              <h1 class="text-xl font-bold text-orange-600">Mandarina Store</h1>
            </div>
            <div class="flex space-x-4">
              <button data-view="products" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'products' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Productos
              </button>
              <button data-view="plates" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'plates' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Planchas
              </button>
              <button data-view="reservations" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'reservations' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Reservas
              </button>
              <button data-view="sales" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'sales' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Ventas
              </button>
              <button data-view="purchases" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'purchases' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Compras
              </button>
              <button data-view="costs" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'costs' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Costos Fijos
              </button>
              <button data-view="reports" class="flex items-center px-3 py-2 rounded-md text-sm font-medium ${this.currentView === 'reports' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-orange-600'}">
                Reportes
              </button>
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  private renderCurrentView() {
    switch (this.currentView) {
      case 'products':
        return this.renderProducts();
      case 'plates':
        return this.renderPlates();
      case 'reservations':
        return this.renderReservations();
      case 'sales':
        return this.renderSales();
      case 'purchases':
        return this.renderPurchases();
      case 'costs':
        return this.renderFixedCosts();
      case 'reports':
        return this.renderReports();
      default:
        return this.renderProducts();
    }
  }

  private renderProducts() {
    return `
      <div class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">${this.editingProduct ? 'Editar Producto' : 'Agregar Producto'}</h2>
          <form data-form="${this.editingProduct ? 'update-product' : 'add-product'}" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" name="name" value="${this.editingProduct?.name || ''}" required class="border rounded-md px-3 py-2 w-full">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <input 
                  type="text" 
                  name="category" 
                  value="${this.editingProduct?.category || ''}" 
                  list="categories-list" 
                  required 
                  placeholder="Seleccionar o escribir nueva"
                  class="border rounded-md px-3 py-2 w-full">
                <datalist id="categories-list">
                  ${[...new Set(this.products.map(p => p.category))].sort().map(cat => `
                    <option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  `).join('')}
                </datalist>
              </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-${this.editingProduct ? '4' : '3'} gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                <input type="number" name="price" value="${this.editingProduct?.price || ''}" step="0.01" required class="border rounded-md px-3 py-2 w-full">
              </div>
              ${!this.editingProduct ? `
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Stock inicial</label>
                  <input type="number" name="stock" required class="border rounded-md px-3 py-2 w-full">
                </div>
              ` : ''}
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Costo</label>
                <input type="number" name="cost" value="${this.editingProduct?.cost || ''}" step="0.01" required class="border rounded-md px-3 py-2 w-full">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Talle/Tamaño</label>
                <input type="text" name="size" value="${this.editingProduct?.size || ''}" class="border rounded-md px-3 py-2 w-full">
              </div>
            </div>
            
            <div class="flex gap-2">
              <button type="submit" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 flex-1">
                ${this.editingProduct ? 'Actualizar Producto' : 'Agregar Producto'}
              </button>
              ${this.editingProduct ? '<button type="button" data-action="cancel-edit" class="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600">Cancelar</button>' : ''}
            </div>
          </form>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Productos</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${this.products.map(product => `
                  <tr class="${this.editingProduct?.id === product.id ? 'bg-blue-50' : ''}">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${product.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        product.category === 'stickers' ? 'bg-orange-100 text-orange-800' :
                        product.category === 'totebags' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }">
                        ${product.category.charAt(0).toUpperCase() + product.category.slice(1)}
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${product.price.toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        product.stock > 10 ? 'bg-green-100 text-green-800' :
                        product.stock > 0 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }">
                        ${product.stock}
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${product.cost.toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button data-action="edit-product" data-product-id="${product.id}" 
                              class="text-orange-600 hover:text-orange-900">
                        Editar
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderReservations() {
    return `
      <div class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Nueva Reserva</h2>
          <form data-form="add-reservation" class="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Producto</label>
              <select name="product_id" id="reservation-product" required class="border rounded-md px-3 py-2 pr-10 w-full">
                <option value="">Seleccionar producto</option>
                ${this.products.map(product => `
                  <option value="${product.id}" data-price="${product.price}">${product.name} - $${product.price}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <input type="text" name="customer_name" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Motivo del estampado</label>
              <input type="text" name="design_motif" placeholder="Ej: Logo, texto, imagen..." class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
              <input type="number" name="quantity" min="1" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Precio unitario</label>
              <input type="number" name="unit_price" id="reservation-price" step="0.01" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de pago</label>
              <select name="payment_type" required class="border rounded-md px-3 py-2 pr-10 w-full">
                <option value="no_advance">Sin seña</option>
                <option value="advance" selected>Con seña (50%)</option>
                <option value="full">Pago completo</option>
              </select>
            </div>
            <div class="flex items-end">
              <button type="submit" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 w-full">
                Crear Reserva
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Reservas</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adelanto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${this.reservations.map(reservation => {
                  const product = this.products.find(p => p.id === reservation.product_id);
                  const remaining = reservation.total - reservation.advance_payment;
                  const isFullPayment = reservation.advance_payment === reservation.total;
                  return `
                    <tr>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${reservation.customer_name}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${product?.name || 'Producto eliminado'}
                      </td>
                      <td class="px-6 py-4 text-sm text-gray-500">
                        ${reservation.design_motif || '-'}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${reservation.total.toFixed(2)}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm">
                        ${reservation.advance_payment === 0 ? 
                          '<span class="font-medium text-gray-400">Sin seña</span>' :
                          `<span class="font-medium ${isFullPayment ? 'text-blue-600' : 'text-green-600'}">
                            $${reservation.advance_payment.toFixed(2)}
                          </span>
                          ${isFullPayment ? 
                            '<span class="ml-1 text-xs text-blue-600">(Completo)</span>' : 
                            `<span class="ml-1 text-xs text-gray-500">(Resta: $${remaining.toFixed(2)})</span>`
                          }`
                        }
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          reservation.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          reservation.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }">
                          ${reservation.status === 'completed' ? 'Completada' : 
                            reservation.status === 'cancelled' ? 'Cancelada' : 
                            'Pendiente'}
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        ${reservation.status === 'pending' ? `
                          <div class="flex gap-2">
                            <button data-action="complete-reservation" data-reservation-id="${reservation.id}" 
                                    class="text-green-600 hover:text-green-900">
                              ${isFullPayment ? 'Marcar como entregada' : reservation.advance_payment === 0 ? `Completar ($${reservation.total.toFixed(2)})` : `Completar ($${remaining.toFixed(2)})`}
                            </button>
                            <button data-action="cancel-reservation" data-reservation-id="${reservation.id}" 
                                    class="text-red-600 hover:text-red-900">
                              Cancelar
                            </button>
                          </div>
                        ` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderPlates() {
    // Calculate stickers needed for pending reservations
    const stickersNeeded = { small: 0, large: 0 };
    this.reservations.filter(r => r.status === 'pending').forEach(reservation => {
      const product = this.products.find(p => p.id === reservation.product_id);
      if (product && product.category === 'stickers') {
        if (product.name.includes('Chico')) {
          stickersNeeded.small += reservation.quantity;
        } else if (product.name.includes('Grande')) {
          stickersNeeded.large += reservation.quantity;
        }
      }
    });

    // Calculate current stock
    const currentStock = { small: 0, large: 0 };
    this.products.filter(p => p.category === 'stickers').forEach(product => {
      if (product.name.includes('Chico')) {
        currentStock.small += product.stock;
      } else if (product.name.includes('Grande')) {
        currentStock.large += product.stock;
      }
    });

    const smallPending = Math.max(0, stickersNeeded.small - currentStock.small);
    const largePending = Math.max(0, stickersNeeded.large - currentStock.large);
    const hasPendingStickers = smallPending > 0 || largePending > 0;

    return `
      <div class="space-y-6">
        ${hasPendingStickers ? `
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-yellow-800 mb-3">📋 Stickers Pendientes de Imprimir</h3>
            <div class="grid grid-cols-2 gap-4">
              ${smallPending > 0 ? `
                <div class="bg-white p-3 rounded border">
                  <div class="text-sm text-gray-600">Stickers Chicos</div>
                  <div class="text-lg font-semibold text-yellow-700">${smallPending} pendientes</div>
                </div>
              ` : ''}
              ${largePending > 0 ? `
                <div class="bg-white p-3 rounded border">
                  <div class="text-sm text-gray-600">Stickers Grandes</div>
                  <div class="text-lg font-semibold text-yellow-700">${largePending} pendientes</div>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Crear Nueva Plancha de Impresión</h2>
          <form data-form="create-plate" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nombre de la plancha</label>
              <input type="text" name="name" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Stickers pequeños${smallPending > 0 ? ` (Faltan: ${smallPending})` : ''}</label>
              <input type="number" name="small_quantity" min="0" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Stickers grandes${largePending > 0 ? ` (Faltan: ${largePending})` : ''}</label>
              <input type="number" name="large_quantity" min="0" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div class="flex items-end">
              <button type="submit" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 w-full">
                Crear Plancha
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Planchas de Impresión</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stickers Pequeños</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stickers Grandes</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${this.printingPlates.map(plate => `
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${plate.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${plate.small_stickers_quantity}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${plate.large_stickers_quantity}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        plate.is_printed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }">
                        ${plate.is_printed ? 'Impresa' : 'Pendiente'}
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      ${!plate.is_printed ? `
                        <button data-action="print-plate" data-plate-id="${plate.id}" 
                                class="text-green-600 hover:text-green-900">
                          Imprimir ($18,000)
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderSales() {
    return `
      <div class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Nueva Venta</h2>
          <form data-form="add-sale" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Producto</label>
              <select name="product_id" id="sale-product" required class="border rounded-md px-3 py-2 pr-10 w-full">
                <option value="">Seleccionar producto</option>
                ${this.products.map(product => `
                  <option value="${product.id}" data-price="${product.price}">${product.name} - $${product.price} (Stock: ${product.stock})</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
              <input type="number" name="quantity" min="1" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Precio unitario</label>
              <input type="number" name="unit_price" id="sale-price" step="0.01" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div class="flex items-end">
              <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 w-full">
                Registrar Venta
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Ventas</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${this.sales.map(sale => {
                  const product = this.products.find(p => p.id === sale.product_id);
                  return `
                    <tr>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${product?.name || 'Producto eliminado'}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${sale.quantity}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${sale.unit_price.toFixed(2)}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${sale.total.toFixed(2)}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${new Date(sale.date).toLocaleDateString()}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderPurchases() {
    // Calculate stock needed for pending reservations
    const stockNeeded: Record<number, number> = {};
    this.reservations.filter(r => r.status === 'pending').forEach(reservation => {
      if (!stockNeeded[reservation.product_id]) {
        stockNeeded[reservation.product_id] = 0;
      }
      stockNeeded[reservation.product_id] += reservation.quantity;
    });

    const stockAlerts = this.products.filter(product => {
      const needed = stockNeeded[product.id] || 0;
      return needed > product.stock && product.category !== 'stickers';
    }).map(product => ({
      ...product,
      needed: stockNeeded[product.id],
      missing: stockNeeded[product.id] - product.stock
    }));

    return `
      <div class="space-y-6">
        ${stockAlerts.length > 0 ? `
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-red-800 mb-3">⚠️ Stock Insuficiente para Reservas</h3>
            <div class="space-y-2">
              ${stockAlerts.map(alert => `
                <div class="flex justify-between items-center bg-white p-3 rounded border">
                  <div>
                    <span class="font-medium">${alert.name}</span>
                    <span class="text-sm text-gray-600 ml-2">
                      Stock: ${alert.stock} | Necesario: ${alert.needed} | Faltante: ${alert.missing}
                    </span>
                  </div>
                  <span class="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-medium">
                    Faltan ${alert.missing}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Nueva Compra</h2>
          <form data-form="add-purchase" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Producto</label>
              <select name="product_id" id="purchase-product" required class="border rounded-md pl-3 pr-10 py-2 w-full">
                <option value="">Seleccionar producto</option>
                ${this.products.filter(product => product.category !== 'stickers').map(product => {
                  const needed = stockNeeded[product.id] || 0;
                  const hasAlert = needed > product.stock;
                  return `
                    <option value="${product.id}" data-cost="${product.cost}">
                      ${product.name} - Stock: ${product.stock}${hasAlert ? ` ⚠️ (Falta: ${needed - product.stock})` : ''}
                    </option>
                  `;
                }).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
              <input type="number" name="quantity" min="1" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Costo unitario</label>
              <input type="number" name="unit_cost" id="purchase-cost" step="0.01" required class="border rounded-md px-3 py-2 w-full">
            </div>
            <div class="flex items-end">
              <button type="submit" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 w-full">
                Registrar Compra
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Compras</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${this.purchases.map(purchase => {
                  const product = this.products.find(p => p.id === purchase.product_id);
                  return `
                    <tr>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${product?.name || 'Producto eliminado'}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${purchase.quantity}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${purchase.unit_cost.toFixed(2)}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${purchase.total.toFixed(2)}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${new Date(purchase.date).toLocaleDateString()}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderFixedCosts() {
    return `
      <div class="space-y-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Aplicar Costo Fijo</h2>
          <form data-form="apply-fixed-cost" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Costo fijo</label>
              <select name="fixed_cost_id" required class="border rounded-md px-3 py-2 pr-10 w-full">
                <option value="">Seleccionar costo</option>
                ${this.fixedCosts.map(cost => `
                  <option value="${cost.id}">${cost.name} - $${cost.cost}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
              <input type="text" name="description" class="border rounded-md px-3 py-2 w-full">
            </div>
            <div class="flex items-end">
              <button type="submit" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 w-full">
                Aplicar Costo
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Actualizar Costos Fijos</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${this.fixedCosts.map(cost => `
              <form data-form="update-fixed-cost" class="border rounded-lg p-4">
                <input type="hidden" name="cost_id" value="${cost.id}">
                <div class="mb-2">
                  <label class="block text-sm font-medium text-gray-700">${cost.name}</label>
                  <p class="text-xs text-gray-500">${cost.description}</p>
                </div>
                <div class="flex gap-2">
                  <input type="number" name="new_cost" value="${cost.cost}" step="0.01" required class="border rounded-md px-3 py-2 flex-1">
                  <button type="submit" class="bg-orange-600 text-white px-3 py-2 rounded-md hover:bg-orange-700 text-sm">
                    Actualizar
                  </button>
                </div>
              </form>
            `).join('')}
          </div>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Costos Fijos Aplicados</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${this.fixedCostEntries.map(entry => `
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${entry.cost_name}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${entry.cost_applied.toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${entry.description || '-'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${new Date(entry.date).toLocaleDateString()}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private renderReports() {
    const salesReport = this.salesReport;
    const stockReport = this.stockReport;
    const fixedCostEntries = this.fixedCostEntries;
    
    const totalRevenue = this.sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalCosts = this.purchases.reduce((sum, purchase) => sum + purchase.total, 0);
    const totalFixedCosts = fixedCostEntries.reduce((sum, entry) => sum + entry.cost_applied, 0);
    
    return `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-green-600">Ingresos Totales</h3>
            <p class="text-2xl font-bold">$${totalRevenue.toFixed(2)}</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-red-600">Costos de Productos</h3>
            <p class="text-2xl font-bold">$${totalCosts.toFixed(2)}</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-orange-600">Costos Fijos</h3>
            <p class="text-2xl font-bold">$${totalFixedCosts.toFixed(2)}</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-blue-600">Ganancia Neta</h3>
            <p class="text-2xl font-bold">$${(totalRevenue - totalCosts - totalFixedCosts).toFixed(2)}</p>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Reporte de Ventas por Producto</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad Vendida</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ingresos Totales</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio Promedio</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${salesReport.map(item => `
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.total_sold}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${item.total_revenue.toFixed(2)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${item.avg_price.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Reporte de Stock</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Actual</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor del Stock</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${stockReport.map(item => `
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        item.stock > 10 ? 'bg-green-100 text-green-800' :
                        item.stock > 0 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }">
                        ${item.stock}
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${item.stock_value.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
}

// Initialize the app
new App();