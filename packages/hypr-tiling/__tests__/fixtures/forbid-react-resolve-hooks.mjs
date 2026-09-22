// Node module-customization hooks (registered by import-engine-without-react.mjs)
// that make every `react` / `react-dom` specifier UNRESOLVABLE. Loading
// `dist/engine.mjs` under these hooks proves the engine entry evaluates without
// React present — the situation in a react-server layer where `react` resolves
// to a build with no `createContext`.

const REACT_SPECIFIER = /^react(-dom)?(\/.*)?$/;

export async function resolve(specifier, context, nextResolve) {
  if (REACT_SPECIFIER.test(specifier)) {
    throw new Error(
      `engine-entry-react-free: "${specifier}" was imported from ${context.parentURL ?? "<unknown>"} — the ./engine entry must not import React.`,
    );
  }
  return nextResolve(specifier, context);
}
