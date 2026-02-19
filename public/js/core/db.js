export class CatalogDB {
    constructor() {
        this.dbName = 'CatalogoAlegraDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async connect() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('❌ Error abriendo DB:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('📦 Base de datos conectada');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', { keyPath: 'id' });
                    productStore.createIndex('status', 'status', { unique: false });
                    productStore.createIndex('category', 'itemCategory.name', { unique: false });
                    productStore.createIndex('name', 'name', { unique: false });
                }

                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'name' });
                }
            };
        });
    }

    async saveProducts(products) {
        if (!this.db) await this.connect();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['products'], 'readwrite');
            const store = transaction.objectStore('products');

            transaction.oncomplete = () => resolve(products.length);
            transaction.onerror = (event) => reject(event.target.error);

            products.forEach(product => {
                if (product && product.id) {
                    store.put(product);
                }
            });
        });
    }

    async getAllProducts() {
        if (!this.db) await this.connect();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['products'], 'readonly');
            const store = transaction.objectStore('products');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async clearProducts() {
        if (!this.db) await this.connect();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['products', 'categories'], 'readwrite');
            transaction.objectStore('products').clear();
            transaction.objectStore('categories').clear();

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }

    async saveLastUpdate() {
        if (!this.db) await this.connect();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readwrite');
            const store = transaction.objectStore('metadata');
            store.put({ key: 'lastUpdate', value: new Date().toISOString() });
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e);
        });
    }

    async getLastUpdate() {
        if (!this.db) await this.connect();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const request = store.get('lastUpdate');

            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = (e) => reject(e);
        });
    }
}

export const dbData = new CatalogDB();
