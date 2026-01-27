export namespace CommonUtil {
  export const replaceJsTpl = (
    tpl: string,
    args: Record<string, string>,
  ): string => {
    if (tpl.includes('${')) {
      let js = tpl;
      if (tpl[0] !== '`') {
        js = `\`${js}\``;
      }

      // Identify keys with dots or dashes and replace them in the template
      // We sort by length (descending) so that longer matches (e.g. "a.b.c") are replaced before shorter prefixes ("a.b")
      const complexKeys = Object.keys(args)
        .filter((k) => k.includes('.') || k.includes('-'))
        .sort((a, b) => b.length - a.length);

      const escapeRx = /[.*+?^${}()|[\]\\]/g;

      for (const key of complexKeys) {
        // Replace ${args.foo.bar} with ${args['foo.bar']}
        // We look for patterns where 'args.' is followed by the key, ensuring we don't break if it's already bracketed (though unlikely given usage)
        // handling cases like ${args.foo.bar}
        // We escape the key for regex usage just in case
        const escapedKey = key.replace(escapeRx, '\\$&');
        // this regex matches "args." followed by the key, checking boundaries to avoid partial replacements if needed,
        // but simplistic replacement of `args.${key}` -> `args['${key}']` is the goal.
        // However, we must be careful about what comes after.
        // e.g. ${args.foo.bar.baz} where key is foo.bar -> ${args['foo.bar'].baz} which is valid.
        // e.g. ${args.foo.bar} -> ${args['foo.bar']}

        // A global replace for `args.KEY` -> `args['KEY']`
        // We use a regex to ensure it matches `args.` literal.
        const regex = new RegExp(`args\\.${escapedKey}`, 'g');
        js = js.replace(regex, `args['${key}']`);
      }

      // Filter keys for valid identifiers for destructuring
      // Valid JS identifiers generally start with [a-zA-Z_$] and contain [a-zA-Z0-9_$]
      // We simply exclude keys with dots or non-identifier characters for the destructuring part.
      // Complex keys (dots or dashes) are now accessed via args['key'] so they don't need to be destructured as variables.
      const validKeys = Object.keys(args).filter((k) =>
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k),
      );

      // todo run in iframe sandbox
      // eslint-disable-next-line no-eval
      return eval(`((args)=>{
    const window = undefined, document = undefined, process = undefined;
    const {${validKeys.join(',')}} = args;
    return ${js};
    })(${JSON.stringify(args)})`) as string;
    }
    return tpl;
  };
  export const flattenArgs = (
    obj: Record<string, any>,
    prefix = '',
    res: Record<string, string> = {},
  ) => {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'object' && val !== null) {
          flattenArgs(val, newKey, res);
        } else {
          res[newKey] = String(val);
        }
      }
    }
    return res;
  };
}
