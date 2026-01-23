export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  stock: number;
  reviewCount: number;
  deliveryDate: string;
  isPrime: boolean;
  isBestSeller: boolean;
  originalPrice?: number;
};

const categories = ['Home', 'Garden', 'Tech', 'Travel', 'Office', 'Wellness'];

function makeProduct(index: number): Product {
  const category = categories[index % categories.length];
  const base = 12 + (index % 10) * 4;
  const price = Number((base + index * 0.8).toFixed(2));
  const rating = Number((3 + (index % 3) * 0.5 + (index % 5) * 0.1).toFixed(1));

  // Amazon-like dummy data generation
  const isPrime = index % 3 !== 0; // 2/3 items are Prime
  const isBestSeller = index % 15 === 0;
  const reviewCount = (index * 43 + 12) % 5000;

  // Future dates for delivery
  const today = new Date();
  const deliveryDays = index % 5;
  const deliveryDateObj = new Date(today);
  deliveryDateObj.setDate(today.getDate() + (isPrime ? 1 : 3) + deliveryDays);
  const deliveryDate = deliveryDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const hasDiscount = index % 4 === 0;
  const originalPrice = hasDiscount ? Number((price * 1.25).toFixed(2)) : undefined;

  if (index === 0) {
      return {
          id: 'sku-chair',
          name: 'Desk Chair',
          category: 'Office',
          price: 350.00,
          rating: 4.5,
          stock: 20,
          reviewCount: 150,
          deliveryDate,
          isPrime: true,
          isBestSeller: false
      };
  }
  if (index === 1) {
      return {
          id: 'sku-keyboard',
          name: 'Keyboard',
          category: 'Tech',
          price: 80.00,
          rating: 3.5,
          stock: 50,
          reviewCount: 200,
          deliveryDate,
          isPrime: true,
          isBestSeller: true
      };
  }
  if (index === 2) {
      return {
          id: 'sku-laptop',
          name: 'Laptop Pro',
          category: 'Tech',
          price: 1200.00,
          rating: 4.9,
          stock: 10,
          reviewCount: 89,
          deliveryDate,
          isPrime: true,
          isBestSeller: true
      };
  }

  return {
    id: `sku-${index + 1}`,
    name: `${category} Item ${index + 1}`, // Slightly longer name
    category,
    price,
    rating,
    stock: 8 + (index % 20),
    reviewCount,
    deliveryDate,
    isPrime,
    isBestSeller,
    originalPrice
  };
}

export const productCatalog: Product[] = Array.from({ length: 120 }, (_, index) =>
  makeProduct(index)
);

export const productCategories = categories;
