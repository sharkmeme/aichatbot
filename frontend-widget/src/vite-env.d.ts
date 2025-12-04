/// <reference types="vite/client" />

// Type declaration for CSS imports with ?inline suffix
declare module '*.css?inline' {
  const content: string;
  export default content;
}
