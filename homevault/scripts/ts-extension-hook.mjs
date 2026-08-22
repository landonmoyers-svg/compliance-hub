// Dev-only ESM resolve hook: lets `node --test` load the app's extensionless
// relative imports (idiomatic for the Next.js bundler) by trying a `.ts`
// specifier first. Not used by the app build — only by `npm test`.
import { register } from "node:module";

register(
  new URL("data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('.') && !/\\.[cm]?[jt]sx?$/i.test(specifier)) {
          try { return await nextResolve(specifier + '.ts', context); } catch {}
        }
        return nextResolve(specifier, context);
      }
    `)),
  import.meta.url,
);
