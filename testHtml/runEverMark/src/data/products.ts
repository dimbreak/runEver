export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  stock: number;
};

const categories = ['Home', 'Garden', 'Tech', 'Travel', 'Office', 'Wellness'];

function makeProduct(index: number): Product {
  const category = categories[index % categories.length];
  const base = 12 + (index % 10) * 4;
  const price = Number((base + index * 0.8).toFixed(2));
  const rating = Number((3 + (index % 3) * 0.5 + (index % 5) * 0.1).toFixed(1));
  return {
    id: `sku-${index + 1}`,
    name: `${category} Item ${index + 1}`,
    category,
    price,
    rating,
    stock: 8 + (index % 20)
  };
}

export const productCatalog: Product[] = Array.from({ length: 120 }, (_, index) =>
  makeProduct(index)
);

export const productCategories = categories;
