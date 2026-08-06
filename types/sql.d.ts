/** babel-plugin-inline-import turns these into their file contents at build time. */
declare module "*.sql" {
  const content: string;
  export default content;
}
