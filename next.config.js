/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF/Excel libraries read data files from their own folders at runtime
  // (fontkit tries, AFM metrics); bundling breaks those paths, so Node loads
  // them from node_modules instead.
  serverExternalPackages: ["pdfmake", "exceljs"],
};
module.exports = nextConfig;
