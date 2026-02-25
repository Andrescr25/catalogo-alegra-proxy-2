import React from 'react';
import { ProductCard } from './ProductCard';

export const CategorySection = ({ title, products }) => {
    if (!products || products.length === 0) return null;

    return (
        <div className="category-section">
            <div className="category-header">
                <h2 className="category-title">{title}</h2>
                <span className="category-count">{products.length} productos</span>
            </div>
            <div className="products-grid">
                {products.map(product => (
                    <ProductCard key={product.id} product={product} />
                ))}
            </div>
        </div>
    );
};
