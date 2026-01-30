import { CommonUtil } from '../utils/common';

describe('CommonUtil', () => {
  describe('replaceJsTpl', () => {
    it('should replace nested properties', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const tpl = 'Hello ${args.order.customerName}';
      const args = {
        'order.customerName': 'Alice',
      };
      const result = CommonUtil.replaceJsTpl(tpl, args);
      expect(result).toBe('Hello Alice');
    });

    it('should replace dash properties', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const tpl = 'Hello ${args.order-customerName}';
      const args = {
        'order-customerName': 'Alice',
      };
      const result = CommonUtil.replaceJsTpl(tpl, args);
      expect(result).toBe('Hello Alice');
    });

    it('should handle simple replacements', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const tpl = 'Hello ${args.name}';
      const args = { name: 'Bob' };
      const result = CommonUtil.replaceJsTpl(tpl, args);
      expect(result).toBe('Hello Bob');
    });

    it('should return original string if no template syntax', () => {
      expect(CommonUtil.replaceJsTpl('Hello World', {})).toBe('Hello World');
    });
  });
});
