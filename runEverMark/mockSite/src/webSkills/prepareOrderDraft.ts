import { productCatalog } from '../data/products';
import type { PosPrepareOrderInput } from './posPrepareOrderSkill';

export type PosDraftOrderLine = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export type PosDraftOrder = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  city: string;
  region: string;
  postal: string;
  deliveryDate: string;
  supportingDoc: string;
  remark?: string;
  lines: PosDraftOrderLine[];
};

export function createDraftOrderFromSkillInput(
  input: PosPrepareOrderInput,
): PosDraftOrder {
  return {
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientPhone: input.clientPhone,
    address: input.address,
    city: input.city,
    region: input.region,
    postal: input.postal,
    deliveryDate: input.deliveryDate,
    supportingDoc: '',
    remark: input.remark ?? '',
    lines: normalizeSkillLines(input.lines),
  };
}

export function normalizeSkillLines(skillLines: PosPrepareOrderInput['lines']) {
  return skillLines.map((line, index) => {
    const product = resolveSkillProduct(line);
    if (!product) {
      throw new Error(
        `Could not resolve product "${line.productId ?? line.productName}".`,
      );
    }

    return {
      id: `skill-line-${Date.now()}-${index}`,
      productId: product.id,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? product.price,
      discount: line.discount ?? 0,
    };
  });
}

export function calculateOrderTotal(orderLines: PosDraftOrderLine[]) {
  return orderLines.reduce((sum, line) => {
    const base = line.unitPrice * line.quantity;
    return sum + base - (base * line.discount) / 100;
  }, 0);
}

function resolveSkillProduct(line: PosPrepareOrderInput['lines'][number]) {
  if (line.productId) {
    return productCatalog.find((product) => product.id === line.productId);
  }

  const normalizedName = line.productName?.trim().toLowerCase();
  return productCatalog.find(
    (product) => product.name.trim().toLowerCase() === normalizedName,
  );
}
