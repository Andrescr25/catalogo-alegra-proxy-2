import { dbData } from './db.js';

class StateManager {
    constructor() {
        this.products = [];
        this.visibleProducts = [];
        this.hiddenProducts = new Set(JSON.parse(localStorage.getItem('hiddenProducts') || '[]'));
        this.categories = new Map();
        this.isAdminMode = false;
        this.isLoading = false;
        this.isSyncing = false;
    }

    async loadFromDB() {
        const products = await dbData.getAllProducts();
        if (products.length > 0) {
            this.setProducts(products);
            return true;
        }
        return false;
    }

    setProducts(products) {
        this.products = products;
        this.visibleProducts = [...products];
        this.organizeByCategories();
    }

    organizeByCategories() {
        this.categories.clear();
        const sorted = [...this.visibleProducts].sort((a, b) => a.name.localeCompare(b.name));
        
        sorted.forEach(product => {
            const categoryName = product.itemCategory?.name || 'Sin Categoría';
            if (!this.categories.has(categoryName)) {
                this.categories.set(categoryName, []);
            }
            this.categories.get(categoryName).push(product);
        });

        this.categories = new Map([...this.categories.entries()].sort());
    }

    toggleHidden(productId) {
        if (this.hiddenProducts.has(productId)) {
            this.hiddenProducts.delete(productId);
        } else {
            this.hiddenProducts.add(productId);
        }
        localStorage.setItem('hiddenProducts', JSON.stringify([...this.hiddenProducts]));
    }

    resetHidden() {
        this.hiddenProducts.clear();
        localStorage.removeItem('hiddenProducts');
    }
}

export const state = new StateManager();
