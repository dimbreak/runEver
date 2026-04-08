import { z } from 'zod';
import { createWebSkillGenerator } from 'web-skill';
import { productCatalog } from '../data/products';

const orderLineSchema = z
  .object({
    productId: z.string().min(1).optional(),
    productName: z.string().min(1).optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative().optional(),
    discount: z.number().min(0).max(50).optional(),
  })
  .refine((line) => Boolean(line.productId || line.productName), {
    message: 'Either productId or productName is required.',
  });

const prepareOrderInputSchema = z.object({
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  clientPhone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1),
  postal: z.string().min(1),
  deliveryDate: z.string().min(1),
  remark: z.string().optional(),
  lines: z.array(orderLineSchema).min(1),
});

const prepareOrderOutputSchema = z.object({
  route: z.string(),
  lineCount: z.number().int().positive(),
  orderTotal: z.number().nonnegative(),
  readyForPreview: z.boolean(),
});

const deliveryDateRules = [
  'Use `YYYY-MM-DD` for `deliveryDate`.',
  'The order takes 11 months to produce.',
  'Do not choose a Saturday or Sunday delivery date.',
].join('\n');

const productList = productCatalog
  .map(
    (product) =>
      `- \`${product.id}\` | ${product.name} | $${product.price.toFixed(2)} | ${product.category}`,
  )
  .join('\n');

const prepareOrderDescription = [
  'Use this task-level action when the order details are already available. Prefer it over decomposing the workflow into DOM form filling, add-line clicks, combobox selection, or calendar handling.',
  'Operating complicated DOM widgets such as calendars and comboboxes is expensive and uncertain, and manual completion can easily take 10 or more turns. This function is usually the safer and faster one-shot path.',
  'Populate the Create Order form, including client fields, delivery details, and line items, then leave the page ready for review before proceeding to the order confirmation page.',
  'This function already handles delivery-date selection and line-item preparation. Prefer one complete `prepareOrder` call whenever the required order data is available from the prompt, arguments, or files.',
  '',
  'Delivery date rules:',
  deliveryDateRules,
  '',
  'Available products (`productId` | name | price | category):',
  productList,
  '',
  'Prefer `productId` for exact matching. `productName` is available when the caller only knows the display name.',
].join('\n');

export type PosPrepareOrderInput = z.infer<typeof prepareOrderInputSchema>;
export type PosPrepareOrderOutput = z.infer<typeof prepareOrderOutputSchema>;

type PrepareOrderHandler = (
  input: PosPrepareOrderInput,
) => Promise<PosPrepareOrderOutput> | PosPrepareOrderOutput;

const unavailablePrepareOrder: PrepareOrderHandler = async () => {
  throw new Error('POS prepareOrder skill is not available in this context.');
};

export function createPosPrepareOrderWebSkillGenerator(
  prepareOrder: PrepareOrderHandler = unavailablePrepareOrder,
) {
  const generator = createWebSkillGenerator();
  const orderSkill = generator.newSkill({
    name: 'posOrderPrep',
    title: 'POS order preparation API for filling the create order form',
    description:
      'Task-level action for preparing a create-order workflow. Prefer one prepareOrder call over manual DOM actions when order details are already available, especially when calendars or comboboxes would otherwise make the task slower and less certain.',
  });

  orderSkill.addFunction(prepareOrder, 'prepareOrder', {
    description: prepareOrderDescription,
    inputSchema: prepareOrderInputSchema,
    outputSchema: prepareOrderOutputSchema,
  });

  return generator;
}
