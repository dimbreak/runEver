import { useMemo, useState } from 'react';
import EcommerceLayout from '../components/flows/EcommerceLayout';

type Product = {
  id: string;
  name: string;
  price: string;
  description: string;
};

export default function EcommercePage() {
  const products = useMemo<Product[]>(
    () => [
      {
        id: 'prod-01',
        name: 'Workspace starter kit',
        price: '$48',
        description: 'Desk-ready essentials for focused collaboration.'
      },
      {
        id: 'prod-02',
        name: 'Creator bundle',
        price: '$72',
        description: 'Capture, record, and share campaign-ready assets.'
      },
      {
        id: 'prod-03',
        name: 'Ops toolkit',
        price: '$64',
        description: 'Automations, checklists, and reporting templates.'
      },
      {
        id: 'prod-04',
        name: 'Growth lab',
        price: '$90',
        description: 'Experiment libraries and analytics packs.'
      }
    ],
    []
  );
  const [activeProduct, setActiveProduct] = useState<Product | undefined>();
  const [isBasketOpen, setIsBasketOpen] = useState(false);

  return (
    <EcommerceLayout
      products={products}
      activeProduct={activeProduct}
      isBasketOpen={isBasketOpen}
      onSelectProduct={(product) => setActiveProduct(product)}
      onCloseProduct={() => setActiveProduct(undefined)}
      onOpenBasket={() => {
        setIsBasketOpen(true);
        setActiveProduct(undefined);
      }}
      onCloseBasket={() => setIsBasketOpen(false)}
    />
  );
}
